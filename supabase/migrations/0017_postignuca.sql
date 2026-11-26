-- 0017: skrivena postignuća (ideja 3, PDF "Guglaj ako smiješ: kreativne ideje").
-- Provjerava ih okidač nakon svakog odgovora (posalji_odgovor se ne mijenja). Svako postignuće igrač osvaja jednom.
-- "Brzo" = odgovor u prvoj trećini vremena (isto kao komentar 'brzo').
--   sumnjivo     posljednjih 10 teških pitanja (težina 3) točno, kroz sve igre
--   puz          točan odgovor u posljednjoj sekundi (ne u načinu kava)
--   steroidi     5 brzih točnih zaredom u istom kvizu
--   neznanje     5 pogrešnih zaredom u istom kvizu
--   povratak     5 točnih odmah nakon 5 pogrešnih, u istom kvizu
--   doktorat     5 brzih, ali pogrešnih odgovora u istom kvizu (istek vremena se ne broji)
--   snajperist   trening jedne kategorije, sve točno (10/10)
--   planet       Intelektualni pakao, sve točno
--   fenomen      dovršena partija od 10+ pitanja bez ijednog točnog
--   neunistivi   nakon partije s manje od 40 % točnih još 5 dovršenih partija istog dana

create table igra.postignuca_igraca (
  igrac_id uuid not null references igra.igraci(id) on delete cascade,
  kod text not null check (kod in ('sumnjivo','puz','steroidi','neznanje','povratak','doktorat','snajperist','planet','fenomen','neunistivi')),
  kviz_id uuid references igra.kvizovi(id) on delete set null,
  kad timestamptz not null default now(),
  prikazano boolean not null default false,
  primary key (igrac_id, kod)
);
alter table igra.postignuca_igraca enable row level security;
revoke all on igra.postignuca_igraca from anon, authenticated;

create function igra.dodijeli(p_igrac uuid, p_kod text, p_kviz uuid) returns void
language sql set search_path = '' as $$
  insert into igra.postignuca_igraca (igrac_id, kod, kviz_id) values (p_igrac, p_kod, p_kviz) on conflict do nothing
$$;

create function igra.provjeri_postignuca() returns trigger
language plpgsql set search_path = '' as $$
declare
  k igra.kvizovi;
  zadnjih jsonb;
  n int;
  tocnih int;
  zavrsen boolean;
