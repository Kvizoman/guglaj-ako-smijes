# Guglaj ako smiješ

Online kviz igra znanja za odrasle, na hrvatskom jeziku. Devet kategorija, sat koji ne čeka i pitanja na koja se ne isplati guglati. Igra se u pregledniku, bez registracije, i prilagođena je mobitelu.

Javna adresa: https://kvizoman.github.io/guglaj-ako-smijes/

## Kako se igra

- **Kviz dana**: 18 pitanja, po 2 iz svake kategorije, isti za sve igrače. Može se odigrati jednom na dan (dan po vremenskoj zoni Europe/Sarajevo, novi kviz u ponoć). Ako se stranica zatvori usred kviza, kviz se nastavlja gdje je stao.
- **Trening**: 10 pitanja iz jedne kategorije, koliko god puta. Bira pitanja koja su već bila u kvizu dana, pa ne otkriva buduća. Ne ulazi u rang-liste ni lige.
- **Isprobaj igru**: 11 stalnih pitanja, po jedno za svaki tip, za upoznavanje igre. Ne broji se nigdje.
- **Rang-liste**: dnevna, tjedna i ukupna, za sve kategorije zajedno i za svaku posebno. Broje se samo bodovi iz kviza dana.
- **Nadimak i PIN**: pri prvom ulasku igrač upiše nadimak, preglednik ga zapamti. S PIN-om od 4 znamenke može nastaviti s istim nadimkom na drugom uređaju („Već igram na drugom uređaju”).

### Kako napraviti ligu

1. Na početnoj stranici, u odjeljku **Lige**, odaberi **Napravi ligu** i upiši naziv (npr. „Zbornica”).
2. Na stranici lige odaberi **Kopiraj pozivnicu** (ili **Podijeli** na mobitelu) i pošalji link ekipi. Link izgleda ovako: `https://kvizoman.github.io/guglaj-ako-smijes/#liga-K7P2QX`.
3. Tko otvori link i upiše nadimak, postaje član lige.

Liga se boduje po tjednu, od ponedjeljka do nedjelje: zbrajaju se bodovi iz kviza dana. Na stranici lige je tjedni poredak, poredak po kategorijama i **Dvorana slavnih** s pobjednicima prošlih tjedana. Osnivač lige u odjeljku **Uredi ligu** može promijeniti naziv i ukloniti člana (uklonjeni član ne može se vratiti istom pozivnicom).

## Pokretanje na svom računalu

Treba Node.js (LTS).

```
npm install
npm run dev
```

Igra se otvara na http://localhost:5173 i koristi pravu bazu. Za rad bez interneta dodaj `?lokalno` na adresu (http://localhost:5173/?lokalno): tada igra radi s 11 probnih pitanja u pregledniku, bez rang-lista i liga. Taj način postoji samo pri razvoju, nije dio objavljene igre.

Ostale naredbe:

| Naredba | Što radi |
|---|---|
| `npm test` | automatske provjere (bodovanje, provjera odgovora, sva pitanja) |
| `npm run build` | izrada verzije za objavu u mapu `dist/` |
| `npm run provjera-servera` | provjera baze izvana (odgovori se ne šalju prerano, vrijeme mjeri server) |
| `npm run uvoz-pitanja` | uvoz pitanja u bazu (vidi niže) |
| `npm run stanje-pitanja` | koliko pitanja po kategoriji još nije bilo u kvizu dana |

## Pitanja

**Mapa `pitanja/` namjerno nije u javnom repozitoriju na GitHubu**, jer sadrži točne odgovore. Pitanja se čuvaju na računalu autorice (mapa `pitanja/` uz ovaj README) i u bazi. Isto vrijedi za mapu `pregled/`. Obje su u `.gitignore`.

Jedna datoteka po kategoriji:

