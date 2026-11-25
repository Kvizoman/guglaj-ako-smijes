-- 0006 (faza 4c): tjedne lige s pozivnicom (#liga-KOD).
-- Tjedan: ponedjeljak do nedjelje, Europe/Sarajevo. Bodovi u ligi = zbroj kvizova dana člana u tom tjednu.

-- Psovke odvojene od rezerviranih riječi (admin, moderator), da naziv lige "Administracija" prođe.
create function igra.psovka(s text) returns boolean
language sql immutable set search_path = '' as $$
  select exists (
    select 1 from unnest(array[
      'kurac','kurc','picka','picko','pizd','jeb','kurv','peder','govn','sranj','drolj','supak','supci',
      'fuck','shit','bitch','cunt','nigg','hitler','nazis','porn','penis','vagin'
    ]) as r
    where translate(igra.nadimak_kljuc(s), '013457', 'oieast') like '%' || r || '%'
  )
$$;
create or replace function igra.neprimjeren(s text) returns boolean
language sql immutable set search_path = '' as $$
  select igra.psovka(s) or igra.nadimak_kljuc(s) ~ '(admin|moderator)'
$$;

create table igra.lige (
  id uuid primary key default gen_random_uuid(),
  kod text not null unique,
  naziv text not null,
  osnivac_id uuid not null references igra.igraci(id) on delete cascade,
  stvorena timestamptz not null default now()
);
create table igra.clanovi_lige (
  liga_id uuid not null references igra.lige(id) on delete cascade,
  igrac_id uuid not null references igra.igraci(id) on delete cascade,
  pridruzen timestamptz not null default now(),
  uklonjen boolean not null default false,
  primary key (liga_id, igrac_id)
);
create index clanovi_lige_igrac on igra.clanovi_lige (igrac_id);
alter table igra.lige enable row level security;
alter table igra.clanovi_lige enable row level security;
revoke all on igra.lige, igra.clanovi_lige from anon, authenticated;

create function igra.provjeri_naziv_lige(p text) returns text
language plpgsql immutable set search_path = '' as $$
declare n text := btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g'));
begin
  if n !~ '^[A-Za-z0-9ČĆĐŠŽčćđšž .,!?''"&()_-]{3,30}$' then
    raise exception 'Naziv lige mora imati 3 do 30 znakova: slova, brojke, razmak i osnovni znakovi.';
  end if;
  if igra.psovka(n) then raise exception 'Taj naziv nije dopušten.'; end if;
  return n;
end $$;

create function igra.liga_za_clana(p_igrac uuid, p_kod text) returns igra.lige
language plpgsql stable set search_path = '' as $$
declare l igra.lige;
begin
  select * into l from igra.lige where kod = upper(btrim(coalesce(p_kod, '')));
  if not found then raise exception 'Nepoznata liga. Provjeri pozivnicu.'; end if;
  if not exists (select 1 from igra.clanovi_lige where liga_id = l.id and igrac_id = p_igrac and not uklonjen) then
    raise exception 'Nisi član ove lige.';
  end if;
  return l;
end $$;

create function public.napravi_ligu(p_igrac uuid, p_naziv text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare n text; k text; l igra.lige;
begin
  if not exists (select 1 from igra.igraci where id = p_igrac) then raise exception 'Nepoznat igrač.'; end if;
  n := igra.provjeri_naziv_lige(p_naziv);
  if (select count(*) from igra.lige where osnivac_id = p_igrac) >= 20 then
    raise exception 'Možeš osnovati najviše 20 liga.';
  end if;
  loop
    k := (select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '') from generate_series(1, 6));
    exit when not exists (select 1 from igra.lige where kod = k);
  end loop;
  insert into igra.lige (kod, naziv, osnivac_id) values (k, n, p_igrac) returning * into l;
  insert into igra.clanovi_lige (liga_id, igrac_id) values (l.id, p_igrac);
  return jsonb_build_object('kod', l.kod, 'naziv', l.naziv);
end $$;

-- Naziv lige po kodu pozivnice (da onaj tko otvori link zna kamo ulazi).
create function public.naziv_lige(p_kod text) returns text
language sql stable security definer set search_path = '' as $$
  select naziv from igra.lige where kod = upper(btrim(coalesce(p_kod, '')))
$$;

create function public.pridruzi_ligi(p_igrac uuid, p_kod text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare l igra.lige; c igra.clanovi_lige;
begin
  if not exists (select 1 from igra.igraci where id = p_igrac) then raise exception 'Nepoznat igrač.'; end if;
  select * into l from igra.lige where kod = upper(btrim(coalesce(p_kod, '')));
  if not found then raise exception 'Nepoznata liga. Provjeri pozivnicu.'; end if;
  select * into c from igra.clanovi_lige where liga_id = l.id and igrac_id = p_igrac;
  if found and c.uklonjen then raise exception 'Osnivač lige uklonio te je iz ove lige.'; end if;
  if (select count(*) from igra.clanovi_lige where liga_id = l.id and not uklonjen) >= 200 then
    raise exception 'Liga je puna (200 članova).';
  end if;
  insert into igra.clanovi_lige (liga_id, igrac_id) values (l.id, p_igrac) on conflict do nothing;
  return jsonb_build_object('kod', l.kod, 'naziv', l.naziv);
end $$;

create function public.moje_lige(p_igrac uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'kod', l.kod, 'naziv', l.naziv, 'osnivac', l.osnivac_id = p_igrac,
      'clanova', (select count(*) from igra.clanovi_lige c2 where c2.liga_id = l.id and not c2.uklonjen))
    order by l.naziv), '[]'::jsonb)
  from igra.lige l join igra.clanovi_lige c on c.liga_id = l.id
  where c.igrac_id = p_igrac and not c.uklonjen
