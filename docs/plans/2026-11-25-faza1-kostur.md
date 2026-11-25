# Faza 1: kostur i izgled, plan izvedbe

> Izvedba: superpowers:executing-plans (native), koraci s `- [ ]`.

**Cilj:** igra koja se pokreće lokalno, s TV izgledom, svih 10 tipova pitanja (po jedno probno pitanje), tajmerom, bodovanjem i provjerom upisanih odgovora.

**Arhitektura:** Vite + čisti TypeScript. Sučelje razgovara samo sa sučeljem `Api` (`src/api/tip.ts`). U fazi 1 to sučelje implementira `src/api/lokalni.ts`, lažni "server" koji drži točne odgovore u svojem modulu i vraća pitanje bez njih. U fazi 2 se zamjenjuje sa `src/api/supabase.ts` (RPC), a sučelje se ne mijenja.

**Tehnologija:** Vite, TypeScript, Vitest. Zvukovi se generiraju preko Web Audio API-ja, bez zvučnih datoteka.

**Specifikacija:** `../podaci/SPEC.md`

## Globalna ograničenja
- Sav tekst je na standardnom hrvatskom (ijekavica, tjedan, tisuća, nogomet, igrač).
- Upis: bez razlike velikih i malih slova, bez dijakritika (č/ć→c, ž→z, š→s, đ→dj), dopuštena sitna tipfelerska greška, više prihvatljivih odgovora.
- Nakon odgovora: točan odgovor + 1–2 rečenice objašnjenja.
- Bez emojija, vlastite SVG ikone, boja po kategoriji.
- `prefers-reduced-motion` gasi animacije, gumb za isključivanje zvuka.
- Tekst pitanja se ne može označiti ni kopirati, ponuđeni odgovori se miješaju.
- `visibilitychange` za vrijeme pitanja: upozorenje i umanjeni bodovi.
- Mobile-first.

## Fokus pregleda
1. Godina kao odgovor (npr. "1991") ne smije prihvatiti tipfeler: brojevi moraju biti točni.
2. Kratki odgovori (≤4 znaka) ne smiju prihvatiti grešku, inače "Rim" = "Rig".
3. Prazan upis ili samo razmaci se ne smiju računati kao odgovor.
4. Isteklo vrijeme se mora računati kao netočan odgovor, ne kao "nema odgovora koji ruši igru".
5. Dvostruki klik na gumb za odgovor ne smije poslati dva odgovora.

---

### Zadatak 1: kostur projekta
**Datoteke:** `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`
- [ ] `npm create`-ekvivalent ručno, ovisnosti: vite, typescript, vitest (dev).
- [ ] Skripte: `dev`, `build`, `test`.
- [ ] Provjera: `npm run build` prolazi.

### Zadatak 2: provjera odgovora
**Datoteke:** `src/provjera.ts`, `src/provjera.test.ts`
**Daje:** `normaliziraj(s: string): string`, `udaljenost(a: string, b: string): number`, `jePrihvatljiv(upis: string, prihvatljivi: string[]): boolean`
- [ ] Testovi: "Čakovec"≈"cakovec", "Đakovo"≈"djakovo", "Osjek"≈"Osijek", "1990"≠"1991", "Rim"≠"Rig", ""≠ništa, više prihvatljivih.
- [ ] Tolerancija: brojevi 0; dužina ≤4 → 0; ≤8 → 1; inače 2.

### Zadatak 3: bodovanje i postavke
**Datoteke:** `src/postavke.ts`, `src/bodovanje.ts`, `src/bodovanje.test.ts`
**Daje:** `POSTAVKE` (vremena po tipu, osnovni bodovi, bonus, niz, kazna), `izracunajBodove(u: {tocno: boolean, preostaloMs: number, ukupnoMs: number, niz: number, napustio: boolean, udio?: number}): number`
- [ ] Testovi: netočno = 0; točno bez žurbe = osnova; niz povećava; napuštanje kartice prepolovi.

### Zadatak 4: API sučelje i lokalni server
**Datoteke:** `src/api/tip.ts`, `src/api/lokalni.ts`, `src/api/lokalni.test.ts`, `src/podaci/probna-pitanja.ts`
**Daje:** `Api { pocniKviz(): Promise<{kvizId, brojPitanja}>; dohvatiPitanje(kvizId, redni): Promise<JavnoPitanje>; posaljiOdgovor(kvizId, redni, odgovor, napustio): Promise<Rezultat> }`
- [ ] Test: `JavnoPitanje` ne sadrži polja `tocno`/`prihvatljivi`/`objasnjenje`.
- [ ] Test: drugi odgovor na isto pitanje se odbija.
- [ ] Test: odgovor nakon isteka vremena = netočno, 0 bodova.

### Zadatak 5: sučelje
**Datoteke:** `src/styles.css`, `src/kategorije.ts`, `src/ui/*.ts`, `src/zvuk.ts`
- [ ] Početni zaslon, kviz, prikaz rezultata nakon svakog pitanja, završni zaslon.
- [ ] Renderer za svaki od 10 tipova.
- [ ] Provjera: `npm run build`, ručno odigrano u pregledniku, na uskom zaslonu (mobitel).
