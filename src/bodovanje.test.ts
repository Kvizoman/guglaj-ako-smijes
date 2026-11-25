import { describe, it, expect } from 'vitest';
import { izracunajBodove, mnoziteljNiza } from './bodovanje';

const osnovno = { udio: 1, preostaloMs: 0, ukupnoMs: 15000, niz: 1, napustio: false };

describe('izracunajBodove', () => {
  it('netočno je 0', () => {
    expect(izracunajBodove({ ...osnovno, udio: 0, preostaloMs: 15000 })).toBe(0);
  });
  it('točno u zadnji tren je osnova', () => {
    expect(izracunajBodove(osnovno)).toBe(100);
  });
  it('točno odmah je osnova + puni bonus', () => {
    expect(izracunajBodove({ ...osnovno, preostaloMs: 15000 })).toBe(150);
  });
  it('niz povećava bodove', () => {
    expect(izracunajBodove({ ...osnovno, niz: 3 })).toBe(120);
    expect(izracunajBodove({ ...osnovno, niz: 50 })).toBe(150); // strop +50 %
  });
  it('napuštanje kartice prepolovi bodove', () => {
    expect(izracunajBodove({ ...osnovno, napustio: true })).toBe(50);
  });
  it('djelomičan udio', () => {
    expect(izracunajBodove({ ...osnovno, udio: 0.5 })).toBe(50);
  });
  it('negativno preostalo vrijeme ne daje negativan bonus', () => {
    expect(izracunajBodove({ ...osnovno, preostaloMs: -500 })).toBe(100);
  });
});

describe('mnoziteljNiza', () => {
  it('prvi točan odgovor je 1', () => expect(mnoziteljNiza(1)).toBe(1));
  it('0 (prekinut niz) je 1', () => expect(mnoziteljNiza(0)).toBe(1));
});
