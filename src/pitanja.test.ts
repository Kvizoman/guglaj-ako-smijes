// Provjera svih datoteka u pitanja/*.json prije uvoza u bazu.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { PitanjeBaza } from './tipovi';
import { normaliziraj, jePrihvatljiv } from './provjera';

const MAPA = join(__dirname, '..', 'pitanja');
const KATEGORIJE = ['povijest', 'zemljopis', 'biologija', 'umjetnost', 'knjizevnost', 'glazba', 'sport', 'video_igre', 'znacenje_rijeci'];
const TIPOVI = ['odabir', 'stih', 'djelo', 'odlomak', 'opis', 'anagram', 'asocijacije', 'poredaj', 'tragovi', 'tocno_netocno', 'znacenje'];
// Mapa pitanja/ namjerno nije u javnom repozitoriju (sadrži odgovore), pa je na GitHubu nema: tada se ova provjera preskače.
const datoteke = existsSync(MAPA) ? readdirSync(MAPA).filter((f) => f.endsWith('.json')) : [];
if (datoteke.length === 0) describe.skip('pitanja/ nije prisutna (javni repozitorij)', () => { it('preskočeno', () => {}); });
const sva: PitanjeBaza[] = [];

for (const dat of datoteke) {
  const pitanja: PitanjeBaza[] = JSON.parse(readFileSync(join(MAPA, dat), 'utf-8'));
  sva.push(...pitanja);
  const kat = dat.replace('.json', '');

  describe(dat, () => {
    it('kategorija postoji i odgovara imenu datoteke', () => {
      expect(KATEGORIJE).toContain(kat);
      for (const p of pitanja) expect(p.kategorija, p.id).toBe(kat);
    });

    for (const p of pitanja) {
      it(`${p.id} je ispravno`, () => {
        expect(p.id).toMatch(new RegExp(`^${kat}-[0-9]{3}$`));
        expect(TIPOVI).toContain(p.tip);
        expect([1, 2, 3]).toContain(p.tezina);
        for (const polje of ['tekst', 'prikazTocno', 'objasnjenje', 'izvor'] as const) {
          expect(p[polje]?.trim(), `${p.id}.${polje}`).toBeTruthy();
        }
        // pravilo korisnice: bez em dasha
        expect(JSON.stringify(p), `${p.id} sadrži em dash`).not.toContain('—');

        if (p.ponudeno) {
          expect(p.ponudeno.length).toBeGreaterThanOrEqual(3);
          expect(new Set(p.ponudeno.map(normaliziraj)).size, `${p.id} ponuđeni se ponavljaju`).toBe(p.ponudeno.length);
          expect(p.tocanIndeks).toBeGreaterThanOrEqual(0);
          expect(p.tocanIndeks).toBeLessThan(p.ponudeno.length);
          expect(p.nacin).toBe('odabir');
        }
        if (p.nacin === 'upis' || ['anagram', 'tragovi'].includes(p.tip)) {
          expect(p.prihvatljivi?.length, `${p.id} nema prihvatljivih odgovora`).toBeGreaterThan(0);
          expect(new Set(p.prihvatljivi!.map(normaliziraj)).size, `${p.id} prihvatljivi se ponavljaju`).toBe(p.prihvatljivi!.length);
        }
        if (p.tip === 'anagram') expect(normaliziraj(p.prihvatljivi![0]).replace(/ /g, '').length).toBeGreaterThanOrEqual(4);
        if (p.tip === 'poredaj') {
          expect(p.poredaj!.stavke.length).toBeGreaterThanOrEqual(4);
          expect(p.poredaj!.stavke.length).toBeLessThanOrEqual(5);
          expect(new Set(p.poredaj!.stavke).size).toBe(p.poredaj!.stavke.length);
        }
        if (p.slika) {
          // slika mora postojati u public/ i imati opis koji ne otkriva odgovor
          expect(existsSync(join(__dirname, '..', 'public', p.slika.src)), `${p.id}: nema datoteke ${p.slika.src}`).toBe(true);
          expect(p.slika.opis.trim()).toBeTruthy();
          for (const o of p.prihvatljivi ?? []) {
            expect(normaliziraj(p.slika.opis).includes(normaliziraj(o)), `${p.id}: opis slike otkriva "${o}"`).toBe(false);
          }
        }
        if (p.tip === 'tragovi') expect(p.tragovi!.length).toBeGreaterThanOrEqual(3);
        if (p.tip === 'tocno_netocno') expect(p.tvrdnje!.length).toBeGreaterThanOrEqual(3);
        if (p.tip === 'asocijacije') {
          expect(p.asocijacije!.kolone.length).toBe(4);
          for (const k of p.asocijacije!.kolone) {
            expect(k.polja.length).toBe(4);
            expect(k.prihvatljivi.length).toBeGreaterThan(0);
            // polje ne smije sadržavati rješenje svoje kolone
            for (const polje of k.polja) {
              expect(normaliziraj(polje).includes(normaliziraj(k.prihvatljivi[0])), `${p.id}: "${polje}" otkriva "${k.prihvatljivi[0]}"`).toBe(false);
            }
          }
          expect(p.asocijacije!.konacno.length).toBeGreaterThan(0);
        }
      });
    }
  });
}

describe('sva pitanja zajedno', () => {
  it('id-jevi su jedinstveni', () => {
    const id = sva.map((p) => p.id);
    expect(new Set(id).size).toBe(id.length);
  });
  it('ni jedan krivi ponuđeni odgovor nije "prihvatljiv" kao točan (nema dvoznačnosti)', () => {
    for (const p of sva) {
      if (!p.ponudeno) continue;
      const tocan = p.ponudeno[p.tocanIndeks!];
      p.ponudeno.forEach((o, i) => {
        if (i !== p.tocanIndeks) expect(jePrihvatljiv(o, [tocan]), `${p.id}: "${o}" ≈ "${tocan}"`).toBe(false);
      });
    }
  });
});
