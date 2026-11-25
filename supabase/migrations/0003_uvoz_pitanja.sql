-- 0003: uvoz pitanja iz pitanja/*.json (npm run uvoz-pitanja)
-- Javni ključ igre i dalje ne može pisati u bazu. Uvoz radi samo uz tajni uvozni token,
-- a u bazi se čuva samo njegov SHA-256 sažetak (sam token je u lokalnoj datoteci .env.local).

create table igra.uvoz_kljuc (
  id int primary key default 1 check (id = 1),
  sazetak text not null           -- hex SHA-256 tokena
);
alter table igra.uvoz_kljuc enable row level security;
revoke all on igra.uvoz_kljuc from anon, authenticated;

-- p_pitanja: JSON polje pitanja jedne kategorije (cijeli sadržaj datoteke pitanja/<kategorija>.json).
-- Pitanja te kategorije koja više nisu u datoteci postaju neaktivna (ne brišu se, zbog povijesti odgovora).
create function public.uvezi_pitanja(p_token text, p_kategorija text, p_pitanja jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  ocekivano text;
  p jsonb;
  dodano_novih int := 0;
  azurirano int := 0;
  ugaseno int := 0;
  ids text[] := '{}';
begin
  select sazetak into ocekivano from igra.uvoz_kljuc where id = 1;
  if ocekivano is null or p_token is null
     or encode(sha256(convert_to(p_token, 'UTF8')), 'hex') <> ocekivano then
    perform pg_sleep(1);  -- usporava pogađanje tokena
    raise exception 'Uvoz nije dopušten.';
  end if;
  if p_kategorija not in ('povijest','zemljopis','biologija','umjetnost','knjizevnost','glazba','sport','video_igre','znacenje_rijeci') then
    raise exception 'Nepoznata kategorija: %', p_kategorija;
  end if;
  if jsonb_typeof(p_pitanja) <> 'array' or jsonb_array_length(p_pitanja) = 0 then
    raise exception 'Prazan popis pitanja.';
  end if;

  for p in select * from jsonb_array_elements(p_pitanja) loop
    if p->>'kategorija' is distinct from p_kategorija then
      raise exception 'Pitanje % nije iz kategorije %.', p->>'id', p_kategorija;
    end if;
    if p->>'id' like 'probno-%' then
      raise exception 'Probna pitanja se ne uvoze ovim putem.';
    end if;
    ids := ids || (p->>'id');
    if exists (select 1 from igra.pitanja where id = p->>'id') then
      azurirano := azurirano + 1;
    else
      dodano_novih := dodano_novih + 1;
    end if;
    insert into igra.pitanja (id, kategorija, tip, tezina, podaci, aktivno)
    values (p->>'id', p->>'kategorija', p->>'tip', (p->>'tezina')::smallint, p, true)
    on conflict (id) do update set kategorija = excluded.kategorija, tip = excluded.tip,
      tezina = excluded.tezina, podaci = excluded.podaci, aktivno = true;
  end loop;

  update igra.pitanja set aktivno = false
  where kategorija = p_kategorija and id not like 'probno-%' and aktivno and not (id = any(ids));
  get diagnostics ugaseno = row_count;

  return jsonb_build_object('kategorija', p_kategorija, 'novih', dodano_novih, 'azurirano', azurirano, 'ugaseno', ugaseno,
    'aktivnih', (select count(*) from igra.pitanja where kategorija = p_kategorija and aktivno and id not like 'probno-%'));
end $$;

revoke all on function public.uvezi_pitanja(text, text, jsonb) from public;
grant execute on function public.uvezi_pitanja(text, text, jsonb) to anon, authenticated;
