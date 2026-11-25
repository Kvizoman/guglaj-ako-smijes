// Pokazuje koliko pitanja po kategoriji još nije bilo u kvizu dana.
// Pokretanje: npm run stanje-pitanja
// Treba isti tajni token kao uvoz (.env.local, UVOZ_TOKEN=...).
import { readFileSync, existsSync } from 'node:fs';

const KONFIG = readFileSync('src/api/konfig.ts', 'utf8');
const URL_BAZE = KONFIG.match(/SUPABASE_URL = '([^']+)'/)[1];
const KLJUC = KONFIG.match(/SUPABASE_KLJUC = '([^']+)'/)[1];
const TOKEN = existsSync('.env.local')
  ? (readFileSync('.env.local', 'utf8').match(/^UVOZ_TOKEN=(.+)$/m) ?? [])[1]?.trim()
  : undefined;
if (!TOKEN) {
  console.error('Nema tokena: treba datoteka .env.local s retkom UVOZ_TOKEN=...');
  process.exit(1);
}

const NAZIVI = {
  povijest: 'Povijest', zemljopis: 'Zemljopis', biologija: 'Biologija i prehrana', umjetnost: 'Umjetnost',
  knjizevnost: 'Književnost', glazba: 'Glazba', sport: 'Sport', video_igre: 'Video-igre', znacenje_rijeci: 'Značenje riječi',
};
const PO_DANU = 2; // pitanja po kategoriji u kvizu dana

const odgovor = await fetch(`${URL_BAZE}/rest/v1/rpc/stanje_pitanja`, {
  method: 'POST',
  headers: { apikey: KLJUC, 'Content-Type': 'application/json' },
  body: JSON.stringify({ p_token: TOKEN }),
});
const s = await odgovor.json();
if (!odgovor.ok) {
  console.error('Greška:', s?.message ?? odgovor.status);
  process.exit(1);
}

const [g, m, d] = s.danas.split('-');
console.log(`\nStanje pitanja na dan ${Number(d)}.${Number(m)}.${g}. (kvizova dana dosad: ${s.odigranihDana})\n`);
console.log('Kategorija'.padEnd(22) + 'Ukupno'.padStart(8) + 'Bilo'.padStart(8) + 'Još nije'.padStart(10) + '   Dovoljno za');
let najmanje = Infinity;
for (const k of s.kategorije) {
  const dana = Math.floor(k.nije / PO_DANU);
  najmanje = Math.min(najmanje, dana);
  console.log((NAZIVI[k.kategorija] ?? k.kategorija).padEnd(22) + String(k.aktivnih).padStart(8) + String(k.bilo).padStart(8)
    + String(k.nije).padStart(10) + `   ${dana} ${dana % 10 === 1 && dana % 100 !== 11 ? 'dan' : 'dana'}`);
}
console.log(najmanje <= 0
  ? '\nU barem jednoj kategoriji sva pitanja su već bila u kvizu dana: ponavljanja su počela. Vrijeme je za nova pitanja.'
  : `\nPrva ponavljanja za ${najmanje} ${najmanje % 10 === 1 && najmanje % 100 !== 11 ? 'dan' : 'dana'} (kategorija s najmanje neodigranih pitanja).`
    + (najmanje <= 7 ? ' Vrijeme je za nova pitanja.' : ''));
