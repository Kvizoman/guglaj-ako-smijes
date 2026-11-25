import { describe, it, expect } from 'vitest';
import { LokalniApi } from './lokalni';
import { PROBNA_PITANJA } from '../podaci/probna-pitanja';
import type { PitanjeBaza } from '../tipovi';

function sa(tip: string): PitanjeBaza[] {
  return PROBNA_PITANJA.filter((p) => p.tip === tip);
}

function lazniSat() {
  let t = 1_000_000;
  return { sat: () => t, pomakni: (ms: number) => { t += ms; } };
}

describe('LokalniApi', () => {
  it('javno pitanje ne sadrži točne odgovore ni objašnjenje', async () => {
    const api = new LokalniApi(PROBNA_PITANJA);
    const { kvizId, brojPitanja } = await api.pocniKviz();
    for (let r = 0; r < brojPitanja; r++) {
      const p = await api.dohvatiPitanje(kvizId, r);
      const json = JSON.stringify(p);
      for (const kljuc of ['tocanIndeks', 'prihvatljivi', 'objasnjenje', 'prikazTocno', 'konacno', 'izvor']) {
        expect(json).not.toContain(kljuc);
      }
      if (p.tip === 'tocno_netocno') expect(json).not.toMatch(/"tocno"/);
      if (p.tip === 'asocijacije') expect(json).not.toContain('Drava');
      if (p.tip === 'tragovi') expect(json).not.toContain('Pažitnov');
      await api.posaljiOdgovor(kvizId, r, { vrsta: 'nista' }, false);
    }
  });

  it('drugi odgovor na isto pitanje se odbija', async () => {
    const api = new LokalniApi(sa('odabir'));
    const { kvizId } = await api.pocniKviz();
    await api.dohvatiPitanje(kvizId, 0);
    await api.posaljiOdgovor(kvizId, 0, { vrsta: 'indeks', indeks: 0 }, false);
    await expect(api.posaljiOdgovor(kvizId, 0, { vrsta: 'indeks', indeks: 1 }, false)).rejects.toThrow();
  });

  it('odgovor nakon isteka vremena je netočan i nosi 0 bodova', async () => {
    const s = lazniSat();
    const api = new LokalniApi(sa('opis'), s.sat);
    const { kvizId } = await api.pocniKviz();
    await api.dohvatiPitanje(kvizId, 0);
    s.pomakni(25_000 + 2_000);
    const r = await api.posaljiOdgovor(kvizId, 0, { vrsta: 'tekst', tekst: 'Francuska' }, false);
    expect(r.istekloVrijeme).toBe(true);
    expect(r.tocno).toBe(false);
    expect(r.bodovi).toBe(0);
  });

  it('ponovni dohvat ne vraća vrijeme na početak', async () => {
    const s = lazniSat();
    const api = new LokalniApi(sa('opis'), s.sat);
    const { kvizId } = await api.pocniKviz();
    await api.dohvatiPitanje(kvizId, 0);
    s.pomakni(10_000);
    const p = await api.dohvatiPitanje(kvizId, 0);
    expect(p.vrijemeMs).toBe(15_000);
  });

  it('ne može se preskočiti na sljedeće pitanje bez odgovora', async () => {
    const api = new LokalniApi(PROBNA_PITANJA);
    const { kvizId } = await api.pocniKviz();
    await api.dohvatiPitanje(kvizId, 0);
    await expect(api.dohvatiPitanje(kvizId, 1)).rejects.toThrow();
  });

  it('odabir: točan indeks u izmiješanom poretku', async () => {
    const api = new LokalniApi(sa('odabir'));
    const { kvizId } = await api.pocniKviz();
    const p = await api.dohvatiPitanje(kvizId, 0);
    const i = p.ponudeno!.indexOf('Vatroslav Lisinski');
    const r = await api.posaljiOdgovor(kvizId, 0, { vrsta: 'indeks', indeks: i }, false);
    expect(r.tocno).toBe(true);
    expect(r.tocanIndeks).toBe(i);
    expect(r.bodovi).toBeGreaterThanOrEqual(100);
  });

  it('poredaj: točan redoslijed', async () => {
    const api = new LokalniApi(sa('poredaj'));
    const { kvizId } = await api.pocniKviz();
    const p = await api.dohvatiPitanje(kvizId, 0);
    const tocno = PROBNA_PITANJA.find((x) => x.tip === 'poredaj')!.poredaj!.stavke;
    const redoslijed = tocno.map((st) => p.stavke!.indexOf(st));
    const r = await api.posaljiOdgovor(kvizId, 0, { vrsta: 'redoslijed', redoslijed }, false);
    expect(r.tocno).toBe(true);
  });

  it('tragovi: kasniji pogodak nosi manje bodova', async () => {
    const s = lazniSat();
    const api = new LokalniApi(sa('tragovi'), s.sat);
    const a = await api.pocniKviz();
    await api.dohvatiPitanje(a.kvizId, 0);
    const rano = await api.posaljiOdgovor(a.kvizId, 0, { vrsta: 'tekst', tekst: 'tetris' }, false);

    const b = await api.pocniKviz();
    await api.dohvatiPitanje(b.kvizId, 0);
    await api.otkrijTrag(b.kvizId, 0);
    await api.otkrijTrag(b.kvizId, 0);
    const kasno = await api.posaljiOdgovor(b.kvizId, 0, { vrsta: 'tekst', tekst: 'tetris' }, false);
    expect(kasno.bodovi).toBeLessThan(rano.bodovi);
  });

  it('asocijacije: manje otvorenih polja = više bodova; kolone bez konačnog daju fiksne bodove', async () => {
    const s = lazniSat();
    const api = new LokalniApi(sa('asocijacije'), s.sat);
    const a = await api.pocniKviz();
    await api.dohvatiPitanje(a.kvizId, 0);
    await api.otvoriPolje(a.kvizId, 0, 0, 0);
    const malo = await api.posaljiOdgovor(a.kvizId, 0, { vrsta: 'tekst', tekst: 'voda' }, false);

    const b = await api.pocniKviz();
    await api.dohvatiPitanje(b.kvizId, 0);
    for (let k = 0; k < 4; k++) for (let pp = 0; pp < 4; pp++) await api.otvoriPolje(b.kvizId, 0, k, pp);
    const sve = await api.posaljiOdgovor(b.kvizId, 0, { vrsta: 'tekst', tekst: 'voda' }, false);
    expect(sve.bodovi).toBeLessThan(malo.bodovi);

    const c = await api.pocniKviz();
    await api.dohvatiPitanje(c.kvizId, 0);
    expect((await api.rijesiKolonu(c.kvizId, 0, 1, 'led')).tocno).toBe(true);
    expect((await api.rijesiKolonu(c.kvizId, 0, 2, 'krivo')).tocno).toBe(false);
    const krivo = await api.posaljiOdgovor(c.kvizId, 0, { vrsta: 'tekst', tekst: 'vatra' }, false);
    expect(krivo.tocno).toBe(false);
    expect(krivo.bodovi).toBe(15);
  });

  it('točno/netočno: djelomično točno daje djelomične bodove, ali prekida niz', async () => {
    const api = new LokalniApi(sa('tocno_netocno'));
    const { kvizId } = await api.pocniKviz();
    await api.dohvatiPitanje(kvizId, 0);
    const r = await api.posaljiOdgovor(kvizId, 0, { vrsta: 'tvrdnje', odgovori: [true, false, true, true] }, false);
    expect(r.udio).toBe(0.75);
    expect(r.tocno).toBe(false);
    expect(r.niz).toBe(0);
    expect(r.bodovi).toBeGreaterThan(0);
  });

  it('napuštanje kartice smanjuje bodove', async () => {
    const s = lazniSat();
    const api = new LokalniApi(sa('opis'), s.sat);
    const a = await api.pocniKviz();
    await api.dohvatiPitanje(a.kvizId, 0);
    const posteno = await api.posaljiOdgovor(a.kvizId, 0, { vrsta: 'tekst', tekst: 'Francuska' }, false);
    const b = await api.pocniKviz();
    await api.dohvatiPitanje(b.kvizId, 0);
    const napustio = await api.posaljiOdgovor(b.kvizId, 0, { vrsta: 'tekst', tekst: 'Francuska' }, true);
    expect(napustio.bodovi).toBe(posteno.bodovi / 2);
  });
});

