// LAŽNI SERVER ZA RAZVOJ (faza 1).
// Radi u pregledniku pa točni odgovori ovdje JESU u pregledniku. U fazi 2 ovu logiku
// preuzimaju Supabase RPC funkcije, a ovaj modul ostaje samo za lokalno testiranje.

import type { Api, Igrac, RangLista, StanjeDnevnog } from './tip';
import type { JavnoPitanje, KategorijaId, Odgovor, PitanjeBaza, Rezultat } from '../tipovi';
import { POSTAVKE } from '../postavke';
import { jePrihvatljiv } from '../provjera';
import { izracunajBodove } from '../bodovanje';
import { odrediIshod, odaberiKomentar } from '../podaci/komentari';

/** Tolerancija za kašnjenje mreže. */
const MILOST_MS = 1500;

interface StanjePitanja {
  pocetak: number;
  vrijemeMs: number;
  /** pomijesano[i] = izvorni indeks stavke prikazane na mjestu i */
  pomijesano: number[];
  odgovoreno: boolean;
  otkrivenoTragova: number;
  otvorenaPolja: Set<string>;
  rijeseneKolone: Set<number>;
}

interface Kviz {
  pitanja: PitanjeBaza[];
  stanja: Map<number, StanjePitanja>;
  niz: number;
  ukupnoBodova: number;
}

export function vrijemeZa(p: PitanjeBaza): number {
  const v = POSTAVKE.vrijemeSek;
  switch (p.tip) {
    case 'anagram': return v.anagram * 1000;
    case 'asocijacije': return v.asocijacije * 1000;
    case 'poredaj': return v.poredaj * 1000;
    case 'tragovi': return v.tragovi * 1000;
    case 'tocno_netocno': return v.tocnoNetocnoPoTvrdnji * (p.tvrdnje?.length ?? 1) * 1000;
    default: return (p.nacin === 'upis' ? v.upis : v.odabir) * 1000;
  }
}

function promijesaj(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  // izbjegni slučaj da ostane u točnom poretku
  if (n > 1 && a.every((x, i) => x === i)) [a[0], a[1]] = [a[1], a[0]];
  return a;
}

function anagram(rijec: string): string {
  const slova = rijec.toUpperCase().replace(/\s+/g, '').split('');
  return promijesaj(slova.length).map((i) => slova[i]).join('');
}

export class LokalniApi implements Api {
  private kvizovi = new Map<string, Kviz>();

  constructor(
    private izvor: PitanjeBaza[],
    private sat: () => number = () => Date.now(),
  ) {}

  // Igrači, kviz dana i trening samo u memoriji, za razvoj bez interneta (?lokalno).
  private igraci = new Map<string, { nadimak: string; pin?: string }>();
  private dnevni = new Map<string, string>();

