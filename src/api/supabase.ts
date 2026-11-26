// Pravi server: Supabase RPC funkcije. Točni odgovori ostaju u bazi dok igrač ne odgovori.
import type { Api, Igrac, Liga, MojaLiga, RangLista, Razdoblje, StanjeDnevnog, UsporedbaOdgovora } from './tip';
import type { JavnoPitanje, KategorijaId, Odgovor, Rezultat } from '../tipovi';
import { SUPABASE_URL, SUPABASE_KLJUC } from './konfig';

async function rpc<T>(funkcija: string, argumenti: Record<string, unknown> = {}): Promise<T> {
  let odgovor: Response;
  try {
    odgovor = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${funkcija}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KLJUC, 'Content-Type': 'application/json' },
      body: JSON.stringify(argumenti),
    });
  } catch {
    throw new Error('Nema veze sa serverom. Provjeri internet i pokušaj ponovno.');
  }
  const tijelo = await odgovor.json().catch(() => null);
  if (!odgovor.ok) {
    const poruka = tijelo && typeof tijelo.message === 'string' ? tijelo.message : `Greška servera (${odgovor.status}).`;
    throw new Error(poruka);
  }
  return tijelo as T;
}

export class SupabaseApi implements Api {
  pocniKviz() {
    return rpc<{ kvizId: string; brojPitanja: number }>('pocni_kviz');
  }
  dohvatiPitanje(kvizId: string, redni: number) {
    return rpc<JavnoPitanje>('dohvati_pitanje', { p_kviz: kvizId, p_redni: redni });
  }
  otkrijTrag(kvizId: string, redni: number) {
    return rpc<string>('otkrij_trag', { p_kviz: kvizId, p_redni: redni });
  }
  otvoriPolje(kvizId: string, redni: number, kolona: number, polje: number) {
    return rpc<string>('otvori_polje', { p_kviz: kvizId, p_redni: redni, p_kolona: kolona, p_polje: polje });
  }
  rijesiKolonu(kvizId: string, redni: number, kolona: number, upis: string) {
    return rpc<{ tocno: boolean; rjesenje?: string; polja?: string[] }>('rijesi_kolonu', {
      p_kviz: kvizId, p_redni: redni, p_kolona: kolona, p_upis: upis,
    });
  }
  posaljiOdgovor(kvizId: string, redni: number, odgovor: Odgovor, napustio: boolean) {
    return rpc<Rezultat>('posalji_odgovor', { p_kviz: kvizId, p_redni: redni, p_odgovor: odgovor, p_napustio: napustio });
  }
  noviIgrac(nadimak: string) {
    return rpc<Igrac>('novi_igrac', { p_nadimak: nadimak });
  }
  igracInfo(igracId: string) {
    return rpc<{ nadimak: string; imaPin: boolean }>('igrac_info', { p_igrac: igracId });
  }
  postaviPin(igracId: string, pin: string) {
    return rpc<boolean>('postavi_pin', { p_igrac: igracId, p_pin: pin });
  }
  prijavaPinom(nadimak: string, pin: string) {
    return rpc<Igrac | { greska: string }>('prijava_pinom', { p_nadimak: nadimak, p_pin: pin });
  }
  pocniDnevni(igracId: string) {
    return rpc<StanjeDnevnog>('pocni_dnevni', { p_igrac: igracId });
  }
  pocniTrening(igracId: string, kategorija: KategorijaId) {
    return rpc<{ kvizId: string; brojPitanja: number }>('pocni_trening', { p_igrac: igracId, p_kategorija: kategorija });
  }
  rangLista(igracId: string, razdoblje: Razdoblje, kategorija: KategorijaId | null) {
    return rpc<RangLista>('rang_lista', { p_igrac: igracId, p_razdoblje: razdoblje, p_kategorija: kategorija });
  }
  napraviLigu(igracId: string, naziv: string) {
    return rpc<{ kod: string; naziv: string }>('napravi_ligu', { p_igrac: igracId, p_naziv: naziv });
  }
  nazivLige(kod: string) {
    return rpc<string | null>('naziv_lige', { p_kod: kod });
  }
  pridruziLigi(igracId: string, kod: string) {
    return rpc<{ kod: string; naziv: string }>('pridruzi_ligi', { p_igrac: igracId, p_kod: kod });
  }
  mojeLige(igracId: string) {
    return rpc<MojaLiga[]>('moje_lige', { p_igrac: igracId });
  }
  liga(igracId: string, kod: string, tjedan: string | null, kategorija: KategorijaId | null) {
    return rpc<Liga>('liga', { p_igrac: igracId, p_kod: kod, p_tjedan: tjedan, p_kategorija: kategorija });
  }
  ligaOdgovori(igracId: string, kod: string, dan: string) {
    return rpc<UsporedbaOdgovora>('liga_odgovori', { p_igrac: igracId, p_kod: kod, p_dan: dan });
  }
  preimenujLigu(igracId: string, kod: string, naziv: string) {
    return rpc<string>('preimenuj_ligu', { p_igrac: igracId, p_kod: kod, p_naziv: naziv });
  }
  ukloniClana(igracId: string, kod: string, nadimak: string) {
    return rpc<boolean>('ukloni_clana', { p_igrac: igracId, p_kod: kod, p_nadimak: nadimak });
  }
}
