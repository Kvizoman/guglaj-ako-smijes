import './styles.css';
import type { Api, Igrac, Liga, MojaLiga, PitanjeUsporedbe, RangLista, Razdoblje, RedListe, UsporedbaOdgovora } from './api/tip';
import type { JavnoPitanje, KategorijaId, Odgovor, Rezultat } from './tipovi';
import { SupabaseApi } from './api/supabase';
import { KATEGORIJE, NAZIV_TIPA, ikonaSvg } from './kategorije';
import { h, ocisti } from './ui/dom';
import { pokreniTajmer } from './ui/tajmer';
import { nacrtajPlocu, type Ploca } from './ui/renderi';
import { zvuk, jeUkljucen, prebaci } from './zvuk';
import { mnoziteljNiza } from './bodovanje';

// Pravi server (Supabase). Za razvoj bez interneta: dodaj ?lokalno na adresu.
// Lokalni način postoji samo u razvoju (npm run dev); u objavljenoj igri nema ni njega ni probnih odgovora.
let api: Api = new SupabaseApi();
const app = document.getElementById('app')!;

const ZVUK_UKLJ = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>';
const ZVUK_ISKLJ = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9.5l5 5M22 9.5l-5 5"/></svg>';

function gumbZvuka(): HTMLButtonElement {
  const b = h('button', { class: 'zvuk-gumb', type: 'button' });
  const osvjezi = () => {
    b.innerHTML = jeUkljucen() ? ZVUK_UKLJ : ZVUK_ISKLJ;
    b.setAttribute('aria-label', jeUkljucen() ? 'Isključi zvuk' : 'Uključi zvuk');
    b.setAttribute('aria-pressed', String(!jeUkljucen()));
  };
  b.addEventListener('click', () => { prebaci(); osvjezi(); });
  osvjezi();
  return b;
}

// ---------- Početni zaslon ----------

function logo(): HTMLElement {
  return h('h1', { class: 'logo' }, h('span', {}, 'Guglaj'), h('span', {}, 'ako'), h('span', {}, 'smiješ'));
}

// ---------- Igrač (pamti ga preglednik) ----------

const KLJUC_IGRACA = 'guglaj-igrac';

function spremljeniIgrac(): Igrac | null {
  try {
    const i = JSON.parse(localStorage.getItem(KLJUC_IGRACA) ?? 'null');
    return i && typeof i.igracId === 'string' && typeof i.nadimak === 'string' ? i : null;
  } catch {
    return null;
  }
}
function spremiIgraca(i: Igrac | null) {
  if (i) localStorage.setItem(KLJUC_IGRACA, JSON.stringify({ igracId: i.igracId, nadimak: i.nadimak }));
  else localStorage.removeItem(KLJUC_IGRACA);
}
// U lokalnom načinu (?lokalno) igrači postoje samo u memoriji, pa se ne pamte.
const lokalno = new URLSearchParams(location.search).has('lokalno');
let igrac: Igrac | null = lokalno ? null : spremljeniIgrac();

function poruka(): HTMLElement {
  return h('p', { class: 'obrazac-greska', role: 'alert', hidden: true });
}
function pokaziPoruku(el: HTMLElement, e: unknown) {
  el.textContent = e instanceof Error ? e.message : String(e);
  el.hidden = false;
}

/** Obrazac koji se šalje jednom: gumb se zaključa dok traje slanje, a nakon greške se otključa. */
function obrazac(gumb: HTMLButtonElement, posalji: () => Promise<void>, ...djeca: (Node | null)[]) {
  const tekstGumba = gumb.textContent;
  return h('form', {
    class: 'obrazac', novalidate: true,
    onsubmit: async (e: Event) => {
      e.preventDefault();
      if (gumb.disabled) return;
      gumb.disabled = true;
      gumb.textContent = 'Šaljem…';
      try { await posalji(); } finally { gumb.disabled = false; gumb.textContent = tekstGumba; }
    },
  }, ...djeca, gumb);
}

function ekranNadimka() {
  document.body.style.removeProperty('--kat');
  ocisti(app);
  const nadimak = h('input', {
    class: 'upis', id: 'nadimak', type: 'text', autocomplete: 'nickname', spellcheck: 'false',
    maxlength: '20', placeholder: 'npr. Zbornica_Ana', enterkeyhint: 'go',
  });
  const greskaEl = poruka();
  const pozivEl = h('p', { class: 'obavijest', role: 'status', hidden: true });
  if (pozivnica) {
    const kod = pozivnica;
    void api.nazivLige(kod).then((n) => {
      pozivEl.textContent = n ? `Pozivnica za ligu „${n}”. Upiši nadimak i ulaziš u ligu.` : 'Pozivnica nije ispravna: ta liga ne postoji.';
      pozivEl.hidden = false;
    }).catch(() => {});
  }
  app.append(h('main', { class: 'pocetna' },
    h('div', { class: 'pocetna-vrh' }, gumbZvuka()),
    logo(),
    pozivEl,
    h('p', { class: 'pocetna-podnaslov' }, 'Devet kategorija, sat koji ne čeka i nijedno pitanje na koje se može odgovoriti guglanjem.'),
    obrazac(h('button', { class: 'gumb gumb-glavni gumb-velik', type: 'submit' }, 'Kreni'), async () => {
      try {
        igrac = await api.noviIgrac(nadimak.value);
        if (!lokalno) spremiIgraca(igrac);
        await pocetni();
      } catch (e) { pokaziPoruku(greskaEl, e); }
    },
    h('label', { class: 'obrazac-oznaka', for: 'nadimak' }, 'Kako da te zovemo?'),
    nadimak,
    h('p', { class: 'obrazac-pomoc' }, 'Nadimak se vidi na rang-listama. Bez imena i prezimena, 3 do 20 znakova.'),
    greskaEl),
    h('button', { class: 'gumb gumb-sporedni', type: 'button', onclick: ekranPrijave }, 'Već igram na drugom uređaju'),
    gumbIsprobaj(),
  ));
  nadimak.focus();
}