  async noviIgrac(nadimak: string): Promise<Igrac> {
    const n = nadimak.trim();
    if (n.length < 3 || n.length > 20) throw new Error('Nadimak mora imati 3 do 20 znakova.');
    if ([...this.igraci.values()].some((i) => i.nadimak.toLowerCase() === n.toLowerCase())) throw new Error('Taj je nadimak zauzet.');
    const igracId = Math.random().toString(36).slice(2);
    this.igraci.set(igracId, { nadimak: n });
    return { igracId, nadimak: n };
  }
  async igracInfo(igracId: string) {
    const i = this.igraci.get(igracId);
    if (!i) throw new Error('Nepoznat igrač.');
    return { nadimak: i.nadimak, imaPin: !!i.pin };
  }
  async postaviPin(igracId: string, pin: string) {
    if (!/^[0-9]{4}$/.test(pin)) throw new Error('PIN mora imati točno 4 znamenke.');
    const i = this.igraci.get(igracId);
    if (!i) throw new Error('Nepoznat igrač.');
    i.pin = pin;
    return true;
  }
  async prijavaPinom(nadimak: string, pin: string) {
    for (const [igracId, i] of this.igraci) {
      if (i.nadimak.toLowerCase() === nadimak.trim().toLowerCase() && i.pin === pin) return { igracId, nadimak: i.nadimak };
    }
    return { greska: 'Pogrešan nadimak ili PIN.' };
  }
  async pocniDnevni(igracId: string): Promise<StanjeDnevnog> {
    if (!this.igraci.has(igracId)) throw new Error('Nepoznat igrač.');
    const dan = new Date().toISOString().slice(0, 10);
    let kvizId = this.dnevni.get(igracId);
    if (!kvizId) { kvizId = (await this.pocniKviz()).kvizId; this.dnevni.set(igracId, kvizId); }
    const k = this.kviz(kvizId);
    const sljedeci = [...k.stanja.values()].filter((s) => s.odgovoreno).length;
    if (sljedeci >= k.pitanja.length) return { dan, zavrsen: true, ukupnoBodova: k.ukupnoBodova };
    return { dan, kvizId, brojPitanja: k.pitanja.length, sljedeci, ukupnoBodova: k.ukupnoBodova };
  }
  async pocniTrening(igracId: string, kategorija: KategorijaId) {
    if (!this.igraci.has(igracId)) throw new Error('Nepoznat igrač.');
    const pitanja = this.izvor.filter((p) => p.kategorija === kategorija);
    if (pitanja.length === 0) throw new Error('Nema pitanja u toj kategoriji.');
    const kvizId = Math.random().toString(36).slice(2, 10);
    this.kvizovi.set(kvizId, { pitanja, stanja: new Map(), niz: 0, ukupnoBodova: 0 });
    return { kvizId, brojPitanja: pitanja.length };
  }

  /** Lokalni način nema liga. */
  async mojeLige() { return []; }
  async nazivLige() { return null; }
  private bezLiga(): never { throw new Error('Lige rade samo sa serverom (bez ?lokalno).'); }
  async napraviLigu(): Promise<{ kod: string; naziv: string }> { return this.bezLiga(); }
  async pridruziLigi(): Promise<{ kod: string; naziv: string }> { return this.bezLiga(); }
  async liga(): Promise<never> { return this.bezLiga(); }
  async ligaOdgovori(): Promise<never> { return this.bezLiga(); }
  async rezultatKviza() { return null; }
  async pocniNacin(): Promise<never> { throw new Error('Načini igre rade samo sa serverom (bez ?lokalno).'); }
  async preimenujLigu(): Promise<string> { return this.bezLiga(); }
  async ukloniClana(): Promise<boolean> { return this.bezLiga(); }

  /** Lokalni način nema rang-liste: vraća praznu listu. */
  async rangLista(): Promise<RangLista> {
    return { od: null, do: new Date().toISOString().slice(0, 10), ukupnoIgraca: 0, redovi: [], moj: null };
  }

  async pocniKviz() {
    const kvizId = Math.random().toString(36).slice(2, 10);
    this.kvizovi.set(kvizId, { pitanja: [...this.izvor], stanja: new Map(), niz: 0, ukupnoBodova: 0 });
    return { kvizId, brojPitanja: this.izvor.length };
  }

  private kviz(kvizId: string): Kviz {
    const k = this.kvizovi.get(kvizId);
    if (!k) throw new Error('Nepoznat kviz.');
    return k;
  }

  private stanje(k: Kviz, redni: number): StanjePitanja {
    const s = k.stanja.get(redni);
    if (!s) throw new Error('Pitanje nije dohvaćeno.');
    return s;
  }

