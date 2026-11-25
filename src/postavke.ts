// Sve postavke igre na jednom mjestu. Mijenjaj vrijednosti ovdje.

export const POSTAVKE = {
  /** Vrijeme za odgovor u sekundama, po tipu pitanja i načinu odgovaranja. */
  vrijemeSek: {
    odabir: 15,          // klasični a/b/c/d i svi tipovi kad se bira ponuđeno
    upis: 25,            // kad se odgovor upisuje
    anagram: 20,
    asocijacije: 90,
    poredaj: 30,
    tragovi: 40,
    tocnoNetocnoPoTvrdnji: 6,
  },
  bodovi: {
    osnova: 100,         // za točan odgovor
    bonusBrzina: 50,     // najviše, ako se odgovori odmah
    nizKorak: 0.1,       // svaki uzastopni točan odgovor dodaje 10 %
    nizNajvise: 5,       // ... do najviše +50 %
    kaznaNapustio: 0.5,  // množitelj ako je igrač napustio karticu
    asocijacijeKolona: 15, // bodovi po riješenoj koloni ako konačno rješenje nije pogođeno
  },
  pitanjaPoKategorijiDnevno: 2,
} as const;