function ekranPrijave() {
  ocisti(app);
  const nadimak = h('input', { class: 'upis', id: 'p-nadimak', type: 'text', autocomplete: 'username', spellcheck: 'false', maxlength: '20' });
  const pin = h('input', {
    class: 'upis upis-pin', id: 'p-pin', type: 'password', inputmode: 'numeric', autocomplete: 'current-password',
    maxlength: '4', enterkeyhint: 'go',
  });
  const greskaEl = poruka();
  app.append(h('main', { class: 'pocetna' },
    h('h2', { class: 'naslov-ekrana' }, 'Nastavi s istim nadimkom'),
    h('p', { class: 'obrazac-pomoc' }, 'Upiši nadimak i PIN postavljen na drugom uređaju. PIN se postavlja na početnom zaslonu igre.'),
    obrazac(h('button', { class: 'gumb gumb-glavni gumb-velik', type: 'submit' }, 'Prijavi se'), async () => {
      try {
        const r = await api.prijavaPinom(nadimak.value, pin.value);
        if ('greska' in r) { pokaziPoruku(greskaEl, r.greska); return; }
        igrac = r;
        if (!lokalno) spremiIgraca(igrac);
        await pocetni();
      } catch (e) { pokaziPoruku(greskaEl, e); }
    },
    h('label', { class: 'obrazac-oznaka', for: 'p-nadimak' }, 'Nadimak'), nadimak,
    h('label', { class: 'obrazac-oznaka', for: 'p-pin' }, 'PIN (4 znamenke)'), pin,
    greskaEl),
    h('button', { class: 'gumb gumb-sporedni', type: 'button', onclick: () => pocetni() }, 'Natrag'),
  ));
  nadimak.focus();
}

function ekranPina(imaPin: boolean) {
  ocisti(app);
  const pin = h('input', {
    class: 'upis upis-pin', id: 'n-pin', type: 'password', inputmode: 'numeric', autocomplete: 'new-password',
    maxlength: '4', enterkeyhint: 'done',
  });
  const greskaEl = poruka();
  app.append(h('main', { class: 'pocetna' },
    h('h2', { class: 'naslov-ekrana' }, imaPin ? 'Promijeni PIN' : 'Postavi PIN'),
    h('p', { class: 'obrazac-pomoc' },
      `S PIN-om možeš igrati kao ${igrac!.nadimak} i na drugom uređaju: tamo odaberi „Već igram na drugom uređaju”. Bez PIN-a nadimak ostaje samo u ovom pregledniku.`),
    obrazac(h('button', { class: 'gumb gumb-glavni gumb-velik', type: 'submit' }, 'Spremi PIN'), async () => {
      try {
        await api.postaviPin(igrac!.igracId, pin.value);
        await pocetni('PIN je spremljen.');
      } catch (e) { pokaziPoruku(greskaEl, e); }
    },
    h('label', { class: 'obrazac-oznaka', for: 'n-pin' }, 'Novi PIN (4 znamenke)'), pin, greskaEl),
    h('button', { class: 'gumb gumb-sporedni', type: 'button', onclick: () => pocetni() }, 'Natrag'),
  ));
  pin.focus();
}

async function pocetni(obavijest?: string) {
  document.body.style.removeProperty('--kat');
  ugasiScenu();
  if (!igrac) { ekranNadimka(); return; }
  let info: { nadimak: string; imaPin: boolean };
  let lige: MojaLiga[];
  try {
    [info, lige] = await Promise.all([api.igracInfo(igrac.igracId), api.mojeLige(igrac.igracId)]);
  } catch (e) {
    if (e instanceof Error && e.message === 'Nepoznat igrač.') { spremiIgraca(igrac = null); ekranNadimka(); return; }
    greska(e);
    return;
  }
  if (await obradiPozivnicu()) return;
  const kategorije = Object.values(KATEGORIJE);
  ocisti(app);
  app.append(
    h('main', { class: 'pocetna' },
      h('div', { class: 'pocetna-vrh pocetna-vrh-igrac' }, h('span', { class: 'igrac-nadimak' }, info.nadimak), gumbZvuka()),
      logo(),
      obavijest ? h('p', { class: 'obavijest', role: 'status' }, obavijest) : null,
      h('button', { class: 'gumb gumb-glavni gumb-velik', type: 'button', onclick: jednimKlikom(igrajDnevni) }, 'Kviz dana'),
      h('p', { class: 'napomena' }, '18 pitanja, po 2 iz svake kategorije. Isti za sve igrače, jednom na dan.'),
      h('button', { class: 'gumb gumb-sporedni', type: 'button', onclick: jednimKlikom(() => ekranRangListe()) }, 'Rang-liste'),
      gumbIsprobaj(),
      h('h2', { class: 'naslov-odjeljka' }, 'Trening'),
      h('p', { class: 'napomena napomena-odjeljak' }, '10 pitanja iz jedne kategorije, koliko god puta želiš. Ne ulazi u rang-liste.'),
      h('div', { class: 'kategorije-popis kategorije-gumbi' },
        ...kategorije.map((k) => {
          const b = h('button', { type: 'button', html: `${ikonaSvg(k.id)}<span>${k.naziv}</span>`, onclick: jednimKlikom(() => igrajTrening(k.id)) });
          b.style.setProperty('--kat', k.boja);
          return b;
        })),
      h('h2', { class: 'naslov-odjeljka' }, 'Lige'),
      h('p', { class: 'napomena napomena-odjeljak' }, 'Tjedno natjecanje s ekipom, od ponedjeljka do nedjelje. Ulazi se pozivnicom.'),
      lige.length > 0
        ? h('ul', { class: 'moje-lige' }, ...lige.map((l) => h('li', {},
          h('button', { type: 'button', class: 'moja-liga', onclick: jednimKlikom(() => ekranLige(l.kod)) },
            h('span', { class: 'moja-liga-naziv' }, l.naziv),
            h('span', { class: 'moja-liga-clanova' }, `${l.clanova} ${clanovaRijec(l.clanova)}`)))))
        : null,
      h('button', { class: 'gumb gumb-sporedni', type: 'button', onclick: ekranNoveLige }, 'Napravi ligu'),
      h('div', { class: 'pocetna-dno' },
        h('button', { class: 'gumb gumb-sporedni', type: 'button', onclick: () => ekranPina(info.imaPin) },
          info.imaPin ? 'Promijeni PIN' : 'Postavi PIN za drugi uređaj')),
    ),
  );
}

