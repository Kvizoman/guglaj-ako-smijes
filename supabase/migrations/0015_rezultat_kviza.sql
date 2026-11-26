-- 0015: sažetak kviza za završni ekran (titula, svjedodžba): broj pitanja, točnih i najdulji niz točnih.
-- Samo čita. ID kviza zna samo onaj tko ga igra.

create function public.rezultat_kviza(p_kviz uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with o as (
    select redni, coalesce(tocno, false) as tocno,
           redni - row_number() over (partition by coalesce(tocno, false) order by redni) as skupina
    from igra.odgovori where kviz_id = p_kviz and odgovoreno_u is not null
  )
  select jsonb_build_object(
    'ukupno', (select array_length(pitanja, 1) from igra.kvizovi where id = p_kviz),
    'odgovoreno', (select count(*) from o),
    'tocnih', (select count(*) from o where tocno),
    'najduljiNiz', coalesce((select max(n) from (select count(*) as n from o where tocno group by skupina) x), 0)
  )
  where exists (select 1 from igra.kvizovi where id = p_kviz)
$$;

revoke all on function public.rezultat_kviza(uuid) from public;
grant execute on function public.rezultat_kviza(uuid) to anon, authenticated;
