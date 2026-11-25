-- Guglaj ako smiješ: osnova baze (faza 2)
-- Tablice su u shemi `igra`, koja NIJE izložena preko API-ja.
-- Javne su samo RPC funkcije u `public`, svaka s izričitim GRANT-om.

-- 1. Ništa novo u `public` ne postaje javno samo od sebe.
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public;

create extension if not exists fuzzystrmatch with schema extensions;

-- 2. Privatna shema
create schema if not exists igra;
revoke all on schema igra from public, anon, authenticated;
alter default privileges for role postgres in schema igra revoke execute on functions from public;

-- 3. Tablice
create table igra.postavke (
  id int primary key default 1 check (id = 1),
  podaci jsonb not null
);

create table igra.pitanja (
  id text primary key,
  kategorija text not null check (kategorija in
    ('povijest','zemljopis','biologija','umjetnost','knjizevnost','glazba','sport','video_igre','znacenje_rijeci')),
  tip text not null check (tip in
    ('odabir','stih','djelo','odlomak','opis','anagram','asocijacije','poredaj','tragovi','tocno_netocno','znacenje')),
  tezina smallint not null check (tezina between 1 and 3),
  podaci jsonb not null,           -- cijelo pitanje po shemi iz src/tipovi.ts (PitanjeBaza)
  aktivno boolean not null default true,
  dodano timestamptz not null default now()
);

create table igra.komentari (
  id bigint generated always as identity primary key,
  ishod text not null check (ishod in ('varanje','brzo','tocno','niz','djelomicno','netocno','isteklo')),
  tekst text not null
);

create table igra.kvizovi (
  id uuid primary key default gen_random_uuid(),
  vrsta text not null default 'probni' check (vrsta in ('probni','dnevni','trening')),
  pitanja text[] not null,
  niz int not null default 0,
  ukupno_bodova int not null default 0,
  stvoren timestamptz not null default now()
);

create table igra.odgovori (
  kviz_id uuid not null references igra.kvizovi(id) on delete cascade,
  redni int not null,
  pitanje_id text not null references igra.pitanja(id),
  pocetak timestamptz not null default clock_timestamp(),
  vrijeme_ms int not null,
  pomijesano int[] not null default '{}',
  otkriveno_tragova int not null default 1,
  otvorena_polja text[] not null default '{}',
  rijesene_kolone int[] not null default '{}',
  odgovoreno_u timestamptz,
  odgovor jsonb,
  tocno boolean,
  udio numeric,
  bodovi int,
  napustio boolean,
  primary key (kviz_id, redni)
);
create index on igra.odgovori (pitanje_id);

alter table igra.postavke enable row level security;
alter table igra.pitanja enable row level security;
alter table igra.komentari enable row level security;
alter table igra.kvizovi enable row level security;
alter table igra.odgovori enable row level security;
revoke all on all tables in schema igra from public, anon, authenticated;

-- 4. Postavke (mijenjaju se ovdje ili u Table Editoru: igra.postavke)
insert into igra.postavke (id, podaci) values (1, '{
  "vrijemeSek": { "odabir": 15, "upis": 25, "anagram": 20, "asocijacije": 90, "poredaj": 30, "tragovi": 40, "tocnoNetocnoPoTvrdnji": 6 },
  "bodovi": { "osnova": 100, "bonusBrzina": 50, "nizKorak": 0.1, "nizNajvise": 5, "kaznaNapustio": 0.5, "asocijacijeKolona": 15 },
  "milostMs": 1500,
  "pitanjaPoKategorijiDnevno": 2
}');

-- 5. Pomoćne funkcije (privatne)

create function igra.normaliziraj(s text) returns text
language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(
    lower(translate(
      replace(replace(coalesce(s, ''), 'Đ', 'dj'), 'đ', 'dj'),
      'ČĆŽŠčćžšÁÀÂÄÉÈÊËÍÌÎÏÓÒÔÖÚÙÛÜáàâäéèêëíìîïóòôöúùûüÑñ',
      'CCZScczsAAAAEEEEIIIIOOOOUUUUaaaaeeeeiiiioooouuuuNn')),
    '[^a-z0-9]+', ' ', 'g'))
$$;

create function igra.dopustena_greska(t text) returns int
language sql immutable set search_path = '' as $$
  select case
    when t ~ '[0-9]' then 0
    when length(t) <= 4 then 0
    when length(t) <= 8 then 1
    else 2 end