// ---------- Rang-liste ----------

const NAZIV_RAZDOBLJA: Record<Razdoblje, string> = { dan: 'Danas', tjedan: 'Tjedan', ukupno: 'Ukupno' };

/** 1 član, 2 člana, 5 članova, 12 članova, 22 člana */
function clanovaRijec(n: number): string {
  const j = n % 10, d = n % 100;
  if (j === 1 && d !== 11) return 'član';
  if (j >= 2 && j <= 4 && (d < 12 || d > 14)) return 'člana';
  return 'članova';
}
/** 1 dan, 2 dana, 5 dana, 21 dan, 11 dana */
function danaRijec(n: number): string {
  return n % 10 === 1 && n % 100 !== 11 ? 'dan' : 'dana';
}
function datum(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${Number(d)}.${Number(m)}.`;
}

function redListe(r: RedListe, podnaslov?: string): HTMLElement {
  return h('li', { class: `rang-red${r.ja ? ' rang-ja' : ''}`, 'aria-current': r.ja ? 'true' : null },
    h('span', { class: 'rang-mjesto' }, `${r.mjesto}.`),
    h('span', { class: 'rang-ime' }, h('span', { class: 'rang-nadimak' }, r.nadimak), h('span', { class: 'rang-dana' }, podnaslov ?? `${r.dana} ${danaRijec(r.dana)}`)),
    h('span', { class: 'rang-bodovi' }, String(r.bodovi)));
}

async function ekranRangListe(razdoblje: Razdoblje = 'dan', kat: KategorijaId | null = null) {
  ugasiScenu();
  if (kat) document.body.style.setProperty('--kat', KATEGORIJE[kat].boja);
  else document.body.style.removeProperty('--kat');

  let l: RangLista;
  try {
    l = await api.rangLista(igrac!.igracId, razdoblje, kat);
  } catch (e) {
    greska(e);
    return;
  }

  const razdoblja = h('div', { class: 'rang-razdoblja', role: 'group', 'aria-label': 'Razdoblje' },
    ...(Object.keys(NAZIV_RAZDOBLJA) as Razdoblje[]).map((r) =>
      h('button', { type: 'button', class: 'rang-razdoblje', 'aria-pressed': String(r === razdoblje), onclick: () => ekranRangListe(r, kat) }, NAZIV_RAZDOBLJA[r])));

  const kategorije = h('div', { class: 'rang-kategorije', role: 'group', 'aria-label': 'Kategorija' },
    h('button', { type: 'button', class: 'rang-kat rang-kat-sve', 'aria-pressed': String(kat === null), onclick: () => ekranRangListe(razdoblje, null) }, 'Sve'),
    ...Object.values(KATEGORIJE).map((k) => {
      const b = h('button', {
        type: 'button', class: 'rang-kat', 'aria-pressed': String(k.id === kat), title: k.naziv, 'aria-label': k.naziv,
        html: ikonaSvg(k.id), onclick: () => ekranRangListe(razdoblje, k.id),
      });
      b.style.setProperty('--kat', k.boja);
      return b;
    }));

  const raspon = razdoblje === 'dan' ? `kviz dana ${datum(l.do)}`
    : razdoblje === 'tjedan' ? `kvizovi dana od ${datum(l.od!)} do ${datum(l.do)}` : 'svi kvizovi dana';
  const opis = `${kat ? KATEGORIJE[kat].naziv : 'Sve kategorije'}: ${raspon}`;

  const mojMeduPrvima = l.redovi.some((r) => r.ja);
  const popis = l.redovi.length === 0
    ? h('p', { class: 'rang-prazno' }, razdoblje === 'dan'
      ? 'Danas još nitko nema bodova. Odigraj kviz dana i budi prvi na listi.'
      : 'U ovom razdoblju još nitko nema bodova.')
    : h('ol', { class: 'rang-popis' }, ...l.redovi.map((r) => redListe(r)),
      l.moj && !mojMeduPrvima ? h('li', { class: 'rang-razmak', 'aria-hidden': 'true' }, '…') : null,
      l.moj && !mojMeduPrvima ? redListe(l.moj) : null);

  ocisti(app);
  app.append(h('main', { class: 'rang' },
    h('div', { class: 'pocetna-vrh pocetna-vrh-igrac' },
      h('button', { class: 'gumb gumb-sporedni gumb-mali', type: 'button', onclick: () => pocetni() }, 'Natrag'), gumbZvuka()),
    h('h2', { class: 'naslov-ekrana' }, 'Rang-liste'),
    razdoblja,
    kategorije,
    h('p', { class: 'rang-opis' }, opis),
    popis,
    l.redovi.length > 0 && !l.moj
      ? h('p', { class: 'napomena rang-napomena' }, 'Tebe još nema na ovoj listi: broje se samo bodovi iz kviza dana.')
      : null,
    l.ukupnoIgraca > l.redovi.length
      ? h('p', { class: 'napomena rang-napomena' }, `Prikazano najboljih ${l.redovi.length} od ${l.ukupnoIgraca} igrača.`)
      : null,
  ));
}

// ---------- Lige ----------

/** Kod lige iz pozivnice (#liga-K7P2QX) koji čeka da se igrač pridruži. */
let pozivnica: string | null = null;

function procitajPozivnicu() {
  const m = /^#liga-([A-Za-z0-9]{6})$/.exec(location.hash);
  if (!m) return;
  pozivnica = m[1].toUpperCase();
  history.replaceState(null, '', location.pathname + location.search);
}
window.addEventListener('hashchange', () => {
  procitajPozivnicu();
  if (pozivnica) void pocetni();
});

function linkPozivnice(kod: string): string {
  return `${location.origin}${location.pathname}#liga-${kod}`;
}

