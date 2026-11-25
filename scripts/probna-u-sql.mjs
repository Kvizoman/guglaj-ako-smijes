// Ispisuje SQL za unos probnih pitanja i komentara u bazu (faza 2).
// Pokretanje: node scripts/probna-u-sql.mjs > supabase/seed_probno.sql
import { PROBNA_PITANJA } from '../src/podaci/probna-pitanja.ts';
import { KOMENTARI } from '../src/podaci/komentari.ts';

const q = (s) => `$q$${s}$q$`;
const red = [];
red.push('-- Generirano iz src/podaci/probna-pitanja.ts i src/podaci/komentari.ts');
red.push("delete from igra.komentari;");
PROBNA_PITANJA.forEach((p, i) => {
  red.push(`insert into igra.pitanja (id, kategorija, tip, tezina, podaci, dodano) values (${q(p.id)}, ${q(p.kategorija)}, ${q(p.tip)}, ${p.tezina}, ${q(JSON.stringify(p))}::jsonb, now() + interval '${i} millisecond')
  on conflict (id) do update set kategorija = excluded.kategorija, tip = excluded.tip, tezina = excluded.tezina, podaci = excluded.podaci;`);
});
for (const [ishod, popis] of Object.entries(KOMENTARI)) {
  for (const t of popis) red.push(`insert into igra.komentari (ishod, tekst) values (${q(ishod)}, ${q(t)});`);
}
console.log(red.join('\n'));