| Datoteka | Kategorija |
|---|---|
| `povijest.json` | Povijest |
| `zemljopis.json` | Zemljopis |
| `biologija.json` | Biologija (tijelo i prehrana) |
| `umjetnost.json` | Umjetnost |
| `knjizevnost.json` | Književnost |
| `glazba.json` | Glazba |
| `sport.json` | Sport (većinom nogomet) |
| `video_igre.json` | Video-igre |
| `znacenje_rijeci.json` | Značenje riječi |

Svako pitanje ima polje `izvor` s poveznicom na kojoj je činjenica provjerena i datumom provjere. Ako piše „Opće znanje, nije zasebno pretraženo”, činjenica nije provjerena u vanjskom izvoru.

Čitljiv pregled jedne kategorije (tablica s pitanjima, odgovorima i izvorima) sprema se u `pregled/<kategorija>.html`:

```
node scripts/pregled-pitanja.mjs povijest
```

### Kako zatražiti nova pitanja

Nova pitanja piše Claude (Claude Code), po istim pravilima kao i postojeća. Dovoljno je u Claude Codeu, otvorenom u mapi projekta, napisati zahtjev, na primjer:

- „Dodaj 20 novih pitanja u Zemljopis, više o Bosni i Hercegovini.”
- „U Sportu zamijeni pitanja o Svjetskom prvenstvu, imamo novog prvaka.”
- „Pitanje povijest-014 je pretežak, napravi lakše.”
- „Provjeri sva pitanja iz Glazbe, prošlo je godinu dana.”

Pravila koja Claude mora poštovati:

1. Svaku činjenicu provjeriti na webu i u polje `izvor` upisati poveznicu i datum. Nesigurne činjenice se izbacuju.
2. Autorska prava: stihovi i odlomci samo iz narodnih pjesama i tekstova objavljenih prije 1929. Tekstovi pjesama se u Glazbi ne citiraju. Slike samo u javnom vlasništvu, upisane u `CREDITS.md`, s nasumičnim imenom datoteke (ime ne smije otkriti odgovor).
3. Jezik: hrvatski standard, ijekavica, bez em crtice.
4. Pitanje ne smije otkrivati odgovor na drugo pitanje.
5. Prije uvoza mora proći automatska provjera (`npm test`).

Nogometna pitanja s rekordima i naslovima treba pregledati nakon svakog velikog natjecanja (svjetsko i europsko prvenstvo, finale Lige prvaka, Zlatna lopta).

### Kad dodati nova pitanja

```
npm run stanje-pitanja
```

Pokazuje koliko pitanja po kategoriji još nije bilo u kvizu dana i za koliko dana ih ima. Kviz dana uzima 2 pitanja iz svake kategorije dnevno, pa 40 pitanja traje 20 dana. Kad se iscrpe, pitanja se ponavljaju ravnomjerno (najprije ona koja su bila najrjeđe), a nova pitanja dobivaju prednost čim se uvezu. Kad skripta javi manje od tjedan dana, vrijeme je za nova pitanja.

**Podsjetnik e-mailom:** GitHub svako jutro sam pokrene tu provjeru (`.github/workflows/podsjetnik.yml`). Kad u nekoj kategoriji ostane manje od 7 dana pitanja, otvori obavijest (issue) „Vrijeme je za nova pitanja” u repozitoriju i GitHub je pošalje e-mailom. Nova obavijest dolazi tek kad se stara zatvori. Provjera koristi tajnu `UVOZ_TOKEN` u postavkama repozitorija (Settings, Secrets and variables, Actions). Ako se token promijeni, treba promijeniti i tu tajnu.

### Uvoz pitanja u bazu

```
npm run uvoz-pitanja            # sve kategorije
npm run uvoz-pitanja -- sport   # samo jedna kategorija
```

Naredba najprije provjeri sva pitanja, a uvozi samo ako je provjera prošla. Postojeća pitanja se ažuriraju. Pitanje koje je izbrisano iz datoteke u bazi postaje neaktivno, ali se ne briše jer ostaju stari odgovori igrača.