/** Ako postoji pozivnica i igrač je poznat: pridruži ga i otvori ligu. Vraća true ako je preuzela ekran. */
async function obradiPozivnicu(): Promise<boolean> {
  if (!pozivnica || !igrac) return false;
  const kod = pozivnica;
  pozivnica = null;
  try {
    const l = await api.pridruziLigi(igrac.igracId, kod);
    await ekranLige(l.kod, null, null, `Dobrodošlica u ligu „${l.naziv}”.`);
  } catch (e) {
    await pocetni(e instanceof Error ? e.message : String(e));
  }
  return true;
}

function ekranNoveLige() {
  ugasiScenu();
  ocisti(app);
  const naziv = h('input', { class: 'upis', id: 'naziv-lige', type: 'text', autocomplete: 'off', maxlength: '30', placeholder: 'npr. Zbornica', enterkeyhint: 'go' });
  const greskaEl = poruka();
  app.append(h('main', { class: 'pocetna' },
    h('div', { class: 'pocetna-vrh pocetna-vrh-igrac' },
      h('button', { class: 'gumb gumb-sporedni gumb-mali', type: 'button', onclick: () => pocetni() }, 'Natrag'), gumbZvuka()),
    h('h2', { class: 'naslov-ekrana' }, 'Nova liga'),
    h('p', { class: 'obrazac-pomoc' }, 'Liga je tjedno natjecanje s ekipom: zbrajaju se bodovi iz kviza dana od ponedjeljka do nedjelje. Nakon što je napraviš, dobit ćeš pozivnicu za slanje.'),
    obrazac(h('button', { class: 'gumb gumb-glavni gumb-velik', type: 'submit' }, 'Napravi ligu'), async () => {
      try {
        const l = await api.napraviLigu(igrac!.igracId, naziv.value);
        await ekranLige(l.kod, null, null, 'Liga je napravljena. Pošalji pozivnicu ekipi.');
      } catch (e) { pokaziPoruku(greskaEl, e); }
    },
    h('label', { class: 'obrazac-oznaka', for: 'naziv-lige' }, 'Naziv lige'), naziv, greskaEl),
  ));
  naziv.focus();
}

function blokPozivnice(kod: string, naziv: string): HTMLElement {
  const link = linkPozivnice(kod);
  const polje = h('input', { class: 'upis upis-malen pozivnica-link', type: 'text', readonly: true, value: link, 'aria-label': 'Link pozivnice' });
  const stanje = h('span', { class: 'pozivnica-stanje', role: 'status' });
  const kopiraj = h('button', {
    class: 'gumb gumb-glavni', type: 'button',
    onclick: async () => {
      try {
        await navigator.clipboard.writeText(link);
        stanje.textContent = 'Kopirano.';
      } catch {
        polje.select();
        stanje.textContent = 'Označeno: kopiraj ručno.';
      }
    },
  }, 'Kopiraj pozivnicu');
  const podijeli = typeof navigator.share === 'function'
    ? h('button', {
      class: 'gumb gumb-sporedni', type: 'button',
      onclick: () => navigator.share({ title: 'Guglaj ako smiješ', text: `Pridruži se mojoj ligi „${naziv}” u kvizu Guglaj ako smiješ:`, url: link }).catch(() => {}),
    }, 'Podijeli')
    : null;
  return h('section', { class: 'pozivnica' },
    h('h3', { class: 'naslov-pododjeljka' }, 'Pozivnica'),
    h('p', { class: 'obrazac-pomoc' }, 'Tko otvori ovaj link i upiše nadimak, postaje član lige.'),
    polje,
    h('div', { class: 'pozivnica-gumbi' }, kopiraj, podijeli, stanje));
}

