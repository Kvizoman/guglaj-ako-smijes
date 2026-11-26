// Tekstovi i sitne reakcije iz "Guglaj ako smiješ: kreativne ideje" (PDF korisnice, 26.11.2026.).
// Pisani bez gramatičkog roda gdje je to bilo potrebno.
import { h } from './dom';

/** Ulazni tekstovi (ideja 1). */
export const ULAZ = {
  slogan: 'Internet zna sve. A ti?',
  kreni: 'Dokaži da znaš',
  pravila: 'Pravila intelektualnog preživljavanja',
  rangListe: 'Dvorana slavnih mozgova',
  dno: 'Ne odgovaramo za povrede ega.',
};

/** Titule prema postotku točnih (ideja 2). Ključ: najmanji postotak (zaokruženo nadolje). */
const TITULE: [number, string][] = [
  [100, 'Njegovo Veličanstvo Mozak'],
  [96, 'Googleova noćna mora'],
  [86, 'Intelektualna aristokracija'],
  [71, 'Diplomirani sveznalica'],
  [56, 'Neuron s perspektivom'],
  [41, 'Akademski improvizator'],
  [26, 'Mozak u probnom radu'],
  [11, 'Magistar slučajnog odabira'],
  [0, 'Intelektualna sobna biljka'],
];
export function titula(postotak: number): string {
  return TITULE.find(([prag]) => postotak >= prag)![1];
}

/** Poruke po povratku nakon izlaska iz igre (ideja 6). Kazna ostaje, poruka je za humor. */
export const PORUKE_BIJEGA = [
  'Opa! Gdje smo bili? U knjižnici?',
  'Je li Google pozdravio?',
  'Zanimljivo kako baš na ovom pitanju nestaješ.',
  'Evidentiran privremeni odlazak po intelektualnu pomoć.',
  'Jesmo li se vratili pametniji?',
  'Ovaj odlazak evidentirat ćemo kao terensku nastavu.',
];
export function porukaBijega(): string {
  return PORUKE_BIJEGA[Math.floor(Math.random() * PORUKE_BIJEGA.length)];
}

/** Poruke dok vrijeme istječe (ideja 7): sekunde do kraja. */
export const PORUKE_SATA: Record<number, string> = {
  15: 'Bez pritiska. Zasad.',
  10: 'Ne pišemo doktorsku disertaciju.',
  5: 'Vrijeme je za intelektualni hazard.',
  3: 'Ajde, Nobelovče!',
  1: 'Isuse, klikni nešto!',
};

/** Reakcije na ponašanje igrača (ideja 9), za sada one koje ne trebaju načine igre ni rekorde. */
export const REAKCIJE = {
  iskljucenZvuk: 'Istina zna biti neugodna za slušanje.',
  kasnoNocu: 'Svi normalni spavaju. Mi ovdje skupljamo činjenice.',
  povratak: 'Gle tko se vratio! Nedostajalo ti poniženje?',
};

/** Izazov prijatelju (ideja 10). Izvorno "Upravo sam testirao svoj mozak", prepravljeno bez roda. */
export function tekstIzazova(bodovi: number): string {
  return `Moj mozak je upravo testiran: ${bodovi} bodova u kvizu dana. Sad je red na tvoj. Guglaj ako smiješ!`;
}

const ZADNJI_POSJET = 'guglaj-zadnji-posjet';
/** Obavijest pri ulasku: kasno noću (0 do 5 sati) ili povratak nakon 3 i više dana. Jednom po otvaranju igre. */
let posjetObraden = false;
export function obavijestPosjeta(sada = new Date()): string | null {
  if (posjetObraden) return null;
  posjetObraden = true;
  let zadnji: number | null = null;
  try {
    const z = localStorage.getItem(ZADNJI_POSJET);
    zadnji = z ? Number(z) : null;
    localStorage.setItem(ZADNJI_POSJET, String(sada.getTime()));
  } catch { /* privatni način preglednika */ }
  if (zadnji && sada.getTime() - zadnji >= 3 * 24 * 3600 * 1000) return REAKCIJE.povratak;
  if (sada.getHours() < 5) return REAKCIJE.kasnoNocu;
  return null;
}

/** Kratka poruka na dnu zaslona koja sama nestane. */
export function tost(tekst: string, ms = 3200) {
  document.querySelector('.tost')?.remove();
  const el = h('div', { class: 'tost', role: 'status' }, tekst);
  document.body.append(el);
  setTimeout(() => el.classList.add('tost-van'), ms);
  setTimeout(() => el.remove(), ms + 400);
}

/** Ekran s pravilima (ideja 1). Brojke su iz igra.postavke (26.11.2026.). */
export function pravila(): HTMLElement {
  const stavka = (naslov: string, tekst: string) => h('li', {}, h('strong', {}, naslov), ' ', tekst);
  return h('ol', { class: 'pravila' },
    stavka('Kviz dana.', '18 pitanja, po 2 iz svake od 9 kategorija. Ista pitanja za sve, jednom na dan. Novi kviz stiže u ponoć.'),
    stavka('Sat ne čeka.', 'Svako pitanje ima svoje vrijeme, od 6 sekundi po tvrdnji u točno/netočno do 90 za asocijacije. Vrijeme mjeri server, ne tvoj mobitel.'),
    stavka('Bodovi.', 'Točan odgovor nosi 100 bodova i do 50 za brzinu. Tragovi i asocijacije nose više ako ih manje otvoriš.'),
    stavka('Niz.', 'Svaki točan odgovor zaredom dodaje 10 %, najviše do +50 %. Jedna greška i niz kreće ispočetka.'),
    stavka('Guglaj ako smiješ.', 'Ako za vrijeme pitanja izađeš iz igre, bodovi za to pitanje se prepolove. Primijetit ćemo.'),
    stavka('Rang-liste i lige.', 'Broje se samo kvizovi dana. Trening je za vježbu i ne ulazi nigdje.'),
  );
}

/** Načini igre (ideja 5). Svi su trening: ne ulaze u rang-liste. */
export type NacinId = 'kava' | 'pakao' | 'smrt' | 'autocesta' | 'rulet' | 'obracun';
export const NACINI: { id: NacinId; naziv: string; opis: string }[] = [
  { id: 'kava', naziv: 'Mozak uz kavu', opis: 'Opuštena igra bez vremenskog ograničenja.' },
  { id: 'pakao', naziv: 'Intelektualni pakao', opis: 'Samo teška pitanja. Bez milosti.' },
  { id: 'smrt', naziv: 'Iznenadna smrt ega', opis: 'Prvi pogrešan odgovor završava igru.' },
  { id: 'autocesta', naziv: 'Mozak na autocesti', opis: 'Pet sekundi za svako pitanje.' },
  { id: 'rulet', naziv: 'Ruski rulet znanja', opis: 'Nasumične kategorije i razine težine.' },
  { id: 'obracun', naziv: 'Obračun s vlastitim egom', opis: 'Pokušaj nadmašiti vlastiti rekord.' },
];
export function nazivNacina(id: NacinId): string {
  return NACINI.find((n) => n.id === id)!.naziv;
}

/** Reakcije na razinu i rekord (ideja 9). */
export const REAKCIJE_IGRE = {
  najlaksa: 'Ambicije su nam danas na godišnjem.',
  najteza: 'Ili si genijalac ili ne znaš u što se upuštaš.',
  oborenRekord: 'Ego je uspješno nadograđen.',
  nijeOboren: 'Jučerašnja verzija tebe šalje pozdrave.',
  smrt: 'Ego je preminuo. Uzrok smrti: jedan pogrešan odgovor.',
};