$$;

create function igra.je_prihvatljiv(upis text, prihvatljivi jsonb) returns boolean
language sql stable set search_path = '' as $$
  with u as (select left(igra.normaliziraj(upis), 255) as v)
  select coalesce((select v from u) <> '' and exists (
    select 1
    from jsonb_array_elements_text(coalesce(prihvatljivi, '[]'::jsonb)) as p(t)
    cross join lateral (select left(igra.normaliziraj(p.t), 255) as n) as x
    where extensions.levenshtein((select v from u), x.n) <= igra.dopustena_greska(x.n)
  ), false)
$$;

create function igra.vrijeme_za(p jsonb) returns int
language sql stable set search_path = '' as $$
  select 1000 * (case p->>'tip'
    when 'anagram' then (s->>'anagram')::int
    when 'asocijacije' then (s->>'asocijacije')::int
    when 'poredaj' then (s->>'poredaj')::int
    when 'tragovi' then (s->>'tragovi')::int
    when 'tocno_netocno' then (s->>'tocnoNetocnoPoTvrdnji')::int * greatest(jsonb_array_length(coalesce(p->'tvrdnje', '[1]'::jsonb)), 1)
    else case when coalesce(p->>'nacin', 'upis') = 'upis' then (s->>'upis')::int else (s->>'odabir')::int end
  end)
  from (select podaci->'vrijemeSek' as s from igra.postavke where id = 1) as x
$$;

create function igra.izracunaj_bodove(udio numeric, preostalo_ms int, ukupno_ms int, niz int, napustio boolean) returns int
language sql stable set search_path = '' as $$
  select case when udio <= 0 then 0 else round(
      ((b->>'osnova')::numeric + (b->>'bonusBrzina')::numeric * least(greatest(preostalo_ms::numeric / ukupno_ms, 0), 1))
      * udio
      * (1 + least(greatest(niz - 1, 0), (b->>'nizNajvise')::int) * (b->>'nizKorak')::numeric)
      * case when napustio then (b->>'kaznaNapustio')::numeric else 1 end
    )::int end
  from (select podaci->'bodovi' as b from igra.postavke where id = 1) as x
$$;

-- Nasumična permutacija 0..n-1, nikad u izvornom poretku (osim n <= 1).
create function igra.promijesaj(n int) returns int[]
language plpgsql volatile set search_path = '' as $$
declare a int[];
begin
  if n <= 0 then return '{}'; end if;
  select array_agg(i order by random()) into a from generate_series(0, n - 1) as i;
  if n > 1 and a = (select array_agg(i order by i) from generate_series(0, n - 1) as i) then
    a := array[a[2], a[1]] || a[3:];
  end if;
  return a;
end $$;

create function igra.anagram(rijec text) returns text
language plpgsql volatile set search_path = '' as $$
declare slova text[]; red int[]; rez text;
begin
  slova := regexp_split_to_array(upper(replace(rijec, ' ', '')), '');
  red := igra.promijesaj(array_length(slova, 1));
  select string_agg(slova[r + 1], '' order by o) into rez from unnest(red) with ordinality as u(r, o);
  return rez;
end $$;

create function igra.komentar(ishod text) returns text
language sql volatile set search_path = '' as $$
  select tekst from igra.komentari where komentari.ishod = komentar.ishod order by random() limit 1
$$;

-- 6. Javne RPC funkcije

create function public.pocni_kviz() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare k igra.kvizovi;
begin
  -- Faza 2: probni kviz s probnim pitanjima. Kviz dana dolazi u fazi 4.
  insert into igra.kvizovi (vrsta, pitanja)
  values ('probni', array(select id from igra.pitanja where aktivno and id like 'probno-%' order by dodano, id))
  returning * into k;
  if coalesce(array_length(k.pitanja, 1), 0) = 0 then raise exception 'Nema pitanja u bazi.'; end if;
  return jsonb_build_object('kvizId', k.id, 'brojPitanja', array_length(k.pitanja, 1));
end $$;

create function public.dohvati_pitanje(p_kviz uuid, p_redni int) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  k igra.kvizovi;
  o igra.odgovori;
  p jsonb;
  broj_stavki int;
  javno jsonb;