function blokUredivanja(l: Liga, tjedan: string | null, kat: KategorijaId | null): HTMLElement {
  const naziv = h('input', { class: 'upis', id: 'novi-naziv', type: 'text', maxlength: '30', value: l.naziv });
  const greskaEl = poruka();
  const clanovi = l.redovi.filter((r) => !r.osnivac).sort((a, b) => a.nadimak.localeCompare(b.nadimak, 'hr'));
  return h('details', { class: 'uredi-ligu' },
    h('summary', {}, 'Uredi ligu'),
    obrazac(h('button', { class: 'gumb gumb-sporedni', type: 'submit' }, 'Spremi naziv'), async () => {
      try {
        await api.preimenujLigu(igrac!.igracId, l.kod, naziv.value);
        await ekranLige(l.kod, tjedan, kat, 'Naziv lige je promijenjen.');
      } catch (e) { pokaziPoruku(greskaEl, e); }
    },
    h('label', { class: 'obrazac-oznaka', for: 'novi-naziv' }, 'Naziv lige'), naziv, greskaEl),
    h('h4', { class: 'obrazac-oznaka' }, 'Članovi'),
    clanovi.length === 0
      ? h('p', { class: 'obrazac-pomoc' }, 'U ligi još nema drugih članova.')
      : h('ul', { class: 'clanovi' }, ...clanovi.map((c) => {
        // Uklanjanje u dva koraka, bez prozora za potvrdu.
        const b = h('button', { class: 'gumb gumb-sporedni gumb-mali', type: 'button' }, 'Ukloni');
        let potvrda = false;
        b.addEventListener('click', async () => {
          if (!potvrda) { potvrda = true; b.textContent = 'Sigurno ukloniti?'; b.classList.add('gumb-opasno'); return; }
          b.disabled = true;
          try {
            await api.ukloniClana(igrac!.igracId, l.kod, c.nadimak);
            await ekranLige(l.kod, tjedan, kat, `${c.nadimak} više nije član lige.`);
          } catch (e) { pokaziPoruku(greskaEl, e); b.disabled = false; }
        });
        return h('li', {}, h('span', {}, c.nadimak), b);
      })),
    h('p', { class: 'obrazac-pomoc' }, 'Uklonjeni član ne može se vratiti istom pozivnicom.'),
  );
}

async function ekranLige(kod: string, tjedan: string | null = null, kat: KategorijaId | null = null, obavijest?: string) {
  ugasiScenu();
  let l: Liga;
  try {
    l = await api.liga(igrac!.igracId, kod, tjedan, kat);
  } catch (e) {
    await pocetni(e instanceof Error ? e.message : String(e));
    return;
  }
  if (kat) document.body.style.setProperty('--kat', KATEGORIJE[kat].boja);
  else document.body.style.removeProperty('--kat');

  const kategorije = h('div', { class: 'rang-kategorije', role: 'group', 'aria-label': 'Kategorija' },
    h('button', { type: 'button', class: 'rang-kat rang-kat-sve', 'aria-pressed': String(kat === null), onclick: () => ekranLige(kod, tjedan, null) }, 'Sve'),
    ...Object.values(KATEGORIJE).map((k) => {
      const b = h('button', {
        type: 'button', class: 'rang-kat', 'aria-pressed': String(k.id === kat), title: k.naziv, 'aria-label': k.naziv,
        html: ikonaSvg(k.id), onclick: () => ekranLige(kod, tjedan, k.id),
      });
      b.style.setProperty('--kat', k.boja);
      return b;
    }));

  const naslovTjedna = `${l.ovajTjedan ? 'Ovaj tjedan' : 'Tjedan'}: ${datum(l.tjedanOd)} do ${datum(l.tjedanDo)}`;
  const dvorana = l.pobjednici.length === 0
    ? h('p', { class: 'obrazac-pomoc' }, 'Pobjednici se upisuju kad završi prvi tjedan lige, u nedjelju u ponoć.')
    : h('ol', { class: 'dvorana' }, ...l.pobjednici.map((p) =>
      h('li', {}, h('button', {
        type: 'button', class: `dvorana-tjedan${p.od === l.tjedanOd ? ' dvorana-odabran' : ''}`,
        'aria-label': `Poredak za tjedan ${datum(p.od)} do ${datum(p.do)}`, onclick: () => ekranLige(kod, p.od, kat),
      },
      h('span', { class: 'dvorana-datum' }, `${datum(p.od)} do ${datum(p.do)}`),
      h('span', { class: 'dvorana-ime' }, p.nadimci.join(', ')),
      h('span', { class: 'dvorana-bodovi' }, String(p.bodovi))))));

  ocisti(app);
  app.append(h('main', { class: 'rang liga' },
    h('div', { class: 'pocetna-vrh pocetna-vrh-igrac' },
      h('button', { class: 'gumb gumb-sporedni gumb-mali', type: 'button', onclick: () => pocetni() }, 'Natrag'), gumbZvuka()),
    h('h2', { class: 'naslov-ekrana' }, l.naziv),
    h('p', { class: 'napomena liga-podaci' }, `Osnivač: ${l.nazivOsnivaca}. Članova: ${l.redovi.length}.`),
    obavijest ? h('p', { class: 'obavijest', role: 'status' }, obavijest) : null,
    h('h3', { class: 'naslov-pododjeljka' }, naslovTjedna),
    !l.ovajTjedan
      ? h('button', { class: 'gumb gumb-sporedni gumb-mali', type: 'button', onclick: () => ekranLige(kod, null, kat) }, 'Prikaži ovaj tjedan')
      : null,
    kategorije,
    h('p', { class: 'rang-opis' }, `${kat ? KATEGORIJE[kat].naziv : 'Sve kategorije'}: zbroj kvizova dana u tjednu`),
    h('ol', { class: 'rang-popis' }, ...l.redovi.map((r) => redListe(r))),
    h('button', {
      class: 'gumb gumb-glavni', type: 'button',
      onclick: () => ekranOdgovora(kod, l.naziv, l.ovajTjedan ? danasIso() : l.tjedanDo, l.tjedanOd),
    }, 'Usporedi odgovore'),
    h('h3', { class: 'naslov-pododjeljka' }, 'Dvorana slavnih'),
    dvorana,
    blokPozivnice(l.kod, l.naziv),
    l.osnivac ? blokUredivanja(l, tjedan, kat) : null,
  ));
  window.scrollTo(0, 0);
}

