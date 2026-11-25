// Zvučni efekti generirani u pregledniku (Web Audio), bez zvučnih datoteka.

const KLJUC = 'bk-zvuk';
let ctx: AudioContext | null = null;
let ukljuceno = localStorage.getItem(KLJUC) !== 'ne';

export function jeUkljucen(): boolean {
  return ukljuceno;
}

export function prebaci(): boolean {
  ukljuceno = !ukljuceno;
  localStorage.setItem(KLJUC, ukljuceno ? 'da' : 'ne');
  return ukljuceno;
}

/** Mobilni preglednici (osobito Safari) puštaju zvuk tek nakon dodira: otključaj na prvi dodir ili tipku. */
function otkljucaj() {
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
}
for (const d of ['pointerdown', 'keydown', 'touchend']) {
  window.addEventListener(d, otkljucaj, { passive: true });
}

function ton(frekv: number, trajanje: number, vrsta: OscillatorType = 'square', glasnoca = 0.08, odgoda = 0) {
  if (!ukljuceno) return;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  const t = ctx.currentTime + odgoda;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = vrsta;
  osc.frequency.setValueAtTime(frekv, t);
  g.gain.setValueAtTime(glasnoca, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + trajanje);
  osc.connect(g).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + trajanje);
}

export const zvuk = {
  /** Sat: tihi tik-tak dok vrijeme teče, glasni oštri otkucaji u zadnjih 5 sekundi. */
  otkucaj: (sekunde: number) => {
    if (sekunde <= 5) ton(880, 0.08, 'square', 0.06);
    else ton(sekunde % 2 ? 1500 : 1150, 0.03, 'triangle', 0.05);
  },
  tocno: () => { ton(523, 0.12, 'triangle', 0.12); ton(784, 0.25, 'triangle', 0.12, 0.1); },
  netocno: () => { ton(140, 0.45, 'sawtooth', 0.09); ton(110, 0.45, 'sawtooth', 0.09, 0.05); },
  klik: () => ton(320, 0.04, 'square', 0.04),
  kraj: () => [392, 523, 659, 784].forEach((f, i) => ton(f, 0.3, 'triangle', 0.1, i * 0.12)),
};
