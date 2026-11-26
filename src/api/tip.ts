import type { JavnoPitanje, KategorijaId, Odgovor, Rezultat } from '../tipovi';

export interface Igrac { igracId: string; nadimak: string }
export type Razdoblje = 'dan' | 'tjedan' | 'ukupno';
export interface RedListe { mjesto: number; nadimak: string; bodovi: number; dana: number; ja: boolean }
export interface RangLista {
  /** prvi dan razdoblja (YYYY-MM-DD), null za ukupno */
  od: string | null;
  do: string;
  ukupnoIgraca: number;
  /** najboljih 50 */
  redovi: RedListe[];
  /** moje mjesto, i kad nisam među prvih 50; null ako nemam bodova u razdoblju */
  moj: RedListe | null;
}
export interface MojaLiga { kod: string; naziv: string; osnivac: boolean; clanova: number }
export interface PobjednikTjedna { od: string; do: string; bodovi: number; nadimci: string[] }
export interface Liga {
  kod: string;
  naziv: string;
  /** jesam li ja osnivač */
  osnivac: boolean;
  nazivOsnivaca: string;
  tjedanOd: string;
  tjedanDo: string;
  ovajTjedan: boolean;
  /** svi članovi, i oni bez bodova */
  redovi: (RedListe & { osnivac: boolean })[];
  /** pobjednici prošlih tjedana, najnoviji prvi */
  pobjednici: PobjednikTjedna[];
}
export interface OdgovorClana {
  nadimak: string;
  ja: boolean;
  /** odgovor kao čitljiv tekst */
  odgovor: string;
  tocno: boolean;
  bodovi: number;
  sekunde: number;
}
export interface PitanjeUsporedbe {
  redni: number;
  kategorija: KategorijaId;
  tip: string;
  tekst: string;
  /** točan odgovor */
  tocno: string;
  odgovori: OdgovorClana[];
}
export interface UsporedbaOdgovora {
  dan: string;
  /** false: taj dan nisam igrao(la) (danas: nisam završio(la)), odgovori drugih su skriveni */
  otvoreno: boolean;
  /** zašto je zatvoreno: danas nije završio(la) ili taj dan nije igrao(la) */
  razlog?: 'nije_zavrsio' | 'nije_igrao';
  pitanja: PitanjeUsporedbe[];
  igraci: { nadimak: string; ja: boolean; bodovi: number; tocnih: number }[];
  nisuIgrali: string[];
}
export interface RezultatKviza { ukupno: number; odgovoreno: number; tocnih: number; najduljiNiz: number }
export interface StanjeDnevnog {
  dan: string;
  ukupnoBodova: number;
  /** true: današnji kviz je već odigran do kraja */
  zavrsen?: boolean;
  kvizId?: string;
  brojPitanja?: number;
  /** redni broj pitanja od kojeg se nastavlja */
  sljedeci?: number;
}

/**
 * Sve što sučelje smije tražiti od servera.
 * Faza 1: LokalniApi (u pregledniku, samo za razvoj).
 * Faza 2: SupabaseApi (RPC funkcije, točni odgovori ostaju na serveru).
 */
export interface Api {
  /** Probni kviz (11 probnih pitanja). */
  pocniKviz(): Promise<{ kvizId: string; brojPitanja: number }>;
  noviIgrac(nadimak: string): Promise<Igrac>;
  igracInfo(igracId: string): Promise<{ nadimak: string; imaPin: boolean }>;
  postaviPin(igracId: string, pin: string): Promise<boolean>;
  /** Vraća igrača ili poruku o grešci (krivi nadimak ili PIN). */
  prijavaPinom(nadimak: string, pin: string): Promise<Igrac | { greska: string }>;
  /** Kviz dana: pokreće ga ili nastavlja. Jednom dnevno po igraču. */
  pocniDnevni(igracId: string): Promise<StanjeDnevnog>;
  /** Trening: 10 nasumičnih pitanja iz kategorije, ne ulazi u rang-liste. */
  pocniTrening(igracId: string, kategorija: KategorijaId): Promise<{ kvizId: string; brojPitanja: number }>;
  /** Način igre (trening bez rang-lista); rekord = najviše bodova igrača u tom načinu dosad. */
  pocniNacin(igracId: string, nacin: string): Promise<{ kvizId: string; brojPitanja: number; rekord: number }>;
  /** Rang-lista kvizova dana; bez kategorije = ukupna lista. */
  rangLista(igracId: string, razdoblje: Razdoblje, kategorija: KategorijaId | null): Promise<RangLista>;
  napraviLigu(igracId: string, naziv: string): Promise<{ kod: string; naziv: string }>;
  /** Naziv lige po kodu pozivnice; null ako kod ne postoji. */
  nazivLige(kod: string): Promise<string | null>;
  pridruziLigi(igracId: string, kod: string): Promise<{ kod: string; naziv: string }>;
  mojeLige(igracId: string): Promise<MojaLiga[]>;
  /** tjedan: bilo koji dan tog tjedna (YYYY-MM-DD), null = ovaj tjedan */
  liga(igracId: string, kod: string, tjedan: string | null, kategorija: KategorijaId | null): Promise<Liga>;
  /** Odgovori članova lige za kviz jednog dana (YYYY-MM-DD). Današnji samo nakon što ga sam završiš. */
  ligaOdgovori(igracId: string, kod: string, dan: string): Promise<UsporedbaOdgovora>;
  preimenujLigu(igracId: string, kod: string, naziv: string): Promise<string>;
  ukloniClana(igracId: string, kod: string, nadimak: string): Promise<boolean>;
  /** Sažetak kviza za završni ekran; null ako ga nema (lokalni način). */
  rezultatKviza(kvizId: string): Promise<RezultatKviza | null>;
  /** Pokreće serversko mjerenje vremena za to pitanje. */
  dohvatiPitanje(kvizId: string, redni: number): Promise<JavnoPitanje>;
  /** Tragovi: otkriva sljedeći trag. */
  otkrijTrag(kvizId: string, redni: number): Promise<string>;
  /** Asocijacije: otkriva jedno polje. */
  otvoriPolje(kvizId: string, redni: number, kolona: number, polje: number): Promise<string>;
  /** Asocijacije: pokušaj rješenja kolone. Vraća rješenje ako je točno. */
  rijesiKolonu(kvizId: string, redni: number, kolona: number, upis: string): Promise<{ tocno: boolean; rjesenje?: string; polja?: string[] }>;
  posaljiOdgovor(kvizId: string, redni: number, odgovor: Odgovor, napustio: boolean): Promise<Rezultat>;
}
