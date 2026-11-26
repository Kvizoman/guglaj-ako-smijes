// Svjedodžba o intelektualnom stanju (ideja 8, PDF "Guglaj ako smiješ: kreativne ideje").
// Slika 1080 × 1350 nacrtana u pregledniku, za dijeljenje ili preuzimanje. Ništa se ne šalje na server.

export interface PodaciSvjedodzbe {
  nadimak: string | null;
  /** npr. "u kvizu dana 26.11.2026." */
  prilika: string;
  titula: string;
  postotak: number;
  najduljiNiz: number;
  bodovi: number;
  adresa: string;
}

/** Stanje prema postotku. Razred 56 do 85 % je primjer iz PDF-a; ostale je dopisao Claude. */
export function stanja(postotak: number): { neuroni: string; ego: string; komisija: string } {
  if (postotak >= 86) return { neuroni: 'opasno dobro', ego: 'u stratosferi', komisija: 'Komisija je podnijela ostavku i otišla čitati enciklopediju.' };
  if (postotak >= 56) return { neuroni: 'zavidno', ego: 'blago povišeno', komisija: 'Komisija nema primjedbi, ali ima kompleks manje vrijednosti.' };
  if (postotak >= 26) return { neuroni: 'u probnom radu', ego: 'stabilno', komisija: 'Komisija vidi potencijal. Pod mikroskopom, ali vidi.' };
  return { neuroni: 'na godišnjem odmoru', ego: 'pod posebnom zaštitom', komisija: 'Komisija preporučuje kavu i drugi pokušaj.' };
}

const PAPIR = '#E6EEDF';
const PAPIR_TAMNIJI = '#CFDCC6';
const TINTA = '#1E1A52';
const TINTA_BLIJEDA = '#5B5888';
const PECAT = '#C2303B';
const SEMAFOR = "Impact, 'Haettenschweiler', 'Arial Narrow Bold', 'Oswald', sans-serif";
const DOKUMENT = "Georgia, 'Times New Roman', serif";

function centriraj(c: CanvasRenderingContext2D, tekst: string, y: number, font: string, boja: string, najsira = 900) {
  c.font = font;
  let velicina = Number(/(\d+)px/.exec(font)![1]);
  while (c.measureText(tekst).width > najsira && velicina > 20) {
    velicina -= 2;
    c.font = font.replace(/\d+px/, `${velicina}px`);
  }
  c.fillStyle = boja;
  c.textAlign = 'center';
  c.fillText(tekst, 540, y);
}

/** Valoviti zaštitni rub, kao na pravim svjedodžbama. */
function rub(c: CanvasRenderingContext2D) {
  c.strokeStyle = PAPIR_TAMNIJI;
  c.lineWidth = 2;
  for (let s = 0; s < 3; s++) {
    const m = 34 + s * 10;
    c.beginPath();
    for (let x = m; x <= 1080 - m; x += 4) {
      const y = m + Math.sin(x / 14 + s) * 5;
      if (x === m) c.moveTo(x, y); else c.lineTo(x, y);
    }
    for (let y = m; y <= 1350 - m; y += 4) c.lineTo(1080 - m + Math.sin(y / 14 + s) * 5, y);
    for (let x = 1080 - m; x >= m; x -= 4) c.lineTo(x, 1350 - m + Math.sin(x / 14 + s) * 5);
    for (let y = 1350 - m; y >= m; y -= 4) c.lineTo(m + Math.sin(y / 14 + s) * 5, y);
    c.stroke();
  }
  c.strokeStyle = TINTA;
  c.lineWidth = 3;
  c.strokeRect(80, 80, 920, 1190);
}

