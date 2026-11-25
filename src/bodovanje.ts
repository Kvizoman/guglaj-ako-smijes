import { POSTAVKE } from './postavke';

export interface UlazBodovanja {
  /** 0 = netočno, 1 = potpuno točno, između = djelomično (tragovi, asocijacije, točno/netočno). */
  udio: number;
  preostaloMs: number;
  ukupnoMs: number;
  /** Broj uzastopnih točnih odgovora, uključujući ovaj. */
  niz: number;
  napustio: boolean;
}

export function mnoziteljNiza(niz: number): number {
  const b = POSTAVKE.bodovi;
  const koraci = Math.min(Math.max(niz - 1, 0), b.nizNajvise);
  return 1 + koraci * b.nizKorak;
}

export function izracunajBodove(u: UlazBodovanja): number {
  if (u.udio <= 0) return 0;
  const b = POSTAVKE.bodovi;
  const brzina = Math.min(Math.max(u.preostaloMs / u.ukupnoMs, 0), 1);
  const osnovica = b.osnova + b.bonusBrzina * brzina;
  const kazna = u.napustio ? b.kaznaNapustio : 1;
  return Math.round(osnovica * u.udio * mnoziteljNiza(u.niz) * kazna);
}