$$;

-- Poredak lige za tjedan (p_tjedan = bilo koji dan tog tjedna; null = ovaj tjedan) i kategoriju (null = sve).
create function public.liga(p_igrac uuid, p_kod text, p_tjedan date default null, p_kategorija text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  l igra.lige;
  ovaj date := date_trunc('week', igra.danas())::date;
  od date;
  prvi date;
  rez jsonb;
begin
  l := igra.liga_za_clana(p_igrac, p_kod);
  prvi := date_trunc('week', (l.stvorena at time zone 'Europe/Sarajevo')::date)::date;
  od := date_trunc('week', coalesce(p_tjedan, ovaj))::date;
  if od > ovaj or od < prvi then raise exception 'Liga tada nije postojala.'; end if;
  if p_kategorija is not null and p_kategorija not in
     ('povijest','zemljopis','biologija','umjetnost','knjizevnost','glazba','sport','video_igre','znacenje_rijeci') then
    raise exception 'Nepoznata kategorija.';
  end if;

  with cl as (
    select c.igrac_id, i.nadimak from igra.clanovi_lige c join igra.igraci i on i.id = c.igrac_id
    where c.liga_id = l.id and not c.uklonjen
  ), b as (
    select k.igrac_id, k.dan, coalesce(o.bodovi, 0) as bodovi
    from igra.kvizovi k
    join igra.odgovori o on o.kviz_id = k.id and o.odgovoreno_u is not null
    join igra.pitanja p on p.id = o.pitanje_id
    where k.vrsta = 'dnevni' and k.dan between od and od + 6
      and k.igrac_id in (select igrac_id from cl)
      and (p_kategorija is null or p.kategorija = p_kategorija)
  ), z as (
    select cl.igrac_id, cl.nadimak, coalesce(sum(b.bodovi), 0)::int as bodovi, count(distinct b.dan)::int as dana
    from cl left join b on b.igrac_id = cl.igrac_id group by cl.igrac_id, cl.nadimak
  ), r as (
    select z.*, rank() over (order by z.bodovi desc)::int as mjesto from z
  ), pb as (  -- bodovi po prošlim tjednima (sve kategorije)
    select date_trunc('week', k.dan)::date as tj, k.igrac_id, sum(coalesce(o.bodovi, 0))::int as bodovi
    from igra.kvizovi k
    join igra.odgovori o on o.kviz_id = k.id and o.odgovoreno_u is not null
    where k.vrsta = 'dnevni' and k.dan >= prvi and k.dan < ovaj
      and k.igrac_id in (select igrac_id from cl)
    group by 1, 2
  ), naj as (
    select tj, max(bodovi) as bodovi from pb group by tj having max(bodovi) > 0
  )
  select jsonb_build_object(
    'kod', l.kod,
    'naziv', l.naziv,
    'osnivac', l.osnivac_id = p_igrac,
    'nazivOsnivaca', (select nadimak from igra.igraci where id = l.osnivac_id),
    'tjedanOd', od,
    'tjedanDo', od + 6,
    'ovajTjedan', od = ovaj,
    'redovi', coalesce((select jsonb_agg(jsonb_build_object('mjesto', mjesto, 'nadimak', nadimak, 'bodovi', bodovi, 'dana', dana,
                         'ja', igrac_id = p_igrac, 'osnivac', igrac_id = l.osnivac_id) order by mjesto, nadimak) from r), '[]'::jsonb),
    'pobjednici', coalesce((
      select jsonb_agg(jsonb_build_object('od', n.tj, 'do', n.tj + 6, 'bodovi', n.bodovi,
               'nadimci', (select jsonb_agg(cl.nadimak order by cl.nadimak) from pb join cl on cl.igrac_id = pb.igrac_id
                           where pb.tj = n.tj and pb.bodovi = n.bodovi)) order by n.tj desc)
      from (select * from naj order by tj desc limit 52) n), '[]'::jsonb)
  ) into rez;
  return rez;
end $$;

create function public.preimenuj_ligu(p_igrac uuid, p_kod text, p_naziv text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare l igra.lige; n text;
begin
  l := igra.liga_za_clana(p_igrac, p_kod);
  if l.osnivac_id <> p_igrac then raise exception 'Samo osnivač može preimenovati ligu.'; end if;
  n := igra.provjeri_naziv_lige(p_naziv);
  update igra.lige set naziv = n where id = l.id;
  return n;
end $$;

-- Član se uklanja po nadimku (nadimci su jedinstveni), da se ID igrača nikad ne šalje drugima.
create function public.ukloni_clana(p_igrac uuid, p_kod text, p_nadimak text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare l igra.lige; cilj uuid;
begin
  l := igra.liga_za_clana(p_igrac, p_kod);
  if l.osnivac_id <> p_igrac then raise exception 'Samo osnivač može ukloniti člana.'; end if;
  select id into cilj from igra.igraci where nadimak_kljuc = igra.nadimak_kljuc(p_nadimak);
  if cilj is null then raise exception 'Nepoznat igrač.'; end if;
  if cilj = p_igrac then raise exception 'Osnivač ne može ukloniti sam sebe.'; end if;
  update igra.clanovi_lige set uklonjen = true where liga_id = l.id and igrac_id = cilj and not uklonjen;
  if not found then raise exception 'Taj igrač nije član lige.'; end if;
  return true;
end $$;

revoke all on function public.napravi_ligu(uuid, text), public.naziv_lige(text), public.pridruzi_ligi(uuid, text),
  public.moje_lige(uuid), public.liga(uuid, text, date, text), public.preimenuj_ligu(uuid, text, text),
  public.ukloni_clana(uuid, text, text) from public;
grant execute on function public.napravi_ligu(uuid, text), public.naziv_lige(text), public.pridruzi_ligi(uuid, text),
  public.moje_lige(uuid), public.liga(uuid, text, date, text), public.preimenuj_ligu(uuid, text, text),
  public.ukloni_clana(uuid, text, text) to anon, authenticated;
