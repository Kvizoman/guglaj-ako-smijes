-- 0014: skrivena bonus poruka prikazuje se nakon 15. točnog odgovora zaredom (prije: na kraju kviza uz 100 %).

create or replace function public.posalji_odgovor(p_kviz uuid, p_redni int, p_odgovor jsonb, p_napustio boolean) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  k igra.kvizovi;
  o igra.odgovori;
  p jsonb;
  post jsonb;
  vrsta text := p_odgovor->>'vrsta';
  v_napustio boolean := coalesce(p_napustio, false);
  proteklo int;
  preostalo int;
  isteklo boolean;
  v_udio numeric := 0;
  v_tocno boolean := false;
  fiksni int;
  v_bodovi int;
  novi_niz int;
  n int;
  pogodjeno int;
  v_komentar text;
  tezina int;
  partial boolean;
  prije_netocnih int;
  kljucevi text[] := '{}';
  odgovoreno int;
  tocnih int;
  postotak int;
  v_zavrsno text;
  v_bonus text;
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
      v_tocno := coalesce(o.pomijesano[(p_odgovor->>'indeks')::int + 1] = (p->>'tocanIndeks')::int, false);
      v_udio := case when v_tocno then 1 else 0 end;

    elsif vrsta = 'tekst' and p->>'tip' = 'asocijacije' then
      v_tocno := igra.je_prihvatljiv(left(p_odgovor->>'tekst', 200), p->'asocijacije'->'konacno');
      n := jsonb_array_length(p->'asocijacije'->'kolone') * 4;
      if v_tocno then
        v_udio := 0.25 + 0.75 * (n - coalesce(array_length(o.otvorena_polja, 1), 0))::numeric / n;
      else
        fiksni := coalesce(array_length(o.rijesene_kolone, 1), 0) * (post->'bodovi'->>'asocijacijeKolona')::int;
      end if;

    elsif vrsta = 'tekst' and p ? 'prihvatljivi' then
      v_tocno := igra.je_prihvatljiv(left(p_odgovor->>'tekst', 200), p->'prihvatljivi');
      if v_tocno then
        if p->>'tip' = 'tragovi' then
          n := jsonb_array_length(p->'tragovi');
          v_udio := (n - o.otkriveno_tragova + 1)::numeric / n;
        else
          v_udio := 1;
        end if;
      end if;

    elsif vrsta = 'redoslijed' and p ? 'poredaj' then
      n := jsonb_array_length(p->'poredaj'->'stavke');
      select coalesce(count(*) = n and bool_and(o.pomijesano[(e.v)::int + 1] = e.ord - 1), false)
        into v_tocno
        from jsonb_array_elements_text(p_odgovor->'redoslijed') with ordinality as e(v, ord);
      v_udio := case when v_tocno then 1 else 0 end;

    elsif vrsta = 'tvrdnje' and p ? 'tvrdnje' then
      n := jsonb_array_length(p->'tvrdnje');
      select count(*) into pogodjeno
        from jsonb_array_elements(p->'tvrdnje') with ordinality as t(v, ord)
        where (p_odgovor->'odgovori'->(t.ord::int - 1)) = (t.v->'tocno');
      v_tocno := pogodjeno = n;
      v_udio := pogodjeno::numeric / n;
    end if;

  elsif p->>'tip' = 'asocijacije' then
    fiksni := coalesce(array_length(o.rijesene_kolone, 1), 0) * (post->'bodovi'->>'asocijacijeKolona')::int;
  end if;

  novi_niz := case when v_tocno then k.niz + 1 else 0 end;
  v_bodovi := coalesce(fiksni, igra.izracunaj_bodove(v_udio, preostalo, o.vrijeme_ms, novi_niz, v_napustio));

  -- Poruka: prva skupina koja odgovara i u kojoj ima poruke koja u ovom kvizu još nije bila (vidi src/podaci/komentari.ts).
  tezina := (p->>'tezina')::int;
  partial := not v_tocno and not isteklo and v_bodovi > 0;
  select count(*) into prije_netocnih from igra.odgovori
    where kviz_id = p_kviz and odgovoreno_u is not null and redni < p_redni
      and redni > coalesce((select max(redni) from igra.odgovori where kviz_id = p_kviz and tocno and redni < p_redni), -1);
  if v_napustio then
    kljucevi := array['varanje'];
  elsif v_tocno then
    if novi_niz >= 3 then kljucevi := kljucevi || ('niz:' || novi_niz); end if;
    if prije_netocnih >= 3 then kljucevi := kljucevi || 'povratak'::text; end if;
    if tezina = 3 then kljucevi := kljucevi || 'tesko'::text; end if;
    if greatest(preostalo, 0)::numeric / o.vrijeme_ms >= 0.66 then kljucevi := kljucevi || 'brzo'::text; end if;
    kljucevi := kljucevi || 'tocno'::text;
  else
    if k.niz >= 5 then kljucevi := kljucevi || 'prekid'::text; end if;
    if prije_netocnih + 1 >= 2 then kljucevi := kljucevi || ('niz_netocnih:' || (prije_netocnih + 1)); end if;
    if isteklo then kljucevi := kljucevi || 'isteklo'::text;
    elsif not partial then
      if tezina = 1 then kljucevi := kljucevi || 'lako'::text; end if;
      kljucevi := kljucevi || 'netocno'::text;
    end if;
  end if;
  v_komentar := case
    when v_napustio then null
    when v_tocno then p->>'komentarTocno'
    when not isteklo and not partial then p->>'komentarNetocno'
    else null end;
  v_komentar := coalesce(v_komentar, igra.komentar_izbor(p_kviz, kljucevi), '');

  update igra.odgovori
    set odgovoreno_u = clock_timestamp(), odgovor = p_odgovor, tocno = v_tocno,
        udio = v_udio, bodovi = v_bodovi, napustio = v_napustio, komentar = nullif(v_komentar, '')
    where kviz_id = p_kviz and redni = p_redni;
  update igra.kvizovi
    set niz = novi_niz, ukupno_bodova = ukupno_bodova + v_bodovi
    where id = p_kviz;

  -- Bonus: odmah nakon 15. točnog odgovora zaredom.
  if novi_niz = 15 then
    select tekst into v_bonus from igra.komentari where ishod = 'bonus' limit 1;
  end if;

  -- Kraj kviza: poruka prema postotku točnih (nadolje).
  select count(*), count(*) filter (where o2.tocno) into odgovoreno, tocnih
    from igra.odgovori o2 where o2.kviz_id = p_kviz and o2.odgovoreno_u is not null;
  if odgovoreno >= array_length(k.pitanja, 1) then
    postotak := floor(100.0 * tocnih / odgovoreno);
    select tekst into v_zavrsno from igra.komentari where ishod = 'kraj' and prag <= postotak order by prag desc limit 1;
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'zavrsno', v_zavrsno,
    'bonus', v_bonus,
    'tocno', v_tocno,
    'udio', v_udio,
    'bodovi', v_bodovi,
    'ukupnoBodova', k.ukupno_bodova + v_bodovi,
    'niz', novi_niz,
    'istekloVrijeme', isteklo,
    'napustio', v_napustio,
    'prikazTocno', p->'prikazTocno',
    'objasnjenje', p->'objasnjenje',
    'komentar', v_komentar,
    'tocanIndeks', case when p ? 'tocanIndeks' then array_position(o.pomijesano, (p->>'tocanIndeks')::int) - 1 end,
    'tvrdnjeTocno', (select jsonb_agg(t->'tocno' order by ord) from jsonb_array_elements(p->'tvrdnje') with ordinality as x(t, ord)),
    'tocanRedoslijed', p->'poredaj'->'stavke',
    'koloneRjesenja', (select jsonb_agg(jsonb_build_object('polja', c->'polja', 'rjesenje', c->'prihvatljivi'->0) order by ord)
                       from jsonb_array_elements(p->'asocijacije'->'kolone') with ordinality as x(c, ord))
  ));
end $$;