begin
 -- Greška u provjeri postignuća nikad ne smije srušiti slanje odgovora.
 begin
  select * into k from igra.kvizovi where id = new.kviz_id;
  if k.igrac_id is null then return null; end if;

  -- zadnjih 10 odgovora ovog kviza, od najnovijeg: [{t: točno, b: brzo, s: poslan odgovor}]
  select jsonb_agg(jsonb_build_object(
           't', coalesce(o.tocno, false),
           'b', (o.vrijeme_ms - extract(epoch from o.odgovoreno_u - o.pocetak) * 1000) / o.vrijeme_ms >= 0.66,
           's', coalesce(o.odgovor->>'vrsta', 'nista') <> 'nista')
         order by o.redni desc)
    into zadnjih
    from (select * from igra.odgovori where kviz_id = new.kviz_id and odgovoreno_u is not null and redni <= new.redni
          order by redni desc limit 10) o;
  n := jsonb_array_length(zadnjih);

  if new.tocno and k.nacin is distinct from 'kava'
     and extract(epoch from new.odgovoreno_u - new.pocetak) * 1000 >= new.vrijeme_ms - 1000 then
    perform igra.dodijeli(k.igrac_id, 'puz', k.id);
  end if;
  if n >= 5 and (select bool_and((e->>'t')::boolean and (e->>'b')::boolean) from jsonb_array_elements(zadnjih) with ordinality x(e, i) where i <= 5) then
    perform igra.dodijeli(k.igrac_id, 'steroidi', k.id);
  end if;
  if n >= 5 and (select bool_and(not (e->>'t')::boolean) from jsonb_array_elements(zadnjih) with ordinality x(e, i) where i <= 5) then
    perform igra.dodijeli(k.igrac_id, 'neznanje', k.id);
  end if;
  if n >= 10 and (select bool_and(case when i <= 5 then (e->>'t')::boolean else not (e->>'t')::boolean end)
                  from jsonb_array_elements(zadnjih) with ordinality x(e, i)) then
    perform igra.dodijeli(k.igrac_id, 'povratak', k.id);
  end if;
  if (select count(*) from igra.odgovori o where o.kviz_id = k.id and o.odgovoreno_u is not null
        and not coalesce(o.tocno, false) and coalesce(o.odgovor->>'vrsta', 'nista') <> 'nista'
        and (o.vrijeme_ms - extract(epoch from o.odgovoreno_u - o.pocetak) * 1000) / o.vrijeme_ms >= 0.66) >= 5 then
    perform igra.dodijeli(k.igrac_id, 'doktorat', k.id);
  end if;
  if (select count(*) = 10 and bool_and(t) from (
        select coalesce(o.tocno, false) as t from igra.odgovori o
        join igra.kvizovi k2 on k2.id = o.kviz_id
        join igra.pitanja p on p.id = o.pitanje_id
        where k2.igrac_id = k.igrac_id and o.odgovoreno_u is not null and p.tezina = 3
        order by o.odgovoreno_u desc limit 10) z) then
    perform igra.dodijeli(k.igrac_id, 'sumnjivo', k.id);
  end if;

  -- kraj partije
  select count(*), count(*) filter (where tocno) into n, tocnih
    from igra.odgovori where kviz_id = k.id and odgovoreno_u is not null;
  zavrsen := n >= array_length(k.pitanja, 1);
  if zavrsen then
    if k.vrsta = 'trening' and k.kategorija is not null and n >= 10 and tocnih = n then
      perform igra.dodijeli(k.igrac_id, 'snajperist', k.id);
    end if;
    if k.nacin = 'pakao' and tocnih = n then
      perform igra.dodijeli(k.igrac_id, 'planet', k.id);
    end if;
    if n >= 10 and tocnih = 0 then
      perform igra.dodijeli(k.igrac_id, 'fenomen', k.id);
    end if;
    -- neuništivi ego: partija ispod 40 % danas, a nakon nje još 5 dovršenih partija danas
    if exists (
      with dovrseni as (
        select k3.id, k3.stvoren,
               count(o.*) filter (where o.tocno)::numeric / array_length(k3.pitanja, 1) as udio
        from igra.kvizovi k3 join igra.odgovori o on o.kviz_id = k3.id and o.odgovoreno_u is not null
        where k3.igrac_id = k.igrac_id and (k3.stvoren at time zone 'Europe/Sarajevo')::date = igra.danas()
        group by k3.id
        having count(o.*) >= array_length(k3.pitanja, 1)
      )
      select 1 from dovrseni losa
      where losa.udio < 0.4 and (select count(*) from dovrseni d where d.stvoren > losa.stvoren) >= 5
    ) then
      perform igra.dodijeli(k.igrac_id, 'neunistivi', k.id);
    end if;
  end if;
 exception when others then
  raise warning 'provjeri_postignuca: %', sqlerrm;
 end;
  return null;
end $$;

create trigger odgovori_postignuca after update of odgovoreno_u on igra.odgovori
  for each row when (old.odgovoreno_u is null and new.odgovoreno_u is not null)
  execute function igra.provjeri_postignuca();

-- Postignuća osvojena u ovom kvizu koja igrač još nije vidio (i označi ih viđenima). ID kviza zna samo igrač.
create function public.nova_postignuca(p_kviz uuid) returns jsonb
language sql volatile security definer set search_path = '' as $$
  with u as (
    update igra.postignuca_igraca set prikazano = true
    where kviz_id = p_kviz and not prikazano
    returning kod
  )
  select coalesce(jsonb_agg(kod), '[]'::jsonb) from u
$$;

create function public.moja_postignuca(p_igrac uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('kod', kod, 'kad', kad) order by kad), '[]'::jsonb)
  from igra.postignuca_igraca where igrac_id = p_igrac
$$;

revoke all on function public.nova_postignuca(uuid), public.moja_postignuca(uuid) from public;
grant execute on function public.nova_postignuca(uuid), public.moja_postignuca(uuid) to anon, authenticated;