begin
  select * into k from igra.kvizovi where id = p_kviz;
  if not found then raise exception 'Nepoznat kviz.'; end if;
  if p_redni is null or p_redni < 0 or p_redni >= array_length(k.pitanja, 1) then raise exception 'Nema tog pitanja.'; end if;
  if p_redni > 0 and not exists (
    select 1 from igra.odgovori where kviz_id = p_kviz and redni = p_redni - 1 and odgovoreno_u is not null
  ) then raise exception 'Prvo odgovori na prethodno pitanje.'; end if;

  select podaci into p from igra.pitanja where id = k.pitanja[p_redni + 1];

  -- Ponovni dohvat NE pokreće vrijeme ispočetka.
  select * into o from igra.odgovori where kviz_id = p_kviz and redni = p_redni;
  if not found then
    broj_stavki := coalesce(jsonb_array_length(p->'ponudeno'), jsonb_array_length(p->'poredaj'->'stavke'), 0);
    insert into igra.odgovori (kviz_id, redni, pitanje_id, vrijeme_ms, pomijesano)
    values (p_kviz, p_redni, k.pitanja[p_redni + 1], igra.vrijeme_za(p), igra.promijesaj(broj_stavki))
    on conflict (kviz_id, redni) do nothing;
    select * into o from igra.odgovori where kviz_id = p_kviz and redni = p_redni;
  end if;

  javno := jsonb_build_object(
    'redni', p_redni,
    'ukupno', array_length(k.pitanja, 1),
    'kategorija', p->'kategorija',
    'tip', p->'tip',
    'tezina', p->'tezina',
    'tekst', p->'tekst',
    'nacin', coalesce(p->'nacin', '"upis"'::jsonb),
    'vrijemeMs', greatest(o.vrijeme_ms - (extract(epoch from clock_timestamp() - o.pocetak) * 1000)::int, 0),
    'slika', p->'slika',
    'uputa', p->'poredaj'->'uputa',
    'brojTragova', jsonb_array_length(p->'tragovi'),
    'prviTrag', p->'tragovi'->0,
    'brojKolona', jsonb_array_length(p->'asocijacije'->'kolone')
  );
  if p ? 'ponudeno' then
    javno := javno || jsonb_build_object('ponudeno',
      (select jsonb_agg(p->'ponudeno'->i order by ord) from unnest(o.pomijesano) with ordinality as u(i, ord)));
  end if;
  if p ? 'poredaj' then
    javno := javno || jsonb_build_object('stavke',
      (select jsonb_agg(p->'poredaj'->'stavke'->i order by ord) from unnest(o.pomijesano) with ordinality as u(i, ord)));
  end if;
  if p->>'tip' = 'anagram' then
    javno := javno || jsonb_build_object('slova', igra.anagram(p->'prihvatljivi'->>0));
  end if;
  if p ? 'tvrdnje' then
    javno := javno || jsonb_build_object('tvrdnje',
      (select jsonb_agg(t->'tekst' order by ord) from jsonb_array_elements(p->'tvrdnje') with ordinality as x(t, ord)));
  end if;
  return jsonb_strip_nulls(javno);
end $$;

create function public.otkrij_trag(p_kviz uuid, p_redni int) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare o igra.odgovori; p jsonb;
begin
  select * into o from igra.odgovori where kviz_id = p_kviz and redni = p_redni for update;
  if not found then raise exception 'Pitanje nije dohvaćeno.'; end if;
  select podaci into p from igra.pitanja where id = o.pitanje_id;
  if o.odgovoreno_u is not null or o.otkriveno_tragova >= coalesce(jsonb_array_length(p->'tragovi'), 0) then
    raise exception 'Nema više tragova.';
  end if;
  update igra.odgovori set otkriveno_tragova = otkriveno_tragova + 1 where kviz_id = p_kviz and redni = p_redni;
  return p->'tragovi'->>o.otkriveno_tragova;
end $$;

create function public.otvori_polje(p_kviz uuid, p_redni int, p_kolona int, p_polje int) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare o igra.odgovori; tekst text;
begin
  select * into o from igra.odgovori where kviz_id = p_kviz and redni = p_redni for update;
  if not found or o.odgovoreno_u is not null or p_polje not between 0 and 3 then
    raise exception 'Polje se ne može otvoriti.';
  end if;
  select podaci->'asocijacije'->'kolone'->p_kolona->'polja'->>p_polje into tekst from igra.pitanja where id = o.pitanje_id;
  if tekst is null then raise exception 'Polje se ne može otvoriti.'; end if;
  if not (p_kolona || '-' || p_polje) = any (o.otvorena_polja) then
    update igra.odgovori set otvorena_polja = otvorena_polja || (p_kolona || '-' || p_polje)
    where kviz_id = p_kviz and redni = p_redni;
  end if;
  return tekst;
