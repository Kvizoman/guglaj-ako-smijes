-- 0018: jokeri (ideja 4, PDF "Guglaj ako smiješ: kreativne ideje"). Odluke korisnice 26.11.2026.:
-- najviše 3 od 6 jokera po kvizu, svaki jednom; u načinu pakao jokera nema; vrijede i u kvizu dana.
--   preskoci  Neuroni na remontu: pitanje nosi 0 bodova, niz točnih se ne prekida
--   pola      Prepolovi katastrofu: uklanja dva netočna ponuđena (kod tri ponuđena jedan)
--   vrijeme   Čekaj da mi dođe: +10 sekundi
--   ponisti   Nije mi bio dan: nakon netočnog odgovora vraća niz točnih kao da greške nije bilo
--   zalog     Zalog ega: točno = dvostruki bodovi, netočno = minus 100
--   natuknica Pedagoška intervencija: ovisno o tipu (upis: prvo slovo i broj slova; odabir: makne jedan netočan;
--             poredaj: prva stavka; točno/netočno: jedna tvrdnja; asocijacije: jedno polje besplatno)

alter table igra.kvizovi add column jokeri text[] not null default '{}';
alter table igra.odgovori add column jokeri text[] not null default '{}';

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
  -- Joker "Zalog ega": točno = dvostruko, inače minus osnovica (100).
  if 'zalog' = any(o.jokeri) then
    v_bodovi := case when v_tocno then v_bodovi * 2 else -(post->'bodovi'->>'osnova')::int end;
  end if;

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

