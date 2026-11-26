-- 0013: poruke iz zbirke "Kviz s karakterom" (PDF korisnice, 26.11.2026.).
-- Nove skupine: tesko, povratak, lako, prekid, niz s pragom (točno toliko točnih zaredom),
-- niz_netocnih s pragom, kraj s pragom (postotak točnih), bonus.
-- Stare poruke izbačene, osim skupine varanje i korisničine "Točno mislim da ipak guglaš na drugom uređaju" (sada u tesko).
-- Podaci (na kraju datoteke) generirani iz src/podaci/komentari.ts.
-- Odabir: igra.komentar_izbor uzima prvu skupinu s popisa ključeva koja ima poruku neiskorištenu u ovom kvizu.

alter table igra.komentari add column prag int;
alter table igra.komentari drop constraint komentari_ishod_check;
alter table igra.komentari add constraint komentari_ishod_check check (ishod in
  ('varanje','brzo','tocno','tesko','povratak','netocno','lako','prekid','isteklo','djelomicno','niz','niz_netocnih','kraj','bonus'));

-- p_kljucevi: npr. {'niz:5','tesko','tocno'}; ključ je ishod ili ishod:prag.
create function igra.komentar_izbor(p_kviz uuid, p_kljucevi text[]) returns text
language sql volatile set search_path = '' as $$
  select c.tekst
  from igra.komentari c
  join unnest(p_kljucevi) with ordinality as k(kljuc, ord) on c.ishod || coalesce(':' || c.prag, '') = k.kljuc
  where not exists (select 1 from igra.odgovori o where o.kviz_id = p_kviz and o.komentar = c.tekst)
  order by k.ord, random()
  limit 1
$$;

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

  -- Kraj kviza: poruka prema postotku točnih (nadolje), bonus uz 100 %.
  select count(*), count(*) filter (where o2.tocno) into odgovoreno, tocnih
    from igra.odgovori o2 where o2.kviz_id = p_kviz and o2.odgovoreno_u is not null;
  if odgovoreno >= array_length(k.pitanja, 1) then
    postotak := floor(100.0 * tocnih / odgovoreno);
    select tekst into v_zavrsno from igra.komentari where ishod = 'kraj' and prag <= postotak order by prag desc limit 1;
    if postotak = 100 and odgovoreno >= 10 then
      select tekst into v_bonus from igra.komentari where ishod = 'bonus' limit 1;
    end if;
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

