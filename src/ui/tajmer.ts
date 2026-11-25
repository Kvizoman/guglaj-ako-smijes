import { zvuk } from '../zvuk';

/**
 * Odbrojavač na zaslonu. Samo PRIKAZUJE vrijeme; mjerodavno vrijeme mjeri server.
 * Kad istekne, poziva naIstek (npr. šalje prazan odgovor).
 */
export function pokreniTajmer(
  broj: HTMLElement,
  fitilj: HTMLElement,
  ukupnoMs: number,
  naIstek: () => void,
  pocetnoMs = ukupnoMs,
): () => void {
  const kraj = performance.now() + pocetnoMs;
  let zadnjaSekunda = -1;
  let aktivan = true;
  let id = 0;
  broj.textContent = String(Math.ceil(pocetnoMs / 1000)); // odmah, ne tek nakon prvog okvira

  const korak = () => {
    if (!aktivan) return;
    const preostalo = Math.max(kraj - performance.now(), 0);
    const sekunde = Math.ceil(preostalo / 1000);
    if (sekunde !== zadnjaSekunda) {
      zadnjaSekunda = sekunde;
      broj.textContent = String(sekunde);
      const gori = sekunde <= 5;
      broj.classList.toggle('gori', gori);
      fitilj.classList.toggle('gori', gori);
      if (sekunde > 0) zvuk.otkucaj(sekunde);
    }
    fitilj.style.transform = `scaleX(${preostalo / ukupnoMs})`;
    if (preostalo <= 0) {
      aktivan = false;
      clearInterval(rezerva);
      naIstek();
      return;
    }
  };
  // Animacija ide uz iscrtavanje zaslona; sekunde i otkucaje dodatno provjerava interval,
  // jer preglednik usporava iscrtavanje kad prozor nije u prvom planu.
  const animacija = () => {
    korak();
    if (aktivan) id = requestAnimationFrame(animacija);
  };
  id = requestAnimationFrame(animacija);
  const rezerva = setInterval(korak, 200);

  return () => {
    aktivan = false;
    cancelAnimationFrame(id);
    clearInterval(rezerva);
  };
}
