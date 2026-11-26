-- 0010: popravak liga_odgovori. Redak odgovora se predaje kao cijeli igra.odgovori (prije: o.* s dodatnim stupcima, nije se dao pretvoriti).

create or replace function public.liga_odgovori(p_igrac uuid, p_kod text, p_dan date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  l igra.lige;
  d date := coalesce(p_dan, igra.danas());
  set_pitanja text[];
  moj igra.kvizovi;
  ja_zavrsio boolean := false;
  rez jsonb;
begin
  l := igra.liga_za_clana(p_igrac, p_kod);
  if d > igra.danas() then raise exception 'Taj dan još nije došao.'; end if;

  select pitanja into set_pitanja from igra.dnevni_setovi where dan = d;
  if set_pitanja is null then
    return jsonb_build_object('dan', d, 'otvoreno', true, 'pitanja', '[]'::jsonb, 'igraci', '[]'::jsonb, 'nisuIgrali', '[]'::jsonb);
  end if;

  if d = igra.danas() then
    select * into moj from igra.kvizovi where igrac_id = p_igrac and vrsta = 'dnevni' and dan = d;
    ja_zavrsio := found and (select count(*) from igra.odgovori where kviz_id = moj.id and odgovoreno_u is not null)
                  >= array_length(moj.pitanja, 1);
    if not ja_zavrsio then
      return jsonb_build_object('dan', d, 'otvoreno', false, 'pitanja', '[]'::jsonb, 'igraci', '[]'::jsonb, 'nisuIgrali', '[]'::jsonb);
    end if;
  end if;

  with cl as (
    select c.igrac_id, i.nadimak from igra.clanovi_lige c join igra.igraci i on i.id = c.igrac_id
    where c.liga_id = l.id and not c.uklonjen
  ), kv as (
    select k.id, k.igrac_id, cl.nadimak from igra.kvizovi k join cl on cl.igrac_id = k.igrac_id
    where k.vrsta = 'dnevni' and k.dan = d
  ), od as (
    select kv.igrac_id, kv.nadimak, o as red, o.pitanje_id, o.tocno, o.bodovi, o.pocetak, o.odgovoreno_u, o.vrijeme_ms
    from kv join igra.odgovori o on o.kviz_id = kv.id and o.odgovoreno_u is not null
  ), pit as (
    select s.ord, p.id, p.kategorija, p.podaci
    from unnest(set_pitanja) with ordinality as s(pid, ord) join igra.pitanja p on p.id = s.pid
  )
  select jsonb_build_object(
    'dan', d,
    'otvoreno', true,
    'pitanja', coalesce((
      select jsonb_agg(jsonb_build_object(
        'redni', pit.ord,
        'kategorija', pit.kategorija,
        'tip', pit.podaci->>'tip',
        'tekst', pit.podaci->>'tekst',
        'tocno', pit.podaci->>'prikazTocno',
        'odgovori', coalesce((
          select jsonb_agg(jsonb_build_object(
            'nadimak', od.nadimak,
            'ja', od.igrac_id = p_igrac,
            'odgovor', igra.odgovor_tekst(pit.podaci, od.red),
            'tocno', coalesce(od.tocno, false),
            'bodovi', coalesce(od.bodovi, 0),
            'sekunde', round(least(extract(epoch from od.odgovoreno_u - od.pocetak), od.vrijeme_ms / 1000.0)::numeric, 1)
          ) order by coalesce(od.bodovi, 0) desc, od.nadimak)
          from od where od.pitanje_id = pit.id), '[]'::jsonb)
      ) order by pit.ord) from pit), '[]'::jsonb),
    'igraci', coalesce((
      select jsonb_agg(jsonb_build_object('nadimak', x.nadimak, 'ja', x.igrac_id = p_igrac, 'bodovi', x.bodovi, 'tocnih', x.tocnih)
        order by x.bodovi desc, x.nadimak)
      from (select igrac_id, nadimak, sum(coalesce(bodovi, 0))::int as bodovi, count(*) filter (where tocno)::int as tocnih
            from od group by igrac_id, nadimak) x), '[]'::jsonb),
    'nisuIgrali', coalesce((
      select jsonb_agg(cl.nadimak order by cl.nadimak) from cl where not exists (select 1 from od where od.igrac_id = cl.igrac_id)), '[]'::jsonb)
  ) into rez;
  return rez;
end $$;

