-- 0004 (faza 4a): igrači bez prijave (nadimak + PIN), kviz dana (18 pitanja, isti za sve), trening po kategoriji.
-- Dan i tjedan računaju se po vremenskoj zoni Europe/Sarajevo.

-- ---------- Igrači ----------
create table igra.igraci (
  id uuid primary key default gen_random_uuid(),   -- tajni ID igrača, čuva ga preglednik; nikad se ne prikazuje drugima
  nadimak text not null,
  nadimak_kljuc text not null unique,              -- za jedinstvenost bez obzira na velika slova i dijakritiku
  pin_sazetak text,                                -- SHA-256 od (id || pin), nikad sam PIN
  pin_pogresnih int not null default 0,
  pin_zakljucan_do timestamptz,
  stvoren timestamptz not null default now()
);
alter table igra.igraci enable row level security;
revoke all on igra.igraci from anon, authenticated;

alter table igra.kvizovi
  add column igrac_id uuid references igra.igraci(id) on delete cascade,
  add column dan date,
  add column kategorija text;
create unique index kvizovi_jedan_dnevni on igra.kvizovi (igrac_id, dan) where vrsta = 'dnevni';
create index kvizovi_igrac on igra.kvizovi (igrac_id, vrsta, dan);

create table igra.dnevni_setovi (
  dan date primary key,
  pitanja text[] not null,
  stvoren timestamptz not null default now()
);
alter table igra.dnevni_setovi enable row level security;
revoke all on igra.dnevni_setovi from anon, authenticated;

create function igra.danas() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'Europe/Sarajevo')::date
$$;

create function igra.nadimak_kljuc(s text) returns text
language sql immutable set search_path = '' as $$
  select replace(igra.normaliziraj(s), ' ', '')
$$;

-- Osnovni filtar neprimjerenih riječi (i s brojkama umjesto slova: 0=o, 1=i, 3=e, 4=a, 5=s, 7=t).
create function igra.neprimjeren(s text) returns boolean
language sql immutable set search_path = '' as $$
  select exists (
    select 1 from unnest(array[
      'kurac','kurc','picka','picko','pizd','jeb','kurv','peder','govn','sranj','drolj','supak','supci',
      'fuck','shit','bitch','cunt','nigg','hitler','nazis','porn','penis','vagin','admin','moderator'
    ]) as r
    where translate(igra.nadimak_kljuc(s), '013457', 'oieast') like '%' || r || '%'
  )
$$;