// ---------- Usporedba odgovora u ligi ----------

const DANI_KRATKO = ['Pon', 'Uto', 'Sri', 'Čet', 'Pet', 'Sub', 'Ned'];

/** Današnji dan po Europe/Sarajevo, kao i na serveru (YYYY-MM-DD). */
function danasIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Sarajevo' }).format(new Date());
}
function dodajDane(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function karticaPitanja(p: PitanjeUsporedbe, ukupno: number): HTMLElement {
  const k = KATEGORIJE[p.kategorija];
  const kartica = h('li', { class: 'usp-pitanje' },
    h('div', { class: 'usp-zaglavlje' },
      h('span', { class: 'usp-kat', html: ikonaSvg(p.kategorija) }),
      h('span', {}, `${p.redni}/${ukupno} · ${k.naziv}`)),
    h('p', { class: 'usp-tekst' }, p.tekst),
    h('p', { class: 'usp-tocno' }, h('span', {}, 'Točno: '), p.tocno),
    p.odgovori.length === 0
      ? h('p', { class: 'obrazac-pomoc' }, 'Nitko još nije odgovorio.')
      : h('ul', { class: 'usp-odgovori' }, ...p.odgovori.map((o) =>
        h('li', { class: `usp-odgovor ${o.tocno ? 'usp-da' : o.bodovi > 0 ? 'usp-djelom' : 'usp-ne'}${o.ja ? ' usp-ja' : ''}` },
          h('span', { class: 'usp-znak', 'aria-label': o.tocno ? 'točno' : 'netočno' }, o.tocno ? '✓' : o.bodovi > 0 ? '½' : '✗'),
          h('span', { class: 'usp-tko' },
            h('span', { class: 'usp-nadimak' }, o.nadimak),
            h('span', { class: 'usp-sto' }, o.odgovor)),
          h('span', { class: 'usp-brojke' },
            h('span', { class: 'usp-bodovi' }, String(o.bodovi)),
            h('span', { class: 'usp-sekunde' }, `${String(o.sekunde).replace('.', ',')} s`))))),
  );
  kartica.style.setProperty('--kat', k.boja);
  return kartica;
}

async function ekranOdgovora(kod: string, naziv: string, dan: string, tjedanOd: string) {
  ugasiScenu();
  document.body.style.removeProperty('--kat');
  const danas = danasIso();
  let u: UsporedbaOdgovora;
  try {
    u = await api.ligaOdgovori(igrac!.igracId, kod, dan);
  } catch (e) {
    await ekranLige(kod, null, null, e instanceof Error ? e.message : String(e));
    return;
  }

  const dani = h('div', { class: 'usp-dani', role: 'group', 'aria-label': 'Dan' },
    ...DANI_KRATKO.map((ime, i) => {
      const d = dodajDane(tjedanOd, i);
      return h('button', {
        type: 'button', class: 'rang-razdoblje', 'aria-pressed': String(d === dan), disabled: d > danas ? true : null,
        onclick: () => ekranOdgovora(kod, naziv, d, tjedanOd),
      }, h('span', {}, ime), h('small', {}, datum(d)));
    }));

  let sadrzaj: (Node | null)[];
  if (!u.otvoreno && dan === danas) {
    sadrzaj = [
      h('p', { class: 'rang-prazno' }, u.razlog === 'nije_zavrsio'
        ? 'Današnje odgovore ostalih vidiš kad završiš današnji kviz. Bez prepisivanja!'
        : 'Današnje odgovore ostalih vidiš tek kad odigraš današnji kviz. Bez prepisivanja!'),
      h('button', { class: 'gumb gumb-glavni', type: 'button', onclick: jednimKlikom(igrajDnevni) },
        u.razlog === 'nije_zavrsio' ? 'Nastavi kviz dana' : 'Igraj kviz dana'),
    ];
  } else if (!u.otvoreno) {
    sadrzaj = [h('p', { class: 'rang-prazno' }, `Tvog kviza dana za ${datum(u.dan)} nema, pa ni tuđi odgovori nisu vidljivi. Usporedba radi samo za dane koje imaš odigrane.`)];
  } else if (u.pitanja.length === 0 || u.igraci.length === 0) {
    sadrzaj = [h('p', { class: 'rang-prazno' }, 'Taj dan nitko iz lige nije igrao kviz dana.')];
  } else {
    sadrzaj = [
      h('h3', { class: 'naslov-pododjeljka' }, `Poredak dana ${datum(u.dan)}`),
      h('ol', { class: 'rang-popis' }, ...u.igraci.map((g, _i, svi) => redListe({
        mjesto: svi.findIndex((x) => x.bodovi === g.bodovi) + 1, nadimak: g.nadimak, bodovi: g.bodovi, dana: 0, ja: g.ja,
      }, `točnih ${g.tocnih} od ${u.pitanja.length}`))),
      u.nisuIgrali.length > 0 ? h('p', { class: 'napomena' }, `Nisu igrali: ${u.nisuIgrali.join(', ')}.`) : null,
      h('h3', { class: 'naslov-pododjeljka' }, 'Pitanje po pitanje'),
      h('ol', { class: 'usp-popis' }, ...u.pitanja.map((p) => karticaPitanja(p, u.pitanja.length))),
    ];
  }

  ocisti(app);
  app.append(h('main', { class: 'rang liga usp' },
    h('div', { class: 'pocetna-vrh pocetna-vrh-igrac' },
      h('button', { class: 'gumb gumb-sporedni gumb-mali', type: 'button', onclick: () => ekranLige(kod, tjedanOd) }, 'Natrag na ligu'), gumbZvuka()),
    h('h2', { class: 'naslov-ekrana' }, 'Usporedba odgovora'),
    h('p', { class: 'napomena liga-podaci' }, naziv),
    dani,
    ...sadrzaj,
  ));
  window.scrollTo(0, 0);
}

// ---------- Igra ----------

let kvizId = '';
let ukupnoPitanja = 0;
let vrsta: 'dnevni' | 'trening' | 'probni' = 'probni';
let treningKat: KategorijaId = 'povijest';
/** Gasi sat i slušače prethodnog pitanja kad se prikaže novo. */
let ugasiScenu = () => {};

/** Gumb koji pokreće učitavanje: zaključa se na prvi klik da ne bi krenulo dvaput. */
function jednimKlikom(fn: () => Promise<void> | void) {
  return (e: Event) => {
    const b = e.currentTarget as HTMLButtonElement;
    if (b.disabled) return;
    b.disabled = true;
    b.textContent = 'Učitavam…';
    void fn();
  };
}

/** Isprobavanje igre: uvijek istih 11 probnih pitanja (po jedno za svaki tip), ne ulazi nigdje u bodove. */
function gumbIsprobaj(): HTMLElement {
  return h('div', { class: 'isprobaj' },
    h('button', { class: 'gumb gumb-sporedni', type: 'button', onclick: jednimKlikom(igrajProbni) }, 'Isprobaj igru'),
    h('p', { class: 'napomena' }, '11 stalnih pitanja, po jedno za svaki tip. Ne broji se nigdje.'));
}

async function igrajProbni() {
  try {
    const k = await api.pocniKviz();
    vrsta = 'probni';
    kvizId = k.kvizId;
    ukupnoPitanja = k.brojPitanja;
    await pitanje(0);
  } catch (e) {
    greska(e);
  }
}

async function igrajDnevni() {
  try {
    const d = await api.pocniDnevni(igrac!.igracId);
    if (d.zavrsen || !d.kvizId) { kraj(d.ukupnoBodova, 'dnevni', true); return; }
    vrsta = 'dnevni';
    kvizId = d.kvizId;
    ukupnoPitanja = d.brojPitanja!;
    await pitanje(d.sljedeci ?? 0);
  } catch (e) {
    greska(e);
  }
}

async function igrajTrening(kat: KategorijaId) {
  try {
    const k = await api.pocniTrening(igrac!.igracId, kat);
    vrsta = 'trening';
    treningKat = kat;
    kvizId = k.kvizId;
    ukupnoPitanja = k.brojPitanja;
    await pitanje(0);
  } catch (e) {
    greska(e);
  }
}

async function pitanje(redni: number) {
  let p: JavnoPitanje;
  try {
    p = await api.dohvatiPitanje(kvizId, redni);
  } catch (e) {
    greska(e);
    return;
  }
  const kat = KATEGORIJE[p.kategorija];
  document.body.style.setProperty('--kat', kat.boja);
  ocisti(app);

  const broj = h('div', { class: 'odbrojavac', role: 'timer', 'aria-label': 'Preostale sekunde' });
  const fitilj = h('div', { class: 'fitilj' });
  const upozorenje = h('div', { class: 'upozorenje', role: 'alert', hidden: true },
    h('strong', { class: 'upozorenje-naslov' }, 'Varaš, a?'), ' Izlazak iz igre tijekom pitanja prepolovljuje bodove za ovo pitanje.');
  const tekst = h('p', { class: 'pitanje-tekst' }, p.tekst);
  const slika = p.slika ? h('img', { class: 'pitanje-slika', src: p.slika.src, alt: p.slika.opis, draggable: 'false' }) : null;
  const dno = h('div', { class: 'dno' });

  let napustio = false;
  let poslano = false;
  let zaustaviTajmer = () => {};

  const naVidljivost = () => {
    if (document.hidden && !poslano) napustio = true;
    if (!document.hidden && napustio) upozorenje.hidden = false;
  };
  // Gubitak fokusa: drugi prozor, druga aplikacija (blur hvata i prozor otvoren pokraj igre).
  const naGubitakFokusa = () => { if (!poslano) napustio = true; };
  const naPovratakFokusa = () => { if (napustio && !poslano) upozorenje.hidden = false; };
  document.addEventListener('visibilitychange', naVidljivost);
  window.addEventListener('blur', naGubitakFokusa);
  window.addEventListener('focus', naPovratakFokusa);

  const ugasi = () => {
    poslano = true;
    zaustaviTajmer();
    document.removeEventListener('visibilitychange', naVidljivost);
    window.removeEventListener('blur', naGubitakFokusa);
    window.removeEventListener('focus', naPovratakFokusa);
  };
  ugasiScenu();
  ugasiScenu = ugasi;

  const posalji = async (o: Odgovor) => {
    if (poslano) return; // zaštita od dvostrukog slanja
    ugasi();
    scena.classList.add('zakljucano');
    try {
      const r = await api.posaljiOdgovor(kvizId, redni, o, napustio);
      prikaziRezultat(r, ploca, dno, redni);
    } catch (e) {
      greska(e);
    }
  };

  const ploca: Ploca = nacrtajPlocu(p, { api, kvizId, posalji: (o) => void posalji(o) });

  const scena = h('main', { class: `scena tip-${p.tip}` },
    h('div', { class: 'fitilj-staza' }, fitilj),
    h('header', { class: 'traka' },
      h('div', { class: 'traka-kat', html: `${ikonaSvg(p.kategorija)}<span>${kat.naziv}</span>` }),
      h('div', { class: 'traka-desno' },
        h('span', { class: 'traka-redni' }, `${redni + 1}/${p.ukupno}`),
        gumbZvuka())),
    h('section', { class: 'pozornica', 'aria-live': 'polite' },
      broj,
      h('div', { class: 'tip-pitanja' }, NAZIV_TIPA[p.tip]),
      upozorenje,
      h('div', { class: 'pitanje' }, tekst, slika),
      ploca.el),
    dno,
  );

  // Onemogući kopiranje i označavanje teksta pitanja.
  for (const dogadjaj of ['copy', 'cut', 'contextmenu', 'dragstart']) {
    scena.addEventListener(dogadjaj, (e) => {
      if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
    });
  }

  app.append(scena);
  ploca.fokus?.();
  zaustaviTajmer = pokreniTajmer(broj, fitilj, p.vrijemeMs, () => {
    void posalji(ploca.trenutniOdgovor?.() ?? { vrsta: 'nista' });
  });
}

function prikaziRezultat(r: Rezultat, ploca: Ploca, dno: HTMLElement, redni: number) {
  ploca.oznaci?.(r);
  const djelomicno = !r.tocno && r.bodovi > 0;
  if (r.tocno) zvuk.tocno(); else zvuk.netocno();

  const naslov = r.istekloVrijeme ? 'Vrijeme je isteklo'
    : r.tocno ? 'Točno' : djelomicno ? 'Djelomično' : 'Netočno';
  const zadnje = redni + 1 >= ukupnoPitanja;
  const dalje = h('button', {
    class: 'gumb gumb-glavni', type: 'button',
    onclick: jednimKlikom(() => (zadnje ? kraj(r.ukupnoBodova, vrsta, false, r.zavrsno, r.bonus) : pitanje(redni + 1))),
  }, zadnje ? 'Pogledaj rezultat' : 'Sljedeće pitanje');

  dno.replaceChildren(
    h('section', { class: `presuda ${r.tocno ? 'je-tocno' : djelomicno ? 'je-djelomicno' : 'je-netocno'}` },
      h('div', { class: 'presuda-vrh' },
        h('h2', { class: 'presuda-naslov' }, naslov),
        h('div', { class: 'presuda-bodovi' }, `+${r.bodovi}`)),
      r.komentar ? h('p', { class: 'presuda-komentar' }, r.komentar) : null,
      r.niz > 1 ? h('p', { class: 'presuda-niz' }, `Niz točnih: ${r.niz}, bodovi ×${mnoziteljNiza(r.niz).toFixed(1).replace('.', ',')}`) : null,
      r.napustio ? h('p', { class: 'presuda-napustio' }, 'Bodovi su prepolovljeni zbog izlaska iz igre.') : null,
      h('p', { class: 'presuda-tocno' }, h('span', {}, 'Točan odgovor: '), h('strong', {}, r.prikazTocno)),
      h('p', { class: 'presuda-objasnjenje' }, r.objasnjenje),
      h('div', { class: 'presuda-dno' }, h('span', { class: 'presuda-ukupno' }, `Ukupno: ${r.ukupnoBodova}`), dalje),
    ),
  );
  dno.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'end' });
  dalje.focus({ preventScroll: true });
}