Za uvoz treba datoteka `.env.local` s retkom `UVOZ_TOKEN=...`. To je tajni ključ i ne smije se dijeliti ni stavljati na GitHub (zato je u `.gitignore`). U bazi se čuva samo njegov sažetak. Ako se token izgubi, Claude može napraviti novi.

## Postavke igre

Postavke su u bazi (Supabase), u tablici `igra.postavke` (jedan redak, stupac `podaci`). Mijenjaju se u Supabase nadzornoj ploči: **Table Editor**, shema `igra`, tablica `postavke`. Promjena vrijedi odmah za nova pitanja.

| Postavka | Zadano | Značenje |
|---|---|---|
| `vrijemeSek.odabir` | 15 | sekunde za pitanje s ponuđenim odgovorima |
| `vrijemeSek.upis` | 25 | sekunde za pitanje s upisom odgovora |
| `vrijemeSek.anagram` | 20 | sekunde za anagram |
| `vrijemeSek.asocijacije` | 90 | sekunde za cijele asocijacije |
| `vrijemeSek.poredaj` | 30 | sekunde za poredaj |
| `vrijemeSek.tragovi` | 40 | sekunde za pogodi po tragovima |
| `vrijemeSek.tocnoNetocnoPoTvrdnji` | 6 | sekunde po tvrdnji kod točno/netočno |
| `bodovi.osnova` | 100 | osnovni bodovi za točan odgovor |
| `bodovi.bonusBrzina` | 50 | najviše dodatnih bodova za brzinu (puni bonus za odgovor odmah, nula na isteku sata) |
| `bodovi.nizKorak` | 0,1 | koliko raste množitelj za svaki točan odgovor u nizu (×1,1, ×1,2 …) |
| `bodovi.nizNajvise` | 5 | najviše koraka niza (najveći množitelj ×1,5) |
| `bodovi.kaznaNapustio` | 0,5 | množitelj bodova ako igrač tijekom pitanja ode na drugu karticu ili aplikaciju |
| `bodovi.asocijacijeKolona` | 15 | bodovi za svaku riješenu kolonu kad konačno rješenje asocijacije nije pogođeno |
| `milostMs` | 1500 | tolerancija za kašnjenje mreže, u milisekundama |
| `pitanjaPoKategorijiDnevno` | 2 | broj pitanja po kategoriji u kvizu dana (vrijedi od sljedećeg dana) |

Bodovi za pitanje: (osnova + bonus za brzinu) × udio točnosti × množitelj niza × kazna za izlazak. Kod tragova i asocijacija udio je manji što je više otkriveno.

Ako se promijeni `pitanjaPoKategorijiDnevno`, treba promijeniti i tekst „18 pitanja, po 2 iz svake kategorije” na početnoj stranici (`src/main.ts`).

Datoteka `src/postavke.ts` vrijedi samo za lokalni način rada (`?lokalno`).

## Objava

Igra se objavljuje na GitHub Pages automatski (GitHub Actions, `.github/workflows/objava.yml`) pri svakom slanju promjena na granu `main`: provjere, izrada, objava. Tijek objave vidi se na GitHubu pod **Actions**.

## Baza i sigurnost

- Baza je Supabase. Sve tablice su u privatnoj shemi `igra`, s uključenim Row Level Securityjem i bez izravnog pristupa iz preglednika. Igra razgovara s bazom samo preko funkcija (RPC).
- Točni odgovori ne šalju se u preglednik prije nego igrač odgovori. Vrijeme za svako pitanje mjeri server.
- Promjene baze su u `supabase/migrations/`, po redu.
- Ključ u `src/api/konfig.ts` je javni (publishable) ključ i smije biti u repozitoriju: njime se ne može čitati ni mijenjati baza, samo pozivati funkcije igre.

## Autorska prava

Izvori i licencije slika: `CREDITS.md`. Stihovi i odlomci su samo iz narodnih pjesama i tekstova objavljenih prije 1929. Nema grbova klubova, logotipa ni snimaka zaslona igara.