-- Podaci: stare poruke van (osim varanja), nove iz zbirke.
delete from igra.komentari where ishod <> 'varanje';
insert into igra.komentari (ishod, tekst, prag) values
($q$netocno$q$, $q$Kreativno, ali činjenično neodrživo.$q$, null),
($q$netocno$q$, $q$Samopouzdanje 100 %, preciznost nešto manje.$q$, null),
($q$netocno$q$, $q$Zanimljiva teorija. Znanost se ne slaže.$q$, null),
($q$netocno$q$, $q$Odgovor ima karakter. Nažalost, nema točnost.$q$, null),
($q$netocno$q$, $q$U nekom paralelnom svemiru možda i jest.$q$, null),
($q$netocno$q$, $q$Lijepo zamišljeno, pogrešno izvedeno.$q$, null),
($q$netocno$q$, $q$Ni povjerenstvo za žalbe ovdje ne može pomoći.$q$, null),
($q$netocno$q$, $q$Cijenimo umjetničku slobodu, ali tražimo činjenice.$q$, null),
($q$netocno$q$, $q$Taj odgovor još čeka znanstvenu potvrdu.$q$, null),
($q$netocno$q$, $q$Mašta je divna stvar. Osim na ovom pitanju.$q$, null),
($q$netocno$q$, $q$Činjenice su upravo uložile prigovor.$q$, null),
($q$netocno$q$, $q$Pokušaj vrijedan pažnje, ali ne i boda.$q$, null),
($q$netocno$q$, $q$Logika je krenula na put, ali promašila izlaz.$q$, null),
($q$netocno$q$, $q$Svemir je velik, ali ni u njemu nema opravdanja za ovaj odgovor.$q$, null),
($q$netocno$q$, $q$Nije točno, ali barem nije dosadno!$q$, null),
($q$tocno$q$, $q$Mozak uredno servisiran!$q$, null),
($q$tocno$q$, $q$Neuroni surađuju. Divota!$q$, null),
($q$tocno$q$, $q$Znanje evidentirano, ego može malo narasti.$q$, null),
($q$tocno$q$, $q$Sumnjivo dobro!$q$, null),
($q$tocno$q$, $q$Mentalna kondicija na zavidnoj razini.$q$, null),
($q$tocno$q$, $q$Bod u džepu, osmijeh na licu!$q$, null),
($q$tocno$q$, $q$Činjenice i ti očito ste u dobrim odnosima.$q$, null),
($q$tocno$q$, $q$Intelektualni promet odvija se bez zastoja.$q$, null),
($q$tocno$q$, $q$Točno! Danas se očito ne radi na rezervi.$q$, null),
($q$tocno$q$, $q$Mozak opravdava troškove održavanja.$q$, null),
($q$tesko$q$, $q$Točno mislim da ipak guglaš na drugom uređaju.$q$, null),
($q$tesko$q$, $q$Je li tebe Wikipedia zvala na konzultacije?$q$, null),
($q$tesko$q$, $q$Molimo ostale igrače da ne paničare.$q$, null),
($q$tesko$q$, $q$Ovo pitanje je trebalo biti teško. Hvala na kvarenju koncepta.$q$, null),
($q$tesko$q$, $q$Einstein se upravo diskretno nakašljao.$q$, null),
($q$tesko$q$, $q$Tvoj mozak očito ima dodatnu opremu.$q$, null),
($q$tesko$q$, $q$Intelektualna demonstracija sile!$q$, null),
($q$tesko$q$, $q$Ovakve odgovore trebalo bi oporezivati kao luksuz.$q$, null),
($q$tesko$q$, $q$Pitanje je upravo izgubilo samopouzdanje.$q$, null),
($q$tesko$q$, $q$Komisija za težinu pitanja podnosi ostavku.$q$, null),
($q$tesko$q$, $q$Ovo više nije znanje. Ovo je intelektualni bezobrazluk.$q$, null),
($q$tesko$q$, $q$Je li taj mozak tvornički ili naknadno ugrađen?$q$, null),
($q$tesko$q$, $q$Enciklopedije su upravo osjetile konkurenciju.$q$, null),
($q$tesko$q$, $q$Netko je očito čitao i sitna slova.$q$, null),
($q$tesko$q$, $q$Skidamo kapu. Iako je nemamo.$q$, null),
($q$tesko$q$, $q$Očekivali smo otpor, ne kapitulaciju pitanja.$q$, null),
($q$prekid$q$, $q$I svemir je konačno uspostavio ravnotežu.$q$, null),
($q$prekid$q$, $q$Aha! Ipak si ljudsko biće!$q$, null),
($q$prekid$q$, $q$Dobro je. Već smo sumnjali na umjetnu inteligenciju.$q$, null),
($q$prekid$q$, $q$Imperij je doživio manji administrativni problem.$q$, null),
($q$prekid$q$, $q$Jedna rupa na autocesti genijalnosti.$q$, null),
($q$prekid$q$, $q$Ne brini, ni Ferrari ne prolazi svaku krivinu savršeno.$q$, null),
($q$prekid$q$, $q$Konkurencija je upravo kolektivno odahnula.$q$, null),
($q$prekid$q$, $q$Kruna je malo nakrivljena, ali još je na glavi.$q$, null),
($q$lako$q$, $q$Ovo pitanje nije imalo ambicije biti teško.$q$, null),
($q$lako$q$, $q$Čak je i pitanje iznenađeno.$q$, null),
($q$lako$q$, $q$Dogodila se manja prometna nesreća između pitanja i odgovora.$q$, null),
($q$lako$q$, $q$Pretpostavljamo da je prst djelovao samostalno.$q$, null),
($q$lako$q$, $q$Mozak i prst očito nisu održali pripremni sastanak.$q$, null),
($q$lako$q$, $q$Ovo ćemo pripisati tehničkim poteškoćama.$q$, null),
($q$lako$q$, $q$Pitanje je došlo u miru. Nije očekivalo ovakav rasplet.$q$, null),
($q$lako$q$, $q$Čak i najbolji ponekad promaše prazan gol.$q$, null),
($q$brzo$q$, $q$Pitanje se nije stiglo ni udobno smjestiti.$q$, null),
($q$brzo$q$, $q$Brže od vlastite sjene!$q$, null),
($q$brzo$q$, $q$Mozak na optičkom internetu.$q$, null),
($q$brzo$q$, $q$Jesmo li uopće stigli postaviti pitanje?$q$, null),
($q$brzo$q$, $q$Neuroni očito nemaju ograničenje brzine.$q$, null),
($q$brzo$q$, $q$Ovdje ni štoperica nema samopouzdanja.$q$, null),
($q$brzo$q$, $q$Intelektualni sprint bez zagrijavanja!$q$, null),
($q$isteklo$q$, $q$Vrijeme je isteklo, filozofiranje se nastavlja.$q$, null),
($q$isteklo$q$, $q$Dok smo razmišljali, pitanje je otišlo u mirovinu.$q$, null),
($q$isteklo$q$, $q$Temeljita analiza. Šteta što nije završena.$q$, null),
($q$isteklo$q$, $q$Vrijeme, za razliku od nas, nije imalo strpljenja.$q$, null),
($q$isteklo$q$, $q$Odgovor je vjerojatno još na putu.$q$, null),
($q$isteklo$q$, $q$Odluka je očito zahtijevala sjednicu upravnog odbora.$q$, null),
($q$povratak$q$, $q$Habemus odgovor!$q$, null),
($q$povratak$q$, $q$Sustav je uspješno ponovno pokrenut.$q$, null),
($q$povratak$q$, $q$Neuroni se vratili s godišnjeg!$q$, null),
($q$povratak$q$, $q$Povratak otpisanih!$q$, null),
($q$povratak$q$, $q$Feniks se digao iz pepela netočnih odgovora.$q$, null),
($q$povratak$q$, $q$Mentalna služba ponovno je operativna.$q$, null),
($q$povratak$q$, $q$Evo ga! Počela je druga sezona!$q$, null),
($q$niz$q$, $q$Neuroni su se zagrijali!$q$, 3),
($q$niz$q$, $q$Ovo polako prestaje biti slučajnost.$q$, 4),
($q$niz$q$, $q$Mozak prešao u sportsku brzinu!$q$, 5),
($q$niz$q$, $q$Intelektualna mašinerija u punom pogonu.$q$, 6),
($q$niz$q$, $q$Konkurencija počinje preispitivati životne odluke.$q$, 7),
($q$niz$q$, $q$Molimo mozak da poštuje ograničenje brzine.$q$, 8),
($q$niz$q$, $q$Kviz počinje osjećati nelagodu.$q$, 9),
($q$niz$q$, $q$Aktiviran intelektualni terorizam nad pitanjima!$q$, 10),
($q$niz$q$, $q$Administracija kviza sazvala je krizni sastanak.$q$, 15),
($q$niz$q$, $q$Kviz je došao testirati tebe. Situacija se preokrenula.$q$, 20),
($q$niz$q$, $q$Predlažemo da ubuduće ti sastavljaš pitanja.$q$, 25),
($q$niz$q$, $q$Dobro, profesorska ekipo, možemo li mi sad kući?$q$, 30),
($q$niz_netocnih$q$, $q$Neuroni se još dogovaraju.$q$, 2),
($q$niz_netocnih$q$, $q$Mozak je očito na pauzi za kavu.$q$, 3),
($q$niz_netocnih$q$, $q$Trenutačno se testiraju alternativne činjenice.$q$, 4),
($q$niz_netocnih$q$, $q$Imamo li rezervni plan ili improviziramo do kraja?$q$, 5),
($q$niz_netocnih$q$, $q$Služba za mentalnu tehničku podršku je obaviještena.$q$, 6),
($q$niz_netocnih$q$, $q$Ovo više nije niz. Ovo je umjetnički pravac.$q$, 7),
($q$niz_netocnih$q$, $q$Svaki veliki povratak zahtijeva dramatičan početak.$q$, 8),
($q$kraj$q$, $q$Statistički fascinantno. Čak je i slučajnost ostala bez teksta.$q$, 0),
($q$kraj$q$, $q$Danas smo više istraživali granice mogućeg.$q$, 1),
($q$kraj$q$, $q$Rezultat skroman, iskustvo neprocjenjivo.$q$, 20),
($q$kraj$q$, $q$Potencijal postoji. Dokazi se još prikupljaju.$q$, 40),
($q$kraj$q$, $q$Znanje i improvizacija u koaliciji.$q$, 50),
($q$kraj$q$, $q$Solidna mašinerija, povremeno zaškripi.$q$, 60),
($q$kraj$q$, $q$Ozbiljna prijetnja prosjeku.$q$, 70),
($q$kraj$q$, $q$Mozak s premium pretplatom.$q$, 80),
($q$kraj$q$, $q$Intelektualna aristokracija.$q$, 90),
($q$kraj$q$, $q$Kviz je polagao ispit kod tebe. Položio je jedva.$q$, 100),
($q$bonus$q$, $q$Poštovani, ovo je rekreativni kviz, a ne demonstracija intelektualne nadmoći. Molimo za malo kolegijalnosti.$q$, null);