end $$;

create function public.rijesi_kolonu(p_kviz uuid, p_redni int, p_kolona int, p_upis text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare o igra.odgovori; kol jsonb;
begin
  select * into o from igra.odgovori where kviz_id = p_kviz and redni = p_redni for update;
  if not found or o.odgovoreno_u is not null then raise exception 'Kolona se ne može rješavati.'; end if;
  select podaci->'asocijacije'->'kolone'->p_kolona into kol from igra.pitanja where id = o.pitanje_id;
  if kol is null then raise exception 'Kolona se ne može rješavati.'; end if;
  if not igra.je_prihvatljiv(left(p_upis, 200), kol->'prihvatljivi') then
    return jsonb_build_object('tocno', false);
  end if;
  if not p_kolona = any (o.rijesene_kolone) then
    update igra.odgovori set rijesene_kolone = rijesene_kolone || p_kolona where kviz_id = p_kviz and redni = p_redni;
  end if;
  return jsonb_build_object('tocno', true, 'rjesenje', kol->'prihvatljivi'->0, 'polja', kol->'polja');
end $$;

create function public.posalji_odgovor(p_kviz uuid, p_redni int, p_odgovor jsonb, p_napustio boolean) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  k igra.kvizovi;
  o igra.odgovori;
  p jsonb;
  post jsonb;
  vrsta text := p_odgovor->>'vrsta';
  napustio boolean := coalesce(p_napustio, false);
  proteklo int;
  preostalo int;
  isteklo boolean;
  udio numeric := 0;
  tocno boolean := false;
  fiksni int;
  bodovi int;
  novi_niz int;
  n int;
  pogodjeno int;
  ishod text;
  komentar text;
begin
  select * into k from igra.kvizovi where id = p_kviz for update;
  if not found then raise exception 'Nepoznat kviz.'; end if;
  select * into o from igra.odgovori where kviz_id = p_kviz and redni = p_redni for update;
  if not found then raise exception 'Pitanje nije dohvaćeno.'; end if;
  if o.odgovoreno_u is not null then raise exception 'Na ovo pitanje je već odgovoreno.'; end if;

  select podaci into p from igra.pitanja where id = o.pitanje_id;
  select podaci into post from igra.postavke where id = 1;

  proteklo := (extract(epoch from clock_timestamp() - o.pocetak) * 1000)::int;
  preostalo := o.vrijeme_ms - proteklo;
  -- 'nista' šalje preglednik kad mu odbrojavač dođe do nule bez odgovora.
  isteklo := proteklo > o.vrijeme_ms + (post->>'milostMs')::int or vrsta is null or vrsta = 'nista';

  if not isteklo then
    if vrsta = 'indeks' and p ? 'tocanIndeks' then
      tocno := coalesce(o.pomijesano[(p_odgovor->>'indeks')::int + 1] = (p->>'tocanIndeks')::int, false);
      udio := case when tocno then 1 else 0 end;

    elsif vrsta = 'tekst' and p->>'tip' = 'asocijacije' then
      tocno := igra.je_prihvatljiv(left(p_odgovor->>'tekst', 200), p->'asocijacije'->'konacno');
      n := jsonb_array_length(p->'asocijacije'->'kolone') * 4;
      if tocno then
        udio := 0.25 + 0.75 * (n - coalesce(array_length(o.otvorena_polja, 1), 0))::numeric / n;
      else
        fiksni := coalesce(array_length(o.rijesene_kolone, 1), 0) * (post->'bodovi'->>'asocijacijeKolona')::int;
      end if;

    elsif vrsta = 'tekst' and p ? 'prihvatljivi' then
      tocno := igra.je_prihvatljiv(left(p_odgovor->>'tekst', 200), p->'prihvatljivi');
      if tocno then
        if p->>'tip' = 'tragovi' then
          n := jsonb_array_length(p->'tragovi');
          udio := (n - o.otkriveno_tragova + 1)::numeric / n;
        else
          udio := 1;
        end if;
      end if;

    elsif vrsta = 'redoslijed' and p ? 'poredaj' then
      n := jsonb_array_length(p->'poredaj'->'stavke');
      select coalesce(count(*) = n and bool_and(o.pomijesano[(e.v)::int + 1] = e.ord - 1), false)
        into tocno
        from jsonb_array_elements_text(p_odgovor->'redoslijed') with ordinality as e(v, ord);
      udio := case when tocno then 1 else 0 end;

    elsif vrsta = 'tvrdnje' and p ? 'tvrdnje' then
      n := jsonb_array_length(p->'tvrdnje');
      select count(*) into pogodjeno
        from jsonb_array_elements(p->'tvrdnje') with ordinality as t(v, ord)
        where (p_odgovor->'odgovori'->(t.ord::int - 1)) = (t.v->'tocno');
      tocno := pogodjeno = n;
      udio := pogodjeno::numeric / n;
    end if;

  elsif p->>'tip' = 'asocijacije' then
    fiksni := coalesce(array_length(o.rijesene_kolone, 1), 0) * (post->'bodovi'->>'asocijacijeKolona')::int;
  end if;

  novi_niz := case when tocno then k.niz + 1 else 0 end;
  bodovi := coalesce(fiksni, igra.izracunaj_bodove(udio, preostalo, o.vrijeme_ms, novi_niz, napustio));

  ishod := case
    when napustio then 'varanje'
    when isteklo then 'isteklo'
    when tocno and novi_niz >= 3 then 'niz'
    when tocno and greatest(preostalo, 0)::numeric / o.vrijeme_ms >= 0.66 then 'brzo'
    when tocno then 'tocno'
    when bodovi > 0 then 'djelomicno'
    else 'netocno' end;
  komentar := case
    when napustio then null
    when tocno then p->>'komentarTocno'
    when ishod = 'netocno' then p->>'komentarNetocno'
    else null end;
  komentar := coalesce(komentar, igra.komentar(ishod), '');

  update igra.odgovori
    set odgovoreno_u = clock_timestamp(), odgovor = p_odgovor, tocno = posalji_odgovor.tocno,
        udio = posalji_odgovor.udio, bodovi = posalji_odgovor.bodovi, napustio = posalji_odgovor.napustio
    where kviz_id = p_kviz and redni = p_redni;
  update igra.kvizovi
    set niz = novi_niz, ukupno_bodova = ukupno_bodova + posalji_odgovor.bodovi
    where id = p_kviz;

  return jsonb_strip_nulls(jsonb_build_object(
    'tocno', tocno,
    'udio', udio,
    'bodovi', bodovi,
    'ukupnoBodova', k.ukupno_bodova + bodovi,
    'niz', novi_niz,
    'istekloVrijeme', isteklo,
    'napustio', napustio,
    'prikazTocno', p->'prikazTocno',
    'objasnjenje', p->'objasnjenje',
    'komentar', komentar,
    'tocanIndeks', case when p ? 'tocanIndeks' then array_position(o.pomijesano, (p->>'tocanIndeks')::int) - 1 end,
    'tvrdnjeTocno', (select jsonb_agg(t->'tocno' order by ord) from jsonb_array_elements(p->'tvrdnje') with ordinality as x(t, ord)),
    'tocanRedoslijed', p->'poredaj'->'stavke',
    'koloneRjesenja', (select jsonb_agg(jsonb_build_object('polja', c->'polja', 'rjesenje', c->'prihvatljivi'->0) order by ord)
                       from jsonb_array_elements(p->'asocijacije'->'kolone') with ordinality as x(c, ord))
  ));
end $$;

-- 7. Ovlasti: privatne funkcije nikome, javne samo za pozive iz igre.
revoke all on all functions in schema igra from public, anon, authenticated;

revoke all on function public.pocni_kviz() from public;
revoke all on function public.dohvati_pitanje(uuid, int) from public;
revoke all on function public.otkrij_trag(uuid, int) from public;
revoke all on function public.otvori_polje(uuid, int, int, int) from public;
revoke all on function public.rijesi_kolonu(uuid, int, int, text) from public;
revoke all on function public.posalji_odgovor(uuid, int, jsonb, boolean) from public;

grant execute on function public.pocni_kviz() to anon, authenticated;
grant execute on function public.dohvati_pitanje(uuid, int) to anon, authenticated;
grant execute on function public.otkrij_trag(uuid, int) to anon, authenticated;
grant execute on function public.otvori_polje(uuid, int, int, int) to anon, authenticated;
grant execute on function public.rijesi_kolonu(uuid, int, int, text) to anon, authenticated;
grant execute on function public.posalji_odgovor(uuid, int, jsonb, boolean) to anon, authenticated;
