// Provjera upisanih odgovora.
// Ista pravila će u fazi 2 vrijediti i na serveru (SQL funkcija), ovo je referentna verzija.

const DIJAKRITICI: Record<string, string> = {
  č: 'c', ć: 'c', ž: 'z', š: 's', đ: 'dj',
};

/** Mala slova, bez dijakritika (đ → dj), bez interpunkcije, jedan razmak između riječi. */
export function normaliziraj(s: string): string {
  return s
    .toLowerCase()
    .replace(/[čćžšđ]/g, (z) => DIJAKRITICI[z])
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // ostali naglasci (é, ü...)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Levenshteinova udaljenost (broj umetanja, brisanja i zamjena slova). */
export function udaljenost(a: string, b: string): number {
  let prethodni = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const trenutni = [i];
    for (let j = 1; j <= b.length; j++) {
      const cijena = a[i - 1] === b[j - 1] ? 0 : 1;
      trenutni[j] = Math.min(prethodni[j] + 1, trenutni[j - 1] + 1, prethodni[j - 1] + cijena);
    }
    prethodni = trenutni;
  }
  return prethodni[b.length];
}

/** Koliko grešaka dopuštamo: brojevi i kratke riječi moraju biti točni. */
function dopustenaGreska(tocno: string): number {
  if (/[0-9]/.test(tocno)) return 0;
  if (tocno.length <= 4) return 0;
  if (tocno.length <= 8) return 1;
  return 2;
}

export function jePrihvatljiv(upis: string, prihvatljivi: string[]): boolean {
  const u = normaliziraj(upis);
  if (!u) return false;
  return prihvatljivi.some((p) => {
    const t = normaliziraj(p);
    return udaljenost(u, t) <= dopustenaGreska(t);
  });
}
