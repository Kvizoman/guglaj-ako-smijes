// Uvozi pitanja iz pitanja/*.json u bazu (Supabase).
// Pokretanje: npm run uvoz-pitanja            (sve kategorije)
//             npm run uvoz-pitanja -- sport    (samo jedna kategorija)
// Prije uvoza npm automatski pokreće provjeru svih pitanja (vitest), pa neispravno pitanje ne stigne u bazu.
// Potreban je tajni token u datoteci .env.local (UVOZ_TOKEN=...), koja se ne stavlja na GitHub.
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const KONFIG = readFileSync('src/api/konfig.ts', 'utf8');
const URL_BAZE = KONFIG.match(/SUPABASE_URL = '([^']+)'/)[1];
const KLJUC = KONFIG.match(/SUPABASE_KLJUC = '([^']+)'/)[1];

if (!existsSync('.env.local')) {
  console.error('Nema datoteke .env.local s uvoznim tokenom (UVOZ_TOKEN=...). Uvoz nije moguć.');
  process.exit(1);
}
const TOKEN = (readFileSync('.env.local', 'utf8').match(/^UVOZ_TOKEN=(.+)$/m) ?? [])[1]?.trim();
if (!TOKEN) {
  console.error('U datoteci .env.local nema retka UVOZ_TOKEN=...');
  process.exit(1);
}

const trazene = process.argv.slice(2);
const datoteke = readdirSync('pitanja').filter((f) => f.endsWith('.json'))
  .filter((f) => trazene.length === 0 || trazene.includes(f.replace('.json', '')));
if (datoteke.length === 0) {
  console.error('Nema datoteka za uvoz.', trazene.length ? `Tražene kategorije: ${trazene.join(', ')}` : '');
  process.exit(1);
}

let greske = 0;
for (const f of datoteke) {
  const kategorija = f.replace('.json', '');
  const pitanja = JSON.parse(readFileSync(`pitanja/${f}`, 'utf8'));
  const odgovor = await fetch(`${URL_BAZE}/rest/v1/rpc/uvezi_pitanja`, {
    method: 'POST',
    headers: { apikey: KLJUC, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_token: TOKEN, p_kategorija: kategorija, p_pitanja: pitanja }),
  });
  const tijelo = await odgovor.json().catch(() => null);
  if (!odgovor.ok) {
    greske++;
    console.error(`  PAD  ${kategorija}: ${tijelo?.message ?? odgovor.status}`);
  } else {
    console.log(`  OK   ${kategorija}: ${tijelo.novih} novih, ${tijelo.azurirano} ažurirano, ${tijelo.ugaseno} ugašeno, aktivnih u bazi ${tijelo.aktivnih}`);
  }
}
process.exit(greske ? 1 : 0);