function pecat(c: CanvasRenderingContext2D, x: number, y: number) {
  c.save();
  c.translate(x, y);
  c.rotate(-0.22);
  c.globalAlpha = 0.85;
  c.strokeStyle = PECAT;
  c.fillStyle = PECAT;
  c.lineWidth = 6;
  c.beginPath(); c.arc(0, 0, 112, 0, Math.PI * 2); c.stroke();
  c.lineWidth = 2;
  c.beginPath(); c.arc(0, 0, 92, 0, Math.PI * 2); c.stroke();
  // tekst u krug
  const tekst = '• GUGLAJ AKO SMIJEŠ • POVRIJEĐENI KVIZ ';
  c.font = `bold 17px ${DOKUMENT}`;
  c.textAlign = 'center';
  const korak = (Math.PI * 2) / tekst.length;
  for (let i = 0; i < tekst.length; i++) {
    c.save();
    c.rotate(i * korak);
    c.fillText(tekst[i], 0, -97);
    c.restore();
  }
  c.font = `42px ${SEMAFOR}`;
  c.fillText('OVJERENO', 0, 15);
  c.restore();
}

export function nacrtajSvjedodzbu(p: PodaciSvjedodzbe): HTMLCanvasElement {
  const platno = document.createElement('canvas');
  platno.width = 1080;
  platno.height = 1350;
  const c = platno.getContext('2d')!;
  c.fillStyle = PAPIR;
  c.fillRect(0, 0, 1080, 1350);
  rub(c);

  const s = stanja(p.postotak);
  centriraj(c, 'GUGLAJ AKO SMIJEŠ • SLUŽBENI DOKUMENT', 150, `600 24px ${DOKUMENT}`, TINTA_BLIJEDA);
  centriraj(c, 'SVJEDODŽBA', 265, `120px ${SEMAFOR}`, TINTA);
  centriraj(c, 'o intelektualnom stanju', 320, `italic 38px ${DOKUMENT}`, TINTA);

  c.strokeStyle = TINTA; c.lineWidth = 2;
  c.beginPath(); c.moveTo(340, 360); c.lineTo(740, 360); c.stroke();

  centriraj(c, 'Ovime se potvrđuje da', 425, `30px ${DOKUMENT}`, TINTA_BLIJEDA);
  centriraj(c, p.nadimak ?? 'osoba nepoznatog nadimka', 495, `bold 52px ${DOKUMENT}`, TINTA, 820);
  centriraj(c, `${p.prilika} stječe titulu`, 555, `30px ${DOKUMENT}`, TINTA_BLIJEDA);
  centriraj(c, p.titula.toUpperCase(), 665, `96px ${SEMAFOR}`, TINTA, 860);

  centriraj(c, `${p.postotak} % uspješnost  |  ${p.najduljiNiz} najdulji niz  |  ${p.bodovi} bodova`, 750, `bold 32px ${DOKUMENT}`, TINTA, 860);

  c.textAlign = 'left';
  c.font = `34px ${DOKUMENT}`;
  c.fillStyle = TINTA_BLIJEDA;
  c.fillText('Stanje neurona:', 160, 850);
  c.fillText('Stanje ega:', 160, 905);
  c.fillStyle = TINTA;
  c.font = `bold 34px ${DOKUMENT}`;
  c.fillText(s.neuroni, 430, 850);
  c.fillText(s.ego, 430, 905);

  centriraj(c, s.komisija, 990, `italic 28px ${DOKUMENT}`, TINTA, 800);

  pecat(c, 800, 1110);
  c.textAlign = 'left';
  c.font = `italic 24px ${DOKUMENT}`;
  c.fillStyle = TINTA_BLIJEDA;
  c.fillText('Ovjereno digitalnim pečatom', 160, 1110);
  c.fillText('povrijeđenog kviza.', 160, 1142);

  centriraj(c, p.adresa.replace(/^https?:\/\//, '').replace(/\/$/, ''), 1235, `22px ${DOKUMENT}`, TINTA_BLIJEDA);
  return platno;
}

export function uPng(platno: HTMLCanvasElement): Promise<Blob> {
  return new Promise((ok, ne) => platno.toBlob((b) => (b ? ok(b) : ne(new Error('Slika se nije mogla napraviti.'))), 'image/png'));
}