describe('komentari', () => {
  it('svaki rezultat ima komentar; vlastiti komentar pitanja ima prednost', async () => {
    const api = new LokalniApi(sa('opis'));
    const { kvizId } = await api.pocniKviz();
    await api.dohvatiPitanje(kvizId, 0);
    const r = await api.posaljiOdgovor(kvizId, 0, { vrsta: 'tekst', tekst: 'Brazil' }, false);
    expect(r.komentar).toBe('Bolna tema, znamo. Bila je Francuska.');
  });
  it('isteklo vrijeme daje komentar iz skupine isteklo', async () => {
    const { KOMENTARI } = await import('../podaci/komentari');
    const s = lazniSat();
    const api = new LokalniApi(sa('anagram'), s.sat);
    const { kvizId } = await api.pocniKviz();
    await api.dohvatiPitanje(kvizId, 0);
    s.pomakni(60_000);
    const r = await api.posaljiOdgovor(kvizId, 0, { vrsta: 'nista' }, false);
    expect(KOMENTARI.isteklo).toContain(r.komentar);
  });
  it('brz točan odgovor daje pohvalu za brzinu', async () => {
    const { KOMENTARI } = await import('../podaci/komentari');
    const api = new LokalniApi(sa('anagram'), lazniSat().sat);
    const { kvizId } = await api.pocniKviz();
    await api.dohvatiPitanje(kvizId, 0);
    const r = await api.posaljiOdgovor(kvizId, 0, { vrsta: 'tekst', tekst: 'osijek' }, false);
    expect(KOMENTARI.brzo).toContain(r.komentar);
  });
});

describe('varanje', () => {
  it('izlazak iz igre daje komentar iz skupine varanje, i kad je pitanje imalo vlastiti komentar', async () => {
    const { KOMENTARI } = await import('../podaci/komentari');
    const api = new LokalniApi(sa('znacenje'));
    const { kvizId } = await api.pocniKviz();
    const p = await api.dohvatiPitanje(kvizId, 0);
    const r = await api.posaljiOdgovor(kvizId, 0, { vrsta: 'indeks', indeks: p.ponudeno!.indexOf('dvorište') }, true);
    expect(KOMENTARI.varanje).toContain(r.komentar);
    expect(r.tocno).toBe(true);
  });
});

describe('istek vremena bez odgovora', () => {
  it('prazan odgovor kad sat dođe do nule računa se kao isteklo vrijeme, ne kao netočno', async () => {
    const { KOMENTARI } = await import('../podaci/komentari');
    const api = new LokalniApi(sa('odabir'));
    const { kvizId } = await api.pocniKviz();
    await api.dohvatiPitanje(kvizId, 0);
    const r = await api.posaljiOdgovor(kvizId, 0, { vrsta: 'nista' }, false);
    expect(r.istekloVrijeme).toBe(true);
    expect(r.bodovi).toBe(0);
    expect(KOMENTARI.isteklo).toContain(r.komentar);
  });
});
