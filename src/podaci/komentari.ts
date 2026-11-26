// Poruke nakon odgovora i na kraju kviza. Bira ih server (igra.komentari, migracija 0013).
// Izvor: "Kviz s karakterom" (PDF korisnice, Google Disk, 26.11.2026.), uz poruke za varanje i jednu korisničinu poruku.
// Pisane su bez gramatičkog roda (igrači su i žene i muškarci).
// Tablica `komentari` u bazi puni se odavde; nove poruke dodaješ ovdje.
// Unutar jednog kviza server istu poruku ne ponavlja.
//
// Kako server bira (prva skupina koja odgovara i u kojoj ima neiskorištene poruke):
//   točno:    niz (točno taj broj) > povratak (nakon 3+ pogrešnih) > tesko (težina 3) > brzo > tocno
//   netočno:  varanje > prekid (prekinut niz od 5+) > nizNetocnih (točno taj broj) > isteklo > lako (težina 1) > netocno
//   djelomično točno: samo prekid ili nizNetocnih, inače bez poruke
//   kraj kviza: poruka za postotak točnih; bonus uz 100 %

export type Ishod =
  | 'varanje' | 'brzo' | 'tocno' | 'tesko' | 'povratak'
  | 'netocno' | 'lako' | 'prekid' | 'isteklo' | 'djelomicno' | 'niz';

