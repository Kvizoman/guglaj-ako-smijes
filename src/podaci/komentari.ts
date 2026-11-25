// Komentari nakon odgovora. Bira ih server prema ishodu.
// Pisani su bez gramatičkog roda (igrači su i žene i muškarci).
// U fazi 2 ovo postaje tablica `komentari` u bazi; nove komentare dodaješ ovdje.

export type Ishod = 'varanje' | 'brzo' | 'tocno' | 'niz' | 'djelomicno' | 'netocno' | 'isteklo';

export const KOMENTARI: Record<Ishod, string[]> = {
  // igrač je za vrijeme pitanja otišao u drugu karticu, aplikaciju ili prozor
  varanje: [
    'Varaš, a?',
    'Varaš, a? Pola bodova ostaje u drugoj kartici.',
    'Neki bi to nazvali istraživanjem. Mi to zovemo varanjem.',
    'Kartica se zatvorila, ali mi smo sve vidjeli. Varaš, a?',
  ],
  brzo: [
    'Brže od Googlea. Sumnjivo brzo, ali priznajemo.',
    'Odgovor je stigao prije nego što je pitanje sjelo.',
    'Voditelj još nije ni dočitao pitanje.',
    'Prsti brži od misli, a misli su ipak stigle na vrijeme.',
  ],
  tocno: [
    'Točno. Publika u studiju tiho kima.',
    'Tako se to radi.',
    'Čisto, bez drame.',
    'Učiteljica iz osnovne škole upravo je osjetila toplinu oko srca.',
    'Ovo bi i zbornica potpisala.',
  ],
  niz: [
    'Niz se nastavlja. Ovo više nije sreća, ovo je metoda.',
    'Kalkulator bodova se počinje zagrijavati.',
    'Netko je večeras došao igrati ozbiljno.',
  ],
  djelomicno: [
    'Pola kruha je bolje nego nimalo.',
    'Blizu. Toliko blizu da se čuje.',
    'Djelomično točno, potpuno hrabro.',
  ],
  netocno: [
    'Hrabar odgovor. Netočan, ali hrabar.',
    'Ovu rundu odnosi pitanje.',
    'Ništa strašno, i enciklopedije imaju loše dane.',
    'Barem je bilo samouvjereno.',
    'Sljedeće je sigurno lakše. Vjerojatno.',
  ],
  isteklo: [
    'Sat je bio brži.',
    'Tišina je također odgovor. Ne točan, ali odgovor.',
    'Odbrojavač ne zna za milost.',
    'Pitanje je čekalo, čekalo, pa otišlo.',
  ],
};

export function odrediIshod(u: { tocno: boolean; bodovi: number; isteklo: boolean; niz: number; udioVremena: number; napustio?: boolean }): Ishod {
  if (u.napustio) return 'varanje';
  if (u.isteklo) return 'isteklo';
  if (u.tocno && u.niz >= 3) return 'niz';
  if (u.tocno && u.udioVremena >= 0.66) return 'brzo';
  if (u.tocno) return 'tocno';
  if (u.bodovi > 0) return 'djelomicno';
  return 'netocno';
}

export function odaberiKomentar(ishod: Ishod, rnd: () => number = Math.random): string {
  const popis = KOMENTARI[ishod];
  return popis[Math.floor(rnd() * popis.length)];
}