create or replace function igra.provjeri_postignuca() returns trigger
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
  if new.odgovor->>'vrsta' = 'preskoceno' then return null; end if;

  -- zadnjih 10 odgovora ovog kviza, od najnovijeg: [{t: točno, b: brzo, s: poslan odgovor}]
  select jsonb_agg(jsonb_build_object(
           't', coalesce(o.tocno, false),
           'b', (o.vrijeme_ms - extract(epoch from o.odgovoreno_u - o.pocetak) * 1000) / o.vrijeme_ms >= 0.66,
           's', coalesce(o.odgovor->>'vrsta', 'nista') <> 'nista')
         order by o.redni desc)
    into zadnjih
    from (select * from igra.odgovori where kviz_id = new.kviz_id and odgovoreno_u is not null and redni <= new.redni
          and coalesce(odgovor->>'vrsta', '') <> 'preskoceno'
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
        and not coalesce(o.tocno, false) and coalesce(o.odgovor->>'vrsta', 'nista') not in ('nista', 'preskoceno')
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

create or replace function igra.odgovor_tekst(p jsonb, o igra.odgovori) returns text
language plpgsql stable set search_path = '' as $$
declare
  a jsonb := o.odgovor;
  v text := a->>'vrsta';
  t text;
  n int;
  pog int;
begin
  if o.napustio then return 'Napustio igru'; end if;
  if v = 'preskoceno' then return 'Preskočeno (joker)'; end if;
  if v is null or v = 'nista' then
    if p->>'tip' = 'asocijacije' and coalesce(array_length(o.rijesene_kolone, 1), 0) > 0 then
      return 'Isteklo vrijeme (riješeno kolona: ' || array_length(o.rijesene_kolone, 1) || ')';
    end if;
    return 'Isteklo vrijeme';
  end if;

  if v = 'indeks' then
    return coalesce(p->'ponudeno'->>(o.pomijesano[(a->>'indeks')::int + 1]), '?');

  elsif v = 'tekst' then
    t := nullif(btrim(left(a->>'tekst', 80)), '');
    if t is null then t := '(prazno)'; end if;
    if p->>'tip' = 'tragovi' then
      t := t || ' (tragova: ' || o.otkriveno_tragova || ')';
    elsif p->>'tip' = 'asocijacije' then
      t := t || ' (otvoreno polja: ' || coalesce(array_length(o.otvorena_polja, 1), 0) || ')';
    end if;
    return t;

  elsif v = 'redoslijed' then
    select string_agg(p->'poredaj'->'stavke'->>(o.pomijesano[(e.x)::int + 1]), ' → ' order by e.ord)
      into t from jsonb_array_elements_text(a->'redoslijed') with ordinality as e(x, ord);
    return coalesce(t, '?');

  elsif v = 'tvrdnje' then
    n := jsonb_array_length(p->'tvrdnje');
    select count(*) into pog
      from jsonb_array_elements(p->'tvrdnje') with ordinality as tv(x, ord)
      where (a->'odgovori'->(tv.ord::int - 1)) = (tv.x->'tocno');
    return 'Pogođeno tvrdnji: ' || pog || ' od ' || n;
  end if;
  return '?';
end $$;

-- Pozicije (u izmiješanom poretku) netočnih ponuđenih odgovora, nasumično.
create function igra.netocne_pozicije(p jsonb, o igra.odgovori) returns int[]
language sql volatile set search_path = '' as $$
  select coalesce(array_agg(i - 1 order by random()), '{}')
  from unnest(o.pomijesano) with ordinality as u(orig, i)
  where orig <> (p->>'tocanIndeks')::int
$$;

create function public.jokeri_kviza(p_kviz uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('iskoristeni', to_jsonb(jokeri), 'najvise', 3, 'dopusteno', nacin is distinct from 'pakao')
  from igra.kvizovi where id = p_kviz
$$;

create function public.iskoristi_joker(p_kviz uuid, p_redni int, p_joker text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  k igra.kvizovi;
  o igra.odgovori;
  p jsonb;
  poz int[];
  rez jsonb := '{}';
  a text;
  n int;
  i int;
  kol int;
  pol int;
  odgovoreno int;
  tocnih int;
  slova constant text := 'ABCD';
begin
  select * into k from igra.kvizovi where id = p_kviz for update;
  if not found then raise exception 'Nepoznat kviz.'; end if;
  if k.nacin = 'pakao' then raise exception 'U Intelektualnom paklu nema jokera. Bez milosti.'; end if;
  if p_joker is null or p_joker not in ('preskoci','pola','vrijeme','ponisti','zalog','natuknica') then raise exception 'Nepoznat joker.'; end if;
  if p_joker = any(k.jokeri) then raise exception 'Taj joker je već iskorišten u ovom kvizu.'; end if;
  if coalesce(array_length(k.jokeri, 1), 0) >= 3 then raise exception 'Iskorištena su sva tri jokera.'; end if;
  select * into o from igra.odgovori where kviz_id = p_kviz and redni = p_redni for update;
  if not found then raise exception 'Pitanje nije dohvaćeno.'; end if;
  select podaci into p from igra.pitanja where id = o.pitanje_id;

  if p_joker = 'ponisti' then
    if o.odgovoreno_u is null or coalesce(o.tocno, false) or o.odgovor->>'vrsta' = 'preskoceno' then
      raise exception 'Nije mi bio dan vrijedi samo odmah nakon netočnog odgovora.';
    end if;
    if exists (select 1 from igra.odgovori where kviz_id = p_kviz and redni > p_redni) then
      raise exception 'Prekasno: igra je već krenula dalje.';
    end if;
    -- niz točnih prije ovog pitanja
    select count(*) into n from igra.odgovori
      where kviz_id = p_kviz and redni < p_redni and odgovoreno_u is not null
        and redni > coalesce((select max(redni) from igra.odgovori where kviz_id = p_kviz and redni < p_redni
                                and not coalesce(tocno, false) and coalesce(odgovor->>'vrsta', '') <> 'preskoceno'), -1)
        and coalesce(odgovor->>'vrsta', '') <> 'preskoceno';
    update igra.kvizovi set niz = n where id = p_kviz;
    rez := jsonb_build_object('niz', n);
  else
    if o.odgovoreno_u is not null then raise exception 'Na ovo pitanje je već odgovoreno.'; end if;

    if p_joker = 'pola' then
      if not (p ? 'ponudeno') or jsonb_array_length(p->'ponudeno') < 3 then raise exception 'Ovdje nema što prepoloviti.'; end if;
      poz := igra.netocne_pozicije(p, o);
      rez := jsonb_build_object('ukloni', to_jsonb(poz[1:greatest(jsonb_array_length(p->'ponudeno') - 2, 1)]));

    elsif p_joker = 'vrijeme' then
      update igra.odgovori set vrijeme_ms = vrijeme_ms + 10000 where kviz_id = p_kviz and redni = p_redni
        returning * into o;
      rez := jsonb_build_object('vrijemeMs', greatest(o.vrijeme_ms - (extract(epoch from clock_timestamp() - o.pocetak) * 1000)::int, 0));

    elsif p_joker = 'zalog' then
      rez := jsonb_build_object('zalog', true);

    elsif p_joker = 'natuknica' then
      if p ? 'ponudeno' and jsonb_array_length(p->'ponudeno') >= 3 then
        poz := igra.netocne_pozicije(p, o);
        rez := jsonb_build_object('ukloni', jsonb_build_array(poz[1]), 'tekst', 'Jedan netočan odgovor je uklonjen.');
      elsif p ? 'poredaj' then
        rez := jsonb_build_object('tekst', 'Prva stavka: ' || (p->'poredaj'->'stavke'->>0) || '.');
      elsif p ? 'tvrdnje' then
        i := floor(random() * jsonb_array_length(p->'tvrdnje'))::int;
        rez := jsonb_build_object('tekst', format('Tvrdnja %s je %s.', i + 1,
          case when (p->'tvrdnje'->i->>'tocno')::boolean then 'točna' else 'netočna' end));
      elsif p ? 'asocijacije' then
        select x.kk, y.pp into kol, pol
          from generate_series(0, jsonb_array_length(p->'asocijacije'->'kolone') - 1) as x(kk), generate_series(0, 3) as y(pp)
          where not ((x.kk || '-' || y.pp) = any(o.otvorena_polja))
          order by random() limit 1;
        if kol is null then raise exception 'Sva polja su već otvorena.'; end if;
        rez := jsonb_build_object('tekst', format('Polje %s%s: %s', substr(slova, kol + 1, 1), pol + 1,
          p->'asocijacije'->'kolone'->kol->'polja'->>pol));
      elsif p ? 'prihvatljivi' then
        a := p->'prihvatljivi'->>0;
        rez := jsonb_build_object('tekst', format('Prvo slovo: %s. Ukupno slova: %s.', upper(left(a, 1)),
          length(regexp_replace(a, '[^[:alpha:]]', '', 'g'))));
      else
        raise exception 'Za ovo pitanje nema natuknice.';
      end if;

    elsif p_joker = 'preskoci' then
      update igra.odgovori
        set odgovoreno_u = clock_timestamp(), odgovor = '{"vrsta":"preskoceno"}', tocno = null, udio = 0, bodovi = 0,
            napustio = false, komentar = null
        where kviz_id = p_kviz and redni = p_redni;
      -- niz točnih se ne prekida (kvizovi.niz ostaje)
      select count(*), count(*) filter (where o2.tocno) into odgovoreno, tocnih
        from igra.odgovori o2 where o2.kviz_id = p_kviz and o2.odgovoreno_u is not null;
      rez := jsonb_strip_nulls(jsonb_build_object(
        'preskoceno', true, 'tocno', false, 'udio', 0, 'bodovi', 0, 'ukupnoBodova', k.ukupno_bodova, 'niz', k.niz,
        'istekloVrijeme', false, 'napustio', false,
        'prikazTocno', p->'prikazTocno', 'objasnjenje', p->'objasnjenje',
        'komentar', 'Samostalnost je precijenjena. Nastavljamo.',
        'zavrsno', case when odgovoreno >= array_length(k.pitanja, 1) then
           (select tekst from igra.komentari where ishod = 'kraj' and prag <= floor(100.0 * tocnih / odgovoreno) order by prag desc limit 1) end,
        'tocanIndeks', case when p ? 'tocanIndeks' then array_position(o.pomijesano, (p->>'tocanIndeks')::int) - 1 end,
        'tvrdnjeTocno', (select jsonb_agg(t->'tocno' order by ord) from jsonb_array_elements(p->'tvrdnje') with ordinality as x(t, ord)),
        'tocanRedoslijed', p->'poredaj'->'stavke',
        'koloneRjesenja', (select jsonb_agg(jsonb_build_object('polja', c->'polja', 'rjesenje', c->'prihvatljivi'->0) order by ord)
                           from jsonb_array_elements(p->'asocijacije'->'kolone') with ordinality as x(c, ord))
      ));
    end if;
  end if;

  update igra.kvizovi set jokeri = jokeri || p_joker where id = p_kviz;
  update igra.odgovori set jokeri = jokeri || p_joker where kviz_id = p_kviz and redni = p_redni;
  return rez || jsonb_build_object('iskoristeni', to_jsonb(k.jokeri || p_joker));
end $$;

revoke all on function public.jokeri_kviza(uuid), public.iskoristi_joker(uuid, int, text) from public;
grant execute on function public.jokeri_kviza(uuid), public.iskoristi_joker(uuid, int, text) to anon, authenticated;
