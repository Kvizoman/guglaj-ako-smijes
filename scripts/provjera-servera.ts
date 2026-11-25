// Provjera pravog servera (Supabase) izvana, kao što ga vidi preglednik.
// Pokretanje: npm run provjera-servera
import { SupabaseApi } from '../src/api/supabase';
import { SUPABASE_URL, SUPABASE_KLJUC } from '../src/api/konfig';
import { PROBNA_PITANJA } from '../src/podaci/probna-pitanja';
import { KOMENTARI } from '../src/podaci/komentari';
import type { TipPitanja } from '../src/tipovi';

const api = new SupabaseApi();
let prolaz = 0;
let pad = 0;
const ok = (uvjet: boolean, opis: string) => {
  if (uvjet) { prolaz++; console.log('  OK  ', opis); } else { pad++; console.log('  PAD ', opis); }
};
const baca = async (fn: () => Promise<unknown>) => {
  try { await fn(); return null; } catch (e) { return (e as Error).message; }
};
const izvor = (tip: TipPitanja) => PROBNA_PITANJA.find((p) => p.tip === tip)!;

// Odigra kviz do pitanja zadanog tipa (prethodna pitanja preskoči praznim odgovorom).
async function doPitanja(tip: TipPitanja) {
  const { kvizId, brojPitanja } = await api.pocniKviz();
  for (let r = 0; r < brojPitanja; r++) {
    const p = await api.dohvatiPitanje(kvizId, r);
    if (p.tip === tip) return { kvizId, r, p };
    await api.posaljiOdgovor(kvizId, r, { vrsta: 'nista' }, false);
  }
  throw new Error('nema tipa ' + tip);
}