/** Skupine bez praga. */
export const KOMENTARI: Record<Exclude<Ishod, 'niz'>, string[]> = {
  // igrač je za vrijeme pitanja otišao u drugu karticu, aplikaciju ili prozor
  varanje: [
    'Varaš, a?',
    'Varaš, a? Pola bodova ostaje u drugoj kartici.',
    'Neki bi to nazvali istraživanjem. Mi to zovemo varanjem.',
    'Kartica se zatvorila, ali mi smo sve vidjeli. Varaš, a?',
    'Google je super, ali ovdje ga nitko nije zvao.',
    'Druga kartica ne vrijedi kao zovi prijatelja.',
    'Primijetili smo izlet. Pola bodova je ostalo kod kuće.',
    'Ime igre je upozorenje, a ne pozivnica.',
    'Ekran je na trenutak ostao sam. Bilo mu je tužno.',
    'Kratka šetnja internetom, dugačko lice na rang-listi.',
    'Tko traži, nađe. I izgubi pola bodova.',
    'Ovo je kviz, a ne seminarski rad s popisom literature.',
  ],
  // pogrešan odgovor
  netocno: [
    'Kreativno, ali činjenično neodrživo.',
    'Samopouzdanje 100 %, preciznost nešto manje.',
    'Zanimljiva teorija. Znanost se ne slaže.',
    'Odgovor ima karakter. Nažalost, nema točnost.',
    'U nekom paralelnom svemiru možda i jest.',
    'Lijepo zamišljeno, pogrešno izvedeno.',
    'Ni povjerenstvo za žalbe ovdje ne može pomoći.',
    'Cijenimo umjetničku slobodu, ali tražimo činjenice.',
    'Taj odgovor još čeka znanstvenu potvrdu.',
    'Mašta je divna stvar. Osim na ovom pitanju.',
    'Činjenice su upravo uložile prigovor.',
    'Pokušaj vrijedan pažnje, ali ne i boda.',
    'Logika je krenula na put, ali promašila izlaz.',
    'Svemir je velik, ali ni u njemu nema opravdanja za ovaj odgovor.',
    'Nije točno, ali barem nije dosadno!',
  ],
  // točan odgovor na obično pitanje
  tocno: [
    'Mozak uredno servisiran!',
    'Neuroni surađuju. Divota!',
    'Znanje evidentirano, ego može malo narasti.',
    'Sumnjivo dobro!',
    'Mentalna kondicija na zavidnoj razini.',
    'Bod u džepu, osmijeh na licu!',
    'Činjenice i ti očito ste u dobrim odnosima.',
    'Intelektualni promet odvija se bez zastoja.',
    'Točno! Danas se očito ne radi na rezervi.',
    'Mozak opravdava troškove održavanja.',
  ],
  // točan odgovor na teško pitanje (težina 3)
  tesko: [
    'Točno mislim da ipak guglaš na drugom uređaju.',
    'Je li tebe Wikipedia zvala na konzultacije?',
    'Molimo ostale igrače da ne paničare.',
    'Ovo pitanje je trebalo biti teško. Hvala na kvarenju koncepta.',
    'Einstein se upravo diskretno nakašljao.',
    'Tvoj mozak očito ima dodatnu opremu.',
    'Intelektualna demonstracija sile!',
    'Ovakve odgovore trebalo bi oporezivati kao luksuz.',
    'Pitanje je upravo izgubilo samopouzdanje.',
    'Komisija za težinu pitanja podnosi ostavku.',
    'Ovo više nije znanje. Ovo je intelektualni bezobrazluk.',
    'Je li taj mozak tvornički ili naknadno ugrađen?',
    'Enciklopedije su upravo osjetile konkurenciju.',
    'Netko je očito čitao i sitna slova.',
    'Skidamo kapu. Iako je nemamo.',
    'Očekivali smo otpor, ne kapitulaciju pitanja.',
  ],
  // prvi pogrešan odgovor nakon niza od 5 ili više točnih
  prekid: [
    'I svemir je konačno uspostavio ravnotežu.',
    'Aha! Ipak si ljudsko biće!',
    'Dobro je. Već smo sumnjali na umjetnu inteligenciju.',
    'Imperij je doživio manji administrativni problem.',
    'Jedna rupa na autocesti genijalnosti.',
    'Ne brini, ni Ferrari ne prolazi svaku krivinu savršeno.',
    'Konkurencija je upravo kolektivno odahnula.',
    'Kruna je malo nakrivljena, ali još je na glavi.',
  ],
  // pogrešan odgovor na vrlo lako pitanje (težina 1)
  lako: [
    'Ovo pitanje nije imalo ambicije biti teško.',
    'Čak je i pitanje iznenađeno.',
    'Dogodila se manja prometna nesreća između pitanja i odgovora.',
    'Pretpostavljamo da je prst djelovao samostalno.',
    'Mozak i prst očito nisu održali pripremni sastanak.',
    'Ovo ćemo pripisati tehničkim poteškoćama.',
    'Pitanje je došlo u miru. Nije očekivalo ovakav rasplet.',
    'Čak i najbolji ponekad promaše prazan gol.',
  ],
  // munjevito brz točan odgovor
  brzo: [
    'Pitanje se nije stiglo ni udobno smjestiti.',
    'Brže od vlastite sjene!',
    'Mozak na optičkom internetu.',
    'Jesmo li uopće stigli postaviti pitanje?',
    'Neuroni očito nemaju ograničenje brzine.',
    'Ovdje ni štoperica nema samopouzdanja.',
    'Intelektualni sprint bez zagrijavanja!',
  ],
  // istek vremena
  isteklo: [
    'Vrijeme je isteklo, filozofiranje se nastavlja.',
    'Dok smo razmišljali, pitanje je otišlo u mirovinu.',
    'Temeljita analiza. Šteta što nije završena.',
    'Vrijeme, za razliku od nas, nije imalo strpljenja.',
    'Odgovor je vjerojatno još na putu.',
    'Odluka je očito zahtijevala sjednicu upravnog odbora.',
  ],
  // točan odgovor nakon 3 ili više pogrešnih zaredom
  povratak: [
    'Habemus odgovor!',
    'Sustav je uspješno ponovno pokrenut.',
    'Neuroni se vratili s godišnjeg!',
    'Povratak otpisanih!',
    'Feniks se digao iz pepela netočnih odgovora.',
    'Mentalna služba ponovno je operativna.',
    'Evo ga! Počela je druga sezona!',
  ],
  // djelomično točno: u zbirci nema posebnih poruka
  djelomicno: [],
};