  async dohvatiPitanje(kvizId: string, redni: number): Promise<JavnoPitanje> {
    const k = this.kviz(kvizId);
    const p = k.pitanja[redni];
    if (!p) throw new Error('Nema tog pitanja.');
    if (redni > 0 && !k.stanja.get(redni - 1)?.odgovoreno) throw new Error('Prvo odgovori na prethodno pitanje.');

    // Ponovni dohvat NE pokreće vrijeme ispočetka.
    let s = k.stanja.get(redni);
    if (!s) {
      const brojStavki = p.ponudeno?.length ?? p.poredaj?.stavke.length ?? 0;
      s = {
        pocetak: this.sat(),
        vrijemeMs: vrijemeZa(p),
        pomijesano: promijesaj(brojStavki),
        odgovoreno: false,
        otkrivenoTragova: 1,
        otvorenaPolja: new Set(),
        rijeseneKolone: new Set(),
      };
      k.stanja.set(redni, s);
    }

    const javno: JavnoPitanje = {
      redni,
      ukupno: k.pitanja.length,
      kategorija: p.kategorija,
      tip: p.tip,
      tezina: p.tezina,
      tekst: p.tekst,
      nacin: p.nacin ?? 'upis',
      vrijemeMs: Math.max(s.vrijemeMs - (this.sat() - s.pocetak), 0),
    };
    if (p.ponudeno) javno.ponudeno = s.pomijesano.map((i) => p.ponudeno![i]);
    if (p.slika) javno.slika = p.slika;
    if (p.tip === 'anagram') javno.slova = anagram(p.prihvatljivi![0]);
    if (p.poredaj) {
      javno.stavke = s.pomijesano.map((i) => p.poredaj!.stavke[i]);
      javno.uputa = p.poredaj.uputa;
    }
    if (p.tragovi) {
      javno.brojTragova = p.tragovi.length;
      javno.prviTrag = p.tragovi[0];
    }
    if (p.tvrdnje) javno.tvrdnje = p.tvrdnje.map((t) => t.tekst);
    if (p.asocijacije) javno.brojKolona = p.asocijacije.kolone.length;
    return javno;
  }

  async otkrijTrag(kvizId: string, redni: number): Promise<string> {
    const k = this.kviz(kvizId);
    const s = this.stanje(k, redni);
    const tragovi = k.pitanja[redni].tragovi ?? [];
    if (s.odgovoreno || s.otkrivenoTragova >= tragovi.length) throw new Error('Nema više tragova.');
    return tragovi[s.otkrivenoTragova++];
  }

  async otvoriPolje(kvizId: string, redni: number, kolona: number, polje: number): Promise<string> {
    const k = this.kviz(kvizId);
    const s = this.stanje(k, redni);
    const a = k.pitanja[redni].asocijacije;
    const tekst = a?.kolone[kolona]?.polja[polje];
    if (!a || tekst === undefined || s.odgovoreno) throw new Error('Polje se ne može otvoriti.');
    s.otvorenaPolja.add(`${kolona}-${polje}`);
    return tekst;
  }

  async rijesiKolonu(kvizId: string, redni: number, kolona: number, upis: string) {
    const k = this.kviz(kvizId);
    const s = this.stanje(k, redni);
    const kol = k.pitanja[redni].asocijacije?.kolone[kolona];
    if (!kol || s.odgovoreno) throw new Error('Kolona se ne može rješavati.');
    if (!jePrihvatljiv(upis, kol.prihvatljivi)) return { tocno: false };
    s.rijeseneKolone.add(kolona);
    return { tocno: true, rjesenje: kol.prihvatljivi[0], polja: [...kol.polja] };
  }