async function main() {
  console.log('Sigurnost');
  const zabranjeno = ['tocanIndeks', 'prihvatljivi', 'objasnjenje', 'prikazTocno', 'konacno', 'izvor', 'komentarTocno', 'komentarNetocno'];
  {
    const { kvizId, brojPitanja } = await api.pocniKviz();
    ok(brojPitanja === 11, `kviz ima 11 pitanja (${brojPitanja})`);
    for (let r = 0; r < brojPitanja; r++) {
      const p = await api.dohvatiPitanje(kvizId, r);
      const json = JSON.stringify(p);
      const procurilo = zabranjeno.filter((k) => json.includes(`"${k}"`));
      const dodatno = (p.tip === 'asocijacije' && json.includes('Drava'))
        || (p.tip === 'tragovi' && json.includes('Pažitnov'))
        || (p.tip === 'tocno_netocno' && /"tocno"/.test(json));
      ok(procurilo.length === 0 && !dodatno, `pitanje ${r + 1} (${p.tip}) ne otkriva odgovor${procurilo.length ? ': ' + procurilo.join(',') : ''}`);
      await api.posaljiOdgovor(kvizId, r, { vrsta: 'nista' }, false);
    }
  }
  for (const putanja of ['/rest/v1/pitanja?select=*', '/rest/v1/odgovori?select=*', '/rest/v1/kvizovi?select=*']) {
    const r = await fetch(SUPABASE_URL + putanja, { headers: { apikey: SUPABASE_KLJUC } });
    ok(!r.ok, `izravno čitanje ${putanja} odbijeno (${r.status})`);
  }
  {
    const r = await fetch(SUPABASE_URL + '/rest/v1/pitanja?select=*', { headers: { apikey: SUPABASE_KLJUC, 'Accept-Profile': 'igra' } });
    ok(!r.ok, `čitanje sheme igra odbijeno (${r.status})`);
  }

  console.log('Pravila igre');
  {
    const { kvizId } = await api.pocniKviz();
    await api.dohvatiPitanje(kvizId, 0);
    ok(await baca(() => api.dohvatiPitanje(kvizId, 1)) === 'Prvo odgovori na prethodno pitanje.', 'ne može se preskočiti pitanje');
    await new Promise((r) => setTimeout(r, 1200));
    const opet = await api.dohvatiPitanje(kvizId, 0);
    ok(opet.vrijemeMs < 14000, `ponovni dohvat ne vraća sat na početak (${opet.vrijemeMs} ms)`);
    const i = opet.ponudeno!.indexOf('oj junačka zemljo mila');
    const r = await api.posaljiOdgovor(kvizId, 0, { vrsta: 'indeks', indeks: i }, false);
    ok(r.tocno && r.tocanIndeks === i && r.bodovi >= 100, `točan odabir priznat (${r.bodovi} bodova)`);
    ok(await baca(() => api.posaljiOdgovor(kvizId, 0, { vrsta: 'indeks', indeks: i }, false)) === 'Na ovo pitanje je već odgovoreno.', 'dvostruki odgovor odbijen');
  }
  {
    const { kvizId, r } = await doPitanja('djelo');
    const rez = await api.posaljiOdgovor(kvizId, r, { vrsta: 'tekst', tekst: 'leonardo da vinči' }, false);
    ok(rez.tocno, 'upis bez dijakritika i s tipfelerom priznat');
  }
  {
    const { kvizId, r } = await doPitanja('opis');
    const rez = await api.posaljiOdgovor(kvizId, r, { vrsta: 'tekst', tekst: 'Brazil' }, false);
    ok(!rez.tocno && rez.bodovi === 0 && rez.komentar === 'Bolna tema, znamo. Bila je Francuska.', 'krivi upis: 0 bodova i vlastiti komentar pitanja');
  }
  {
    const { kvizId, r } = await doPitanja('anagram');
    const rez = await api.posaljiOdgovor(kvizId, r, { vrsta: 'nista' }, false);
    ok(rez.istekloVrijeme && rez.bodovi === 0 && KOMENTARI.isteklo.includes(rez.komentar), 'isteklo vrijeme: 0 bodova, komentar iz skupine isteklo');
  }
  {
    const { kvizId, r, p } = await doPitanja('poredaj');
    const redoslijed = izvor('poredaj').poredaj!.stavke.map((s) => p.stavke!.indexOf(s));
    const rez = await api.posaljiOdgovor(kvizId, r, { vrsta: 'redoslijed', redoslijed }, false);
    ok(rez.tocno, 'poredaj: točan redoslijed priznat');
  }
  {
    const a = await doPitanja('tragovi');
    const rano = await api.posaljiOdgovor(a.kvizId, a.r, { vrsta: 'tekst', tekst: 'tetris' }, false);
    const b = await doPitanja('tragovi');
    const t2 = await api.otkrijTrag(b.kvizId, b.r);
    await api.otkrijTrag(b.kvizId, b.r);
    const kasno = await api.posaljiOdgovor(b.kvizId, b.r, { vrsta: 'tekst', tekst: 'tetris' }, false);
    ok(t2 === izvor('tragovi').tragovi![1], 'drugi trag stiže tek na zahtjev');
    ok(kasno.bodovi < rano.bodovi, `kasniji pogodak nosi manje (${kasno.bodovi} < ${rano.bodovi})`);
  }
  {
    const a = await doPitanja('asocijacije');
    ok(await api.otvoriPolje(a.kvizId, a.r, 0, 0) === 'Drava', 'polje A1 otvoreno na zahtjev');
    const malo = await api.posaljiOdgovor(a.kvizId, a.r, { vrsta: 'tekst', tekst: 'VODA' }, false);
    const b = await doPitanja('asocijacije');
    for (let k = 0; k < 4; k++) for (let pp = 0; pp < 4; pp++) await api.otvoriPolje(b.kvizId, b.r, k, pp);
    const sve = await api.posaljiOdgovor(b.kvizId, b.r, { vrsta: 'tekst', tekst: 'voda' }, false);
    ok(malo.tocno && sve.bodovi < malo.bodovi, `manje otvorenih polja = više bodova (${malo.bodovi} > ${sve.bodovi})`);
    const c = await doPitanja('asocijacije');
    const kol = await api.rijesiKolonu(c.kvizId, c.r, 1, 'led');
    const kriva = await api.rijesiKolonu(c.kvizId, c.r, 2, 'krivo');
    const krivo = await api.posaljiOdgovor(c.kvizId, c.r, { vrsta: 'tekst', tekst: 'vatra' }, false);
    ok(kol.tocno && !kriva.tocno && !krivo.tocno && krivo.bodovi === 15, `kolona bez konačnog rješenja: 15 bodova (${krivo.bodovi})`);
  }
  {
    const { kvizId, r } = await doPitanja('tocno_netocno');
    const rez = await api.posaljiOdgovor(kvizId, r, { vrsta: 'tvrdnje', odgovori: [true, false, true, true] }, false);
    ok(Number(rez.udio) === 0.75 && !rez.tocno && rez.niz === 0 && rez.bodovi > 0, `točno/netočno 3 od 4: djelomični bodovi (${rez.bodovi}), niz prekinut`);
  }
  {
    const { kvizId, r, p } = await doPitanja('znacenje');
    const rez = await api.posaljiOdgovor(kvizId, r, { vrsta: 'indeks', indeks: p.ponudeno!.indexOf('dvorište') }, true);
    ok(rez.tocno && rez.napustio && KOMENTARI.varanje.includes(rez.komentar), `varanje: "${rez.komentar}"`);
  }

  console.log(`\n${prolaz} prošlo, ${pad} palo`);
  process.exit(pad ? 1 : 0);
}

main();
