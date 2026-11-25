import { describe, it, expect } from 'vitest';
import { normaliziraj, udaljenost, jePrihvatljiv } from './provjera';

describe('normaliziraj', () => {
  it('uklanja dijakritike i velika slova', () => {
    expect(normaliziraj('Čakovec')).toBe('cakovec');
    expect(normaliziraj('ŽUPANIJA Šibenska')).toBe('zupanija sibenska');
    expect(normaliziraj('Ćiro')).toBe('ciro');
  });
  it('đ postaje dj', () => {
    expect(normaliziraj('Đakovo')).toBe('djakovo');
  });
  it('miče interpunkciju i višak razmaka', () => {
    expect(normaliziraj('  Leonardo   da Vinci! ')).toBe('leonardo da vinci');
    expect(normaliziraj('Smail-aga')).toBe('smail aga');
  });
});

describe('udaljenost', () => {
  it('računa Levenshteinovu udaljenost', () => {
    expect(udaljenost('osijek', 'osjek')).toBe(1);
    expect(udaljenost('abc', 'abc')).toBe(0);
    expect(udaljenost('', 'abc')).toBe(3);
  });
});

describe('jePrihvatljiv', () => {
  it('prihvaća bez dijakritika', () => {
    expect(jePrihvatljiv('djakovo', ['Đakovo'])).toBe(true);
    expect(jePrihvatljiv('cakovec', ['Čakovec'])).toBe(true);
  });
  it('prihvaća sitnu tipfelersku grešku', () => {
    expect(jePrihvatljiv('Osjek', ['Osijek'])).toBe(true);
    expect(jePrihvatljiv('Leonardo da Vinči', ['Leonardo da Vinci'])).toBe(true);
  });
  it('ne prihvaća grešku u brojevima', () => {
    expect(jePrihvatljiv('1990', ['1991'])).toBe(false);
    expect(jePrihvatljiv('1991.', ['1991'])).toBe(true);
  });
  it('ne prihvaća grešku u kratkim odgovorima', () => {
    expect(jePrihvatljiv('Rig', ['Rim'])).toBe(false);
    expect(jePrihvatljiv('rim', ['Rim'])).toBe(true);
  });
  it('odbija prazan upis', () => {
    expect(jePrihvatljiv('', ['Rim'])).toBe(false);
    expect(jePrihvatljiv('   ', ['Rim'])).toBe(false);
  });
  it('prihvaća bilo koji od više odgovora', () => {
    expect(jePrihvatljiv('da vinci', ['Leonardo da Vinci', 'Leonardo', 'Da Vinci'])).toBe(true);
  });
  it('ne prihvaća očito krive odgovore', () => {
    expect(jePrihvatljiv('Zagreb', ['Osijek'])).toBe(false);
  });
});