function kraj(bodovi: number, v: typeof vrsta, odranije = false, zavrsno?: string, bonus?: string) {
  ugasiScenu();
  document.body.style.removeProperty('--kat');
  if (!odranije) zvuk.kraj();
  ocisti(app);
  const opis = v === 'dnevni'
    ? (odranije ? 'bodova u današnjem kvizu. Odigran je, novi stiže u ponoć.' : 'bodova u kvizu dana. Novi stiže u ponoć.')
    : v === 'trening' ? `bodova na treningu: ${KATEGORIJE[treningKat].naziv}` : 'bodova u probnoj igri. Ovo se ne broji nigdje, prava igra je kviz dana.';
  app.append(
    h('main', { class: 'kraj' },
      h('p', { class: 'kraj-oznaka' }, v === 'dnevni' && odranije ? 'Kviz dana' : 'Konačni rezultat'),
      h('div', { class: 'kraj-bodovi' }, String(bodovi)),
      h('p', { class: 'kraj-tekst' }, opis),
      zavrsno ? h('p', { class: 'kraj-poruka' }, zavrsno) : null,
      bonus ? h('p', { class: 'kraj-bonus' }, bonus) : null,
      v === 'dnevni'
        ? h('button', { class: 'gumb gumb-glavni gumb-velik', type: 'button', onclick: jednimKlikom(() => ekranRangListe('dan')) }, 'Rang-lista dana')
        : null,
      v === 'trening'
        ? h('button', { class: 'gumb gumb-glavni gumb-velik', type: 'button', onclick: jednimKlikom(() => igrajTrening(treningKat)) }, 'Još jedan trening')
        : null,
      h('button', { class: `gumb ${v === 'probni' ? 'gumb-glavni gumb-velik' : 'gumb-sporedni'}`, type: 'button', onclick: () => pocetni() }, 'Na početak'),
    ),
  );
}

function greska(e: unknown) {
  ugasiScenu();
  ocisti(app);
  app.append(h('main', { class: 'kraj' },
    h('h2', { class: 'presuda-naslov' }, 'Nešto je pošlo krivo'),
    h('p', {}, e instanceof Error ? e.message : String(e)),
    h('button', { class: 'gumb gumb-glavni', type: 'button', onclick: () => pocetni() }, 'Na početak')));
}

async function pokreni() {
  if (import.meta.env.DEV && lokalno) {
    const [{ LokalniApi }, { PROBNA_PITANJA }] = await Promise.all([import('./api/lokalni'), import('./podaci/probna-pitanja')]);
    api = new LokalniApi(PROBNA_PITANJA);
  }
  procitajPozivnicu();
  await pocetni();
}
void pokreni();