  async posaljiOdgovor(kvizId: string, redni: number, odgovor: Odgovor, napustio: boolean): Promise<Rezultat> {
    const k = this.kviz(kvizId);
    const s = this.stanje(k, redni);
    const p = k.pitanja[redni];
    if (s.odgovoreno) throw new Error('Na ovo pitanje je već odgovoreno.');
    s.odgovoreno = true;

    const proteklo = this.sat() - s.pocetak;
    // 'nista' šalje preglednik kad mu odbrojavač dođe do nule bez odgovora.
    const istekloVrijeme = proteklo > s.vrijemeMs + MILOST_MS || odgovor.vrsta === 'nista';
    const preostaloMs = s.vrijemeMs - proteklo;

    let udio = 0;
    let tocno = false;
    let fiksniBodovi: number | null = null;
    const dodatno: Partial<Rezultat> = {};

    if (!istekloVrijeme) {
      if (odgovor.vrsta === 'indeks' && p.tocanIndeks !== undefined) {
        tocno = s.pomijesano[odgovor.indeks] === p.tocanIndeks;
        udio = tocno ? 1 : 0;
      } else if (odgovor.vrsta === 'tekst' && p.tip === 'asocijacije' && p.asocijacije) {
        tocno = jePrihvatljiv(odgovor.tekst, p.asocijacije.konacno);
        const ukupnoPolja = p.asocijacije.kolone.length * 4;
        if (tocno) udio = 0.25 + 0.75 * (ukupnoPolja - s.otvorenaPolja.size) / ukupnoPolja;
        else fiksniBodovi = s.rijeseneKolone.size * POSTAVKE.bodovi.asocijacijeKolona;
      } else if (odgovor.vrsta === 'tekst' && p.prihvatljivi) {
        tocno = jePrihvatljiv(odgovor.tekst, p.prihvatljivi);
        if (tocno) {
          udio = p.tip === 'tragovi' && p.tragovi
            ? (p.tragovi.length - s.otkrivenoTragova + 1) / p.tragovi.length
            : 1;
        }
      } else if (odgovor.vrsta === 'redoslijed' && p.poredaj) {
        const izvorni = odgovor.redoslijed.map((i) => s.pomijesano[i]);
        tocno = izvorni.length === p.poredaj.stavke.length && izvorni.every((x, i) => x === i);
        udio = tocno ? 1 : 0;
      } else if (odgovor.vrsta === 'tvrdnje' && p.tvrdnje) {
        const pogodjeno = p.tvrdnje.filter((t, i) => odgovor.odgovori[i] === t.tocno).length;
        tocno = pogodjeno === p.tvrdnje.length;
        udio = pogodjeno / p.tvrdnje.length;
      }
    } else if (p.tip === 'asocijacije') {
      fiksniBodovi = s.rijeseneKolone.size * POSTAVKE.bodovi.asocijacijeKolona;
    }

    k.niz = tocno ? k.niz + 1 : 0;
    const bodovi = fiksniBodovi ?? izracunajBodove({ udio, preostaloMs, ukupnoMs: s.vrijemeMs, niz: k.niz, napustio });
    k.ukupnoBodova += bodovi;

    if (p.tocanIndeks !== undefined) dodatno.tocanIndeks = s.pomijesano.indexOf(p.tocanIndeks);
    if (p.tvrdnje) dodatno.tvrdnjeTocno = p.tvrdnje.map((t) => t.tocno);
    if (p.poredaj) dodatno.tocanRedoslijed = [...p.poredaj.stavke];
    if (p.asocijacije) {
      dodatno.koloneRjesenja = p.asocijacije.kolone.map((kol) => ({ polja: [...kol.polja], rjesenje: kol.prihvatljivi[0] }));
    }

    const ishod = odrediIshod({
      tocno, bodovi, isteklo: istekloVrijeme, niz: k.niz, napustio,
      udioVremena: Math.max(preostaloMs, 0) / s.vrijemeMs,
    });
    const vlastiti = napustio ? undefined : tocno ? p.komentarTocno : (ishod === 'netocno' ? p.komentarNetocno : undefined);
    const komentar = vlastiti ?? odaberiKomentar(ishod, Math.random, k.niz);

    return {
      tocno, udio, bodovi, ukupnoBodova: k.ukupnoBodova, niz: k.niz,
      istekloVrijeme, napustio,
      prikazTocno: p.prikazTocno, objasnjenje: p.objasnjenje, komentar,
      ...dodatno,
    };
  }
}
