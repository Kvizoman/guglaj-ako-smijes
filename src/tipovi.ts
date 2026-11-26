// Shema pitanja. Ista shema vrijedi za JSON datoteke u pitanja/*.json (faza 3).

export type KategorijaId =
  | 'povijest' | 'zemljopis' | 'biologija' | 'umjetnost' | 'knjizevnost'
  | 'glazba' | 'sport' | 'video_igre' | 'znacenje_rijeci';

export type TipPitanja =
  | 'odabir'        // klasični a/b/c/d (manjina)
  | 'stih'          // nastavi stih
  | 'djelo'         // prepoznaj djelo (slika ili opis)
  | 'odlomak'       // odlomak, pogađa se autor ili djelo
  | 'opis'          // opis trenutka
  | 'anagram'
  | 'asocijacije'
  | 'poredaj'
  | 'tragovi'       // pogodi po tragovima
  | 'tocno_netocno' // točno/netočno na brzinu
  | 'znacenje';     // značenje riječi

/** Pitanje kako je spremljeno u bazi. Sadrži točne odgovore, NIKAD ne ide u preglednik. */
export interface PitanjeBaza {
  id: string;
  kategorija: KategorijaId;
  tip: TipPitanja;
  tezina: 1 | 2 | 3;
  tekst: string;
  /** Za tipove koji mogu biti i odabir i upis (odabir, stih, djelo, odlomak, opis, znacenje). */
  nacin?: 'odabir' | 'upis';
  /** Ponuđeni odgovori; točan je na indeksu `tocanIndeks` (server ih miješa). */
  ponudeno?: string[];
  tocanIndeks?: number;
  /** Prihvatljivi upisi (upis, anagram). */
  prihvatljivi?: string[];
  slika?: { src: string; opis: string };
  asocijacije?: {
    kolone: { polja: [string, string, string, string]; prihvatljivi: string[] }[];
    konacno: string[];
  };
  /** Stavke u TOČNOM redoslijedu (server ih miješa). */
  poredaj?: { stavke: string[]; uputa: string };
  tragovi?: string[];
  tvrdnje?: { tekst: string; tocno: boolean }[];
  /** Kako prikazati točan odgovor nakon odgovaranja. */
  prikazTocno: string;
  objasnjenje: string;
  izvor: string;
  /** Neobavezni komentari baš za ovo pitanje; imaju prednost pred općima. */
  komentarTocno?: string;
  komentarNetocno?: string;
}

/** Ono što preglednik smije vidjeti. */
export interface JavnoPitanje {
  redni: number;
  ukupno: number;
  kategorija: KategorijaId;
  tip: TipPitanja;
  tezina: 1 | 2 | 3;
  tekst: string;
  nacin: 'odabir' | 'upis';
  ponudeno?: string[];
  slika?: { src: string; opis: string };
  /** Anagram: ispremetana slova. */
  slova?: string;
  /** Poredaj: izmiješane stavke i uputa. */
  stavke?: string[];
  uputa?: string;
  /** Tragovi: koliko ih ima; prvi je već otkriven. */
  brojTragova?: number;
  prviTrag?: string;
  /** Točno/netočno: samo tekstovi tvrdnji. */
  tvrdnje?: string[];
  /** Asocijacije: broj kolona (polja se otkrivaju na zahtjev). */
  brojKolona?: number;
  vrijemeMs: number;
}

export type Odgovor =
  | { vrsta: 'indeks'; indeks: number }
  | { vrsta: 'tekst'; tekst: string }
  | { vrsta: 'redoslijed'; redoslijed: number[] } // indeksi u izmiješanim stavkama
  | { vrsta: 'tvrdnje'; odgovori: (boolean | null)[] }
  | { vrsta: 'nista' };                           // isteklo vrijeme

export interface Rezultat {
  tocno: boolean;
  udio: number;
  bodovi: number;
  ukupnoBodova: number;
  niz: number;
  istekloVrijeme: boolean;
  napustio: boolean;
  prikazTocno: string;
  objasnjenje: string;
  /** Šaljivi komentar ili pohvala. */
  komentar: string;
  /** Samo nakon zadnjeg pitanja: poruka prema postotku točnih. */
  zavrsno?: string;
  /** Samo nakon zadnjeg pitanja uz 100 % točnih: skrivena bonus poruka. */
  bonus?: string;
  tocanIndeks?: number;          // u izmiješanom poretku
  tvrdnjeTocno?: boolean[];
  tocanRedoslijed?: string[];
  koloneRjesenja?: { polja: string[]; rjesenje: string }[];
}