/** Niz točnih odgovora: poruka za točno taj broj zaredom. */
export const NIZ_TOCNIH: Record<number, string> = {
  3: 'Neuroni su se zagrijali!',
  4: 'Ovo polako prestaje biti slučajnost.',
  5: 'Mozak prešao u sportsku brzinu!',
  6: 'Intelektualna mašinerija u punom pogonu.',
  7: 'Konkurencija počinje preispitivati životne odluke.',
  8: 'Molimo mozak da poštuje ograničenje brzine.',
  9: 'Kviz počinje osjećati nelagodu.',
  10: 'Aktiviran intelektualni terorizam nad pitanjima!',
  15: 'Administracija kviza sazvala je krizni sastanak.',
  20: 'Kviz je došao testirati tebe. Situacija se preokrenula.',
  25: 'Predlažemo da ubuduće ti sastavljaš pitanja.',
  30: 'Dobro, profesorska ekipo, možemo li mi sad kući?',
};

/** Niz pogrešnih odgovora: poruka za točno taj broj zaredom. */
export const NIZ_NETOCNIH: Record<number, string> = {
  2: 'Neuroni se još dogovaraju.',
  3: 'Mozak je očito na pauzi za kavu.',
  4: 'Trenutačno se testiraju alternativne činjenice.',
  5: 'Imamo li rezervni plan ili improviziramo do kraja?',
  6: 'Služba za mentalnu tehničku podršku je obaviještena.',
  7: 'Ovo više nije niz. Ovo je umjetnički pravac.',
  8: 'Svaki veliki povratak zahtijeva dramatičan početak.',
};

/** Završna poruka: ključ je najmanji postotak točnih (zaokruženo nadolje) za koji vrijedi. */
export const KRAJ: Record<number, string> = {
  100: 'Kviz je polagao ispit kod tebe. Položio je jedva.',
  90: 'Intelektualna aristokracija.',
  80: 'Mozak s premium pretplatom.',
  70: 'Ozbiljna prijetnja prosjeku.',
  60: 'Solidna mašinerija, povremeno zaškripi.',
  50: 'Znanje i improvizacija u koaliciji.',
  40: 'Potencijal postoji. Dokazi se još prikupljaju.',
  20: 'Rezultat skroman, iskustvo neprocjenjivo.',
  1: 'Danas smo više istraživali granice mogućeg.',
  0: 'Statistički fascinantno. Čak je i slučajnost ostala bez teksta.',
};

/** Skrivena bonus poruka: na kraju kviza uz 100 % točnih. */
export const BONUS = 'Poštovani, ovo je rekreativni kviz, a ne demonstracija intelektualne nadmoći. Molimo za malo kolegijalnosti.';

/** Pojednostavljeno, samo za lokalni način (?lokalno); pravi odabir radi server. */
export function odrediIshod(u: { tocno: boolean; bodovi: number; isteklo: boolean; niz: number; udioVremena: number; napustio?: boolean }): Ishod {
  if (u.napustio) return 'varanje';
  if (u.isteklo) return 'isteklo';
  if (u.tocno && u.niz >= 3 && NIZ_TOCNIH[u.niz]) return 'niz';
  if (u.tocno && u.udioVremena >= 0.66) return 'brzo';
  if (u.tocno) return 'tocno';
  if (u.bodovi > 0) return 'djelomicno';
  return 'netocno';
}

export function odaberiKomentar(ishod: Ishod, rnd: () => number = Math.random, niz = 0): string {
  if (ishod === 'niz') return NIZ_TOCNIH[niz] ?? '';
  const popis = KOMENTARI[ishod];
  return popis.length ? popis[Math.floor(rnd() * popis.length)] : '';
}
