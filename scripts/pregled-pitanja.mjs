// Stranica za pregled pitanja jedne kategorije: pregled/<kategorija>.html
// Pokretanje: node scripts/pregled-pitanja.mjs povijest
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const kat = process.argv[2];
if (!kat) { console.error('Upotreba: node scripts/pregled-pitanja.mjs <kategorija>'); process.exit(1); }
const pitanja = JSON.parse(readFileSync(`pitanja/${kat}.json`, 'utf8'));

const TIP = { odabir: 'Klasično pitanje', stih: 'Nastavi stih', djelo: 'Prepoznaj djelo', odlomak: 'Odlomak', opis: 'Opis trenutka', anagram: 'Anagram', asocijacije: 'Asocijacije', poredaj: 'Poredaj', tragovi: 'Pogodi po tragovima', tocno_netocno: 'Točno ili netočno', znacenje: 'Značenje riječi' };
const TEZINA = { 1: 'lako', 2: 'srednje', 3: 'teško' };
const e = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const naziv = kat.charAt(0).toUpperCase() + kat.slice(1);

function detalji(p) {
  if (p.ponudeno) return p.ponudeno.map((o, i) => (i === p.tocanIndeks ? `<b>${e(o)}</b>` : e(o))).join('<br>');
  if (p.poredaj) return `<ol>${p.poredaj.stavke.map((s) => `<li>${e(s)}</li>`).join('')}</ol>`;
  if (p.tragovi) return `<ol>${p.tragovi.map((s) => `<li>${e(s)}</li>`).join('')}</ol>`;
  if (p.asocijacije) return p.asocijacije.kolone.map((k, i) => `${'ABCD'[i]}: ${k.polja.map(e).join(', ')} → <b>${e(k.prihvatljivi[0])}</b>`).join('<br>');
  if (p.tvrdnje) return `<ol>${p.tvrdnje.map((t) => `<li>${e(t.tekst)} <b>(${t.tocno ? 'točno' : 'netočno'})</b></li>`).join('')}</ol>`;
  return '';
}
function izvor(s) {
  return e(s).replace(/https?:\/\/[^\s;()<]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${decodeURIComponent(u.replace(/^https?:\/\/(www\.)?/i, '')).slice(0, 60)}</a>`).replace(/ ; /g, '<br>');
}

const redovi = pitanja.map((p) => {
  const prihvaca = p.asocijacije ? p.asocijacije.konacno : p.prihvatljivi;
  const kom = [p.komentarTocno, p.komentarNetocno].filter(Boolean).map((k) => `<br><i>${e(k)}</i>`).join('');
  return `<tr><td>${p.id.slice(-3)}</td><td>${TIP[p.tip] ?? p.tip}<br><small>${TEZINA[p.tezina]}</small></td>`
    + `<td><span style="white-space:pre-line">${e(p.tekst)}</span>${p.slika ? `<div class=d><img src="../${p.slika.src}" alt="${e(p.slika.opis)}" style="max-width:220px;display:block"></div>` : ''}<div class=d>${detalji(p)}</div></td>`
    + `<td><b>${e(p.prikazTocno)}</b>${prihvaca ? `<br><small>prihvaća se: ${prihvaca.map(e).join(', ')}</small>` : ''}</td>`
    + `<td>${e(p.objasnjenje)}${kom}</td><td class=izv>${izvor(p.izvor)}</td></tr>`;
}).join('');

const html = `<!doctype html><html lang=hr><meta charset=utf-8><title>Pregled pitanja: ${naziv}</title>
<style>body{font:15px/1.4 system-ui,sans-serif;margin:2rem;color:#1d1a3a}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:.5rem;vertical-align:top;text-align:left}th{background:#14113A;color:#fff}tr:nth-child(even){background:#f5f4fb}small{color:#666}.d{margin-top:.4rem;color:#333}ol{margin:.2rem 0 0 1.2rem;padding:0}.izv{font-size:12px;max-width:16rem;word-break:break-word}</style>
<h1>Pregled pitanja: ${naziv} (${pitanja.length})</h1>
<p>Točan odgovor je podebljan. Kod „Poredaj” stavke su navedene u točnom redoslijedu (igra ih miješa). Kod „Tragova” tragovi idu od najtežeg prema najlakšem.</p>
<table><tr><th>#</th><th>Tip</th><th>Pitanje</th><th>Točan odgovor</th><th>Objašnjenje</th><th>Izvor</th></tr>${redovi}</table>
`;
mkdirSync('pregled', { recursive: true });
writeFileSync(`pregled/${kat}.html`, html, 'utf8');
console.log(`pregled/${kat}.html: ${pitanja.length} pitanja`);
