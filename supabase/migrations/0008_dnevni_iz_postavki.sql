-- 0008: broj pitanja po kategoriji u kvizu dana čita se iz igra.postavke (pitanjaPoKategorijiDnevno, zadano 2).
-- Unutar kategorije prednost imaju pitanja koja su najrjeđe bila u kvizu dana, pa tipovi koji još nisu odabrani taj dan.
-- Promjena vrijedi od sljedećeg dana (set za danas se ne mijenja).
create or replace function igra.dnevni_set(p_dan date) returns text[]
language plpgsql volatile set search_path = '' as $$
declare
  s text[];
  kat text;
  n int;
  i int;
  izbor record;
  tipovi text[];
  odabrano text[] := '{}';
begin
  select pitanja into s from igra.dnevni_setovi where dan = p_dan;
  if found then return s; end if;

  select greatest(1, least(10, coalesce((podaci->>'pitanjaPoKategorijiDnevno')::int, 2))) into n from igra.postavke where id = 1;
  n := coalesce(n, 2);

  for kat in select unnest(array['povijest','zemljopis','biologija','umjetnost','knjizevnost','glazba','sport','video_igre','znacenje_rijeci']) loop
    tipovi := '{}';
    for i in 1..n loop
      select p.id, p.tip into izbor
        from igra.pitanja p
        where p.kategorija = kat and p.aktivno and p.id not like 'probno-%' and not (p.id = any(odabrano))
        order by (select count(*) from igra.dnevni_setovi d where p.id = any(d.pitanja)), (p.tip = any(tipovi)), random()
        limit 1;
      if not found then
        if i = 1 then raise exception 'Nema pitanja u kategoriji %.', kat; end if;
        exit;
      end if;
      odabrano := odabrano || izbor.id;
      tipovi := tipovi || izbor.tip;
    end loop;
  end loop;

  select array_agg(x order by random()) into s from unnest(odabrano) as x;
  insert into igra.dnevni_setovi (dan, pitanja) values (p_dan, s) on conflict (dan) do nothing;
  select pitanja into s from igra.dnevni_setovi where dan = p_dan;
  return s;
end $$;
