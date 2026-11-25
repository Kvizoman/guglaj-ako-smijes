-- 0005 (faza 4b): rang-liste. Broje se samo kvizovi dana (trening ne ulazi).
-- Razdoblja po Europe/Sarajevo: 'dan' (danas), 'tjedan' (od ponedjeljka do danas), 'ukupno'.
-- Lista kategorije zbraja bodove s pitanja te kategorije iz kvizova dana.

create index if not exists kvizovi_dnevni_dan on igra.kvizovi (dan) where vrsta = 'dnevni';

create function public.rang_lista(p_igrac uuid, p_razdoblje text, p_kategorija text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  d date := igra.danas();
  od date;
  rez jsonb;
begin
  if p_razdoblje = 'dan' then od := d;
  elsif p_razdoblje = 'tjedan' then od := date_trunc('week', d)::date;
  elsif p_razdoblje = 'ukupno' then od := '-infinity'::date;
  else raise exception 'Nepoznato razdoblje.';
  end if;
  if p_kategorija is not null and p_kategorija not in
     ('povijest','zemljopis','biologija','umjetnost','knjizevnost','glazba','sport','video_igre','znacenje_rijeci') then
    raise exception 'Nepoznata kategorija.';
  end if;

  with b as (
    select k.igrac_id, k.dan, coalesce(o.bodovi, 0) as bodovi
    from igra.kvizovi k
    join igra.odgovori o on o.kviz_id = k.id and o.odgovoreno_u is not null
    join igra.pitanja p on p.id = o.pitanje_id
    where k.vrsta = 'dnevni' and k.igrac_id is not null and k.dan between od and d
      and (p_kategorija is null or p.kategorija = p_kategorija)
  ), z as (
    select igrac_id, sum(bodovi)::int as bodovi, count(distinct dan)::int as dana from b group by igrac_id
  ), r as (
    select z.*, i.nadimak, rank() over (order by z.bodovi desc)::int as mjesto
    from z join igra.igraci i on i.id = z.igrac_id
  )
  select jsonb_build_object(
    'od', case when p_razdoblje = 'ukupno' then null else od end,
    'do', d,
    'ukupnoIgraca', (select count(*) from r),
    'redovi', coalesce((
      select jsonb_agg(jsonb_build_object('mjesto', mjesto, 'nadimak', nadimak, 'bodovi', bodovi, 'dana', dana, 'ja', igrac_id = p_igrac)
                       order by mjesto, nadimak)
      from (select * from r order by mjesto, nadimak limit 50) t), '[]'::jsonb),
    'moj', (select jsonb_build_object('mjesto', mjesto, 'nadimak', nadimak, 'bodovi', bodovi, 'dana', dana, 'ja', true)
            from r where igrac_id = p_igrac)
  ) into rez;
  return rez;
end $$;

revoke all on function public.rang_lista(uuid, text, text) from public;
grant execute on function public.rang_lista(uuid, text, text) to anon, authenticated;
