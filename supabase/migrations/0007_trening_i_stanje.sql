-- 0007: trening ne otkriva buduća pitanja dana; stanje baze pitanja za npm run stanje-pitanja.

-- Trening bira najprije pitanja koja su već bila u kvizu dana (prije danas).
-- Dok ih u kategoriji nema barem 10, nadopunjuje ostalima (nikad današnjima).
create or replace function public.pocni_trening(p_igrac uuid, p_kategorija text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare k igra.kvizovi; d date := igra.danas(); danasnja text[];
begin
  if not exists (select 1 from igra.igraci where id = p_igrac) then raise exception 'Nepoznat igrač.'; end if;
  select pitanja into danasnja from igra.dnevni_setovi where dan = d;
  insert into igra.kvizovi (vrsta, pitanja, igrac_id, kategorija)
  values ('trening', array(
      select p.id from igra.pitanja p
      where p.kategorija = p_kategorija and p.aktivno and p.id not like 'probno-%'
        and not (p.id = any(coalesce(danasnja, '{}')))
      order by exists (select 1 from igra.dnevni_setovi s where s.dan < d and p.id = any(s.pitanja)) desc, random()
      limit 10), p_igrac, p_kategorija)
  returning * into k;
  if coalesce(array_length(k.pitanja, 1), 0) = 0 then raise exception 'Nema pitanja u toj kategoriji.'; end if;
  return jsonb_build_object('kvizId', k.id, 'brojPitanja', array_length(k.pitanja, 1));
end $$;

-- Stanje baze po kategoriji. Traži uvozni token (kao uvoz), jer je to podatak za urednicu, ne za igrače.
create function public.stanje_pitanja(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare ocekivano text;
begin
  select sazetak into ocekivano from igra.uvoz_kljuc where id = 1;
  if ocekivano is null or p_token is null or encode(sha256(convert_to(p_token, 'UTF8')), 'hex') <> ocekivano then
    raise exception 'Nije dopušteno.';
  end if;
  return (
    with x as (
      select p.kategorija,
        count(*) as aktivnih,
        count(*) filter (where exists (select 1 from igra.dnevni_setovi s where p.id = any(s.pitanja))) as bilo
      from igra.pitanja p where p.aktivno and p.id not like 'probno-%' group by p.kategorija
    )
    select jsonb_build_object(
      'danas', igra.danas(),
      'odigranihDana', (select count(*) from igra.dnevni_setovi),
      'kategorije', jsonb_agg(jsonb_build_object('kategorija', kategorija, 'aktivnih', aktivnih, 'bilo', bilo, 'nije', aktivnih - bilo) order by kategorija))
    from x
  );
end $$;

revoke all on function public.stanje_pitanja(text) from public;
grant execute on function public.stanje_pitanja(text) to anon, authenticated;