create function public.novi_igrac(p_nadimak text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare n text := btrim(regexp_replace(coalesce(p_nadimak, ''), '\s+', ' ', 'g')); novi igra.igraci;
begin
  if n !~ '^[A-Za-z0-9ČĆĐŠŽčćđšž _.-]{3,20}$' then
    raise exception 'Nadimak mora imati 3 do 20 znakova: slova, brojke, razmak, točka, crtica.';
  end if;
  if igra.neprimjeren(n) then raise exception 'Taj nadimak nije dopušten. Odaberi drugi.'; end if;
  if exists (select 1 from igra.igraci where nadimak_kljuc = igra.nadimak_kljuc(n)) then
    raise exception 'Taj je nadimak zauzet. Ako je tvoj, prijavi se PIN-om.';
  end if;
  insert into igra.igraci (nadimak, nadimak_kljuc) values (n, igra.nadimak_kljuc(n)) returning * into novi;
  return jsonb_build_object('igracId', novi.id, 'nadimak', novi.nadimak);
exception when unique_violation then
  raise exception 'Taj je nadimak zauzet. Ako je tvoj, prijavi se PIN-om.';
end $$;

create function public.igrac_info(p_igrac uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare i igra.igraci;
begin
  select * into i from igra.igraci where id = p_igrac;
  if not found then raise exception 'Nepoznat igrač.'; end if;
  return jsonb_build_object('nadimak', i.nadimak, 'imaPin', i.pin_sazetak is not null);
end $$;

create function public.postavi_pin(p_igrac uuid, p_pin text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
begin
  if coalesce(p_pin, '') !~ '^[0-9]{4}$' then raise exception 'PIN mora imati točno 4 znamenke.'; end if;
  update igra.igraci
    set pin_sazetak = encode(sha256(convert_to(id::text || p_pin, 'UTF8')), 'hex'), pin_pogresnih = 0, pin_zakljucan_do = null
    where id = p_igrac;
  if not found then raise exception 'Nepoznat igrač.'; end if;
  return true;
end $$;

-- Prijava na drugom uređaju. Nakon 5 pogrešnih pokušaja nadimak je zaključan 15 minuta.
create function public.prijava_pinom(p_nadimak text, p_pin text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare i igra.igraci;
begin
  select * into i from igra.igraci where nadimak_kljuc = igra.nadimak_kljuc(p_nadimak) for update;
  if found and i.pin_zakljucan_do > now() then
    raise exception 'Previše pogrešnih pokušaja. Pokušaj ponovno za 15 minuta.';
  end if;
  if not found or i.pin_sazetak is null or coalesce(p_pin, '') !~ '^[0-9]{4}$'
     or encode(sha256(convert_to(i.id::text || p_pin, 'UTF8')), 'hex') <> i.pin_sazetak then
    if found then
      update igra.igraci set pin_pogresnih = pin_pogresnih + 1,
        pin_zakljucan_do = case when pin_pogresnih + 1 >= 5 then now() + interval '15 minutes' end
        where id = i.id;
    end if;
    perform pg_sleep(0.5);
    return jsonb_build_object('greska', 'Pogrešan nadimak ili PIN.');
  end if;
  update igra.igraci set pin_pogresnih = 0, pin_zakljucan_do = null where id = i.id;
  return jsonb_build_object('igracId', i.id, 'nadimak', i.nadimak);
end $$;

-- ---------- Kviz dana ----------
-- Set za dan: po 2 pitanja iz svake kategorije, različitih tipova kad je moguće.
-- Biraju se najprije pitanja koja još nisu bila u kvizu dana, pa se ne ponavljaju dok se baza ne iscrpi.
create function igra.dnevni_set(p_dan date) returns text[]
language plpgsql volatile set search_path = '' as $$
declare
  s text[];
  kat text;
  prvo record;
  drugo text;
  odabrano text[] := '{}';
begin
  select pitanja into s from igra.dnevni_setovi where dan = p_dan;
  if found then return s; end if;

  for kat in select unnest(array['povijest','zemljopis','biologija','umjetnost','knjizevnost','glazba','sport','video_igre','znacenje_rijeci']) loop
    select p.id, p.tip into prvo
      from igra.pitanja p
      where p.kategorija = kat and p.aktivno and p.id not like 'probno-%'
      order by (select count(*) from igra.dnevni_setovi d where p.id = any(d.pitanja)), random()
      limit 1;
    if not found then raise exception 'Nema pitanja u kategoriji %.', kat; end if;
    select p.id into drugo
      from igra.pitanja p
      where p.kategorija = kat and p.aktivno and p.id not like 'probno-%' and p.id <> prvo.id
      order by (select count(*) from igra.dnevni_setovi d where p.id = any(d.pitanja)), (p.tip = prvo.tip), random()
      limit 1;
    odabrano := odabrano || prvo.id || drugo;
  end loop;

  select array_agg(x order by random()) into s from unnest(odabrano) as x;
  insert into igra.dnevni_setovi (dan, pitanja) values (p_dan, s) on conflict (dan) do nothing;
  select pitanja into s from igra.dnevni_setovi where dan = p_dan;
  return s;
end $$;

-- Pokreće ili nastavlja današnji kviz. Jedan kviz dana po igraču.
create function public.pocni_dnevni(p_igrac uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  d date := igra.danas();
  k igra.kvizovi;
  odgovoreno int;
begin
  if not exists (select 1 from igra.igraci where id = p_igrac) then raise exception 'Nepoznat igrač.'; end if;
  select * into k from igra.kvizovi where igrac_id = p_igrac and vrsta = 'dnevni' and dan = d;
  if not found then
    insert into igra.kvizovi (vrsta, pitanja, igrac_id, dan)
      values ('dnevni', igra.dnevni_set(d), p_igrac, d)
      on conflict do nothing;
    select * into k from igra.kvizovi where igrac_id = p_igrac and vrsta = 'dnevni' and dan = d;
  end if;
  select count(*) into odgovoreno from igra.odgovori where kviz_id = k.id and odgovoreno_u is not null;
  if odgovoreno >= array_length(k.pitanja, 1) then
    return jsonb_build_object('zavrsen', true, 'ukupnoBodova', k.ukupno_bodova, 'dan', d);
  end if;
  return jsonb_build_object('kvizId', k.id, 'brojPitanja', array_length(k.pitanja, 1), 'sljedeci', odgovoreno,
    'ukupnoBodova', k.ukupno_bodova, 'dan', d);
end $$;

-- ---------- Trening ----------
-- 10 nasumičnih pitanja iz kategorije. Bez današnjih pitanja dana, da trening ne otkriva kviz dana.
-- Trening ne ulazi u rang-liste ni lige.
create function public.pocni_trening(p_igrac uuid, p_kategorija text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare k igra.kvizovi; danasnja text[];
begin
  if not exists (select 1 from igra.igraci where id = p_igrac) then raise exception 'Nepoznat igrač.'; end if;
  select pitanja into danasnja from igra.dnevni_setovi where dan = igra.danas();
  insert into igra.kvizovi (vrsta, pitanja, igrac_id, kategorija)
  values ('trening', array(
      select id from igra.pitanja
      where kategorija = p_kategorija and aktivno and id not like 'probno-%' and not (id = any(coalesce(danasnja, '{}')))
      order by random() limit 10), p_igrac, p_kategorija)
  returning * into k;
  if coalesce(array_length(k.pitanja, 1), 0) = 0 then raise exception 'Nema pitanja u toj kategoriji.'; end if;
  return jsonb_build_object('kvizId', k.id, 'brojPitanja', array_length(k.pitanja, 1));
end $$;

revoke all on function public.novi_igrac(text), public.igrac_info(uuid), public.postavi_pin(uuid, text),
  public.prijava_pinom(text, text), public.pocni_dnevni(uuid), public.pocni_trening(uuid, text) from public;
grant execute on function public.novi_igrac(text), public.igrac_info(uuid), public.postavi_pin(uuid, text),
  public.prijava_pinom(text, text), public.pocni_dnevni(uuid), public.pocni_trening(uuid, text) to anon, authenticated;
