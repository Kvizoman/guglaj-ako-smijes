import type { Api } from '../api/tip';
import type { JavnoPitanje, Odgovor, Rezultat } from '../tipovi';
import { h } from './dom';
import { zvuk } from '../zvuk';

export interface Kontekst {
  api: Api;
  kvizId: string;
  posalji(o: Odgovor): void;
}

export interface Ploca {
  el: HTMLElement;
  /** Nakon odgovora: označi točno/netočno. */
  oznaci?(r: Rezultat): void;
  /** Što poslati ako vrijeme istekne (npr. upisano, a nepotvrđeno). */
  trenutniOdgovor?(): Odgovor;
  fokus?(): void;
}

const SLOVA = ['A', 'B', 'C', 'D', 'E', 'F'];

function protresi(el: HTMLElement) {
  el.classList.remove('tresi');
  void el.offsetWidth; // ponovno pokreni animaciju
  el.classList.add('tresi');
}

/** Ponuđeni odgovori kao široke ploče. */
function odabir(p: JavnoPitanje, ctx: Kontekst): Ploca {
  let odabrano = -1;
  const gumbi = (p.ponudeno ?? []).map((tekst, i) =>
    h('button', {
      class: 'odgovor',
      type: 'button',
      onclick: () => { odabrano = i; gumbi[i].classList.add('odabran'); ctx.posalji({ vrsta: 'indeks', indeks: i }); },
    }, h('span', { class: 'odgovor-slovo', 'aria-hidden': 'true' }, SLOVA[i]), h('span', { class: 'odgovor-tekst' }, tekst)),
  );
  return {
    el: h('div', { class: 'odgovori' }, ...gumbi),
    oznaci(r) {
      gumbi.forEach((g) => (g.disabled = true));
      if (r.tocanIndeks !== undefined) gumbi[r.tocanIndeks]?.classList.add('tocan');
      if (odabrano >= 0 && odabrano !== r.tocanIndeks) gumbi[odabrano].classList.add('krivo');
    },
    fokus: () => gumbi[0]?.focus({ preventScroll: true }),
  };
}

/** Polje za upis + gumb. */
function upis(ctx: Kontekst, oznaka: string, ...prije: HTMLElement[]): Ploca & { input: HTMLInputElement } {
  const input = h('input', {
    class: 'upis', type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
    enterkeyhint: 'send', 'aria-label': oznaka, placeholder: oznaka,
  });
  const gumb = h('button', { class: 'gumb gumb-glavni', type: 'submit' }, 'Odgovori');
  const forma = h('form', {
    class: 'upis-forma',
    onsubmit: (e: Event) => {
      e.preventDefault();
      if (!input.value.trim()) { protresi(input); return; }
      ctx.posalji({ vrsta: 'tekst', tekst: input.value });
    },
  }, input, gumb);
  return {
    input,
    el: h('div', { class: 'upis-blok' }, ...prije, forma),
    oznaci(r) {
      input.disabled = true;
      gumb.disabled = true;
      input.classList.add(r.tocno ? 'tocan' : 'krivo');
    },
    trenutniOdgovor: () => (input.value.trim() ? { vrsta: 'tekst', tekst: input.value } : { vrsta: 'nista' }),
    fokus: () => input.focus({ preventScroll: true }),
  };
}

function anagram(p: JavnoPitanje, ctx: Kontekst): Ploca {
  const plocice = h('div', { class: 'plocice', 'aria-label': `Slova: ${p.slova}` },
    ...(p.slova ?? '').split('').map((s) => h('span', { class: 'plocica' }, s)));
  return upis(ctx, 'Upiši pojam', plocice);
}

function tragovi(p: JavnoPitanje, ctx: Kontekst): Ploca {
  const ukupno = p.brojTragova ?? 1;
  let otkriveno = 1;
  const popis = h('ol', { class: 'tragovi' }, h('li', {}, p.prviTrag ?? ''));
  const stanje = h('span', { class: 'tragovi-stanje' }, `Trag 1 od ${ukupno}`);
  const gumb = h('button', {
    class: 'gumb gumb-sporedni', type: 'button',
    onclick: async () => {
      gumb.disabled = true;
      try {
        const t = await ctx.api.otkrijTrag(ctx.kvizId, p.redni);
        otkriveno++;
        popis.append(h('li', { class: 'novi' }, t));
        stanje.textContent = `Trag ${otkriveno} od ${ukupno}`;
        zvuk.klik();
      } finally {
        gumb.disabled = otkriveno >= ukupno;
      }
    },
  }, 'Otkrij sljedeći trag');
  gumb.disabled = ukupno <= 1;
  const u = upis(ctx, 'Upiši odgovor', popis, h('div', { class: 'tragovi-traka' }, stanje, gumb));
  const oznaci = u.oznaci!;
  return { ...u, oznaci: (r) => { gumb.disabled = true; oznaci(r); } };
}

function tocnoNetocno(p: JavnoPitanje, ctx: Kontekst): Ploca {
  const tvrdnje = p.tvrdnje ?? [];
  const odgovori: (boolean | null)[] = tvrdnje.map(() => null);
  let i = 0;
  const brojac = h('div', { class: 'tn-brojac' });
  const tekst = h('p', { class: 'tn-tvrdnja' });
  const izbor = (v: boolean) => {
    if (i >= tvrdnje.length) return;
    odgovori[i] = v;
    zvuk.klik();
    i++;
    if (i < tvrdnje.length) prikazi();
    else ctx.posalji({ vrsta: 'tvrdnje', odgovori });
  };
  const gT = h('button', { class: 'gumb tn-gumb tn-da', type: 'button', onclick: () => izbor(true) }, 'Točno');
  const gN = h('button', { class: 'gumb tn-gumb tn-ne', type: 'button', onclick: () => izbor(false) }, 'Netočno');
  const prikazi = () => {
    brojac.textContent = `Tvrdnja ${i + 1} od ${tvrdnje.length}`;
    tekst.textContent = tvrdnje[i];
  };
  prikazi();
  const el = h('div', { class: 'tn' }, brojac, tekst, h('div', { class: 'tn-gumbi' }, gT, gN));
  return {
    el,
    trenutniOdgovor: () => ({ vrsta: 'tvrdnje', odgovori }),
    oznaci(r) {
      const tocni = r.tvrdnjeTocno ?? [];
      el.replaceChildren(h('ul', { class: 'tn-pregled' }, ...tvrdnje.map((t, k) => {
        const pogodak = odgovori[k] === tocni[k];
        return h('li', { class: pogodak ? 'tocan' : 'krivo' },
          h('span', { class: 'tn-oznaka' }, tocni[k] ? 'Točno' : 'Netočno'),
          h('span', {}, t),
          h('span', { class: 'tn-tvoj' }, odgovori[k] === null ? 'bez odgovora' : pogodak ? 'pogođeno' : 'promašeno'));
      })));
    },
    fokus: () => gT.focus({ preventScroll: true }),
  };
}

function poredaj(p: JavnoPitanje, ctx: Kontekst): Ploca {
  const stavke = p.stavke ?? [];
  const red = stavke.map((_, i) => i);
  const lista = h('ol', { class: 'poredaj' });
  const pomakni = (poz: number, smjer: -1 | 1) => {
    const novi = poz + smjer;
    if (novi < 0 || novi >= red.length) return;
    [red[poz], red[novi]] = [red[novi], red[poz]];
    zvuk.klik();
    nacrtaj(novi, smjer);
  };
  const nacrtaj = (fokusPoz = -1, smjer = 0) => {
    lista.replaceChildren(...red.map((idx, poz) => {
      const gore = h('button', { class: 'strelica', type: 'button', 'aria-label': `Pomakni gore: ${stavke[idx]}`, disabled: poz === 0, onclick: () => pomakni(poz, -1) }, '▲');
      const dolje = h('button', { class: 'strelica', type: 'button', 'aria-label': `Pomakni dolje: ${stavke[idx]}`, disabled: poz === red.length - 1, onclick: () => pomakni(poz, 1) }, '▼');
      const li = h('li', { class: poz === fokusPoz ? 'pomaknut' : '' }, h('span', { class: 'poredaj-tekst' }, stavke[idx]), h('span', { class: 'strelice' }, gore, dolje));
      if (poz === fokusPoz) queueMicrotask(() => (smjer < 0 ? (gore.disabled ? dolje : gore) : (dolje.disabled ? gore : dolje)).focus({ preventScroll: true }));
      return li;
    }));
  };
  nacrtaj();
  const potvrdi = h('button', { class: 'gumb gumb-glavni', type: 'button', onclick: () => ctx.posalji({ vrsta: 'redoslijed', redoslijed: [...red] }) }, 'Potvrdi redoslijed');
  const el = h('div', { class: 'poredaj-blok' }, p.uputa ? h('p', { class: 'uputa' }, `Poredaj ${p.uputa}.`) : null, lista, potvrdi);
  return {
    el,
    trenutniOdgovor: () => ({ vrsta: 'redoslijed', redoslijed: [...red] }),
    oznaci(r) {
      const tocno = r.tocanRedoslijed ?? [];
      potvrdi.remove();
      lista.replaceChildren(...red.map((idx, poz) =>
        h('li', { class: stavke[idx] === tocno[poz] ? 'tocan' : 'krivo' },
          h('span', { class: 'poredaj-tekst' }, stavke[idx]),
          stavke[idx] === tocno[poz] ? null : h('span', { class: 'poredaj-treba' }, `${tocno.indexOf(stavke[idx]) + 1}. mjesto`))));
    },
  };
}

function asocijacije(p: JavnoPitanje, ctx: Kontekst): Ploca {
  const brojKolona = p.brojKolona ?? 4;
  const kolone = Array.from({ length: brojKolona }, (_, k) => {
    const slovo = SLOVA[k];
    const polja = Array.from({ length: 4 }, (_, i) => {
      const b: HTMLButtonElement = h('button', {
        class: 'polje', type: 'button',
        onclick: async () => {
          if (b.classList.contains('otvoreno')) return;
          b.disabled = true;
          try {
            b.textContent = await ctx.api.otvoriPolje(ctx.kvizId, p.redni, k, i);
            b.classList.add('otvoreno');
            zvuk.klik();
          } catch { b.disabled = false; }
        },
      }, `${slovo}${i + 1}`);
      return b;
    });
    const input = h('input', { class: 'upis upis-malen', type: 'text', autocomplete: 'off', spellcheck: 'false', placeholder: `Rješenje ${slovo}`, 'aria-label': `Rješenje kolone ${slovo}`, enterkeyhint: 'send' });
    const forma = h('form', {
      class: 'kolona-forma',
      onsubmit: async (e: Event) => {
        e.preventDefault();
        if (!input.value.trim()) { protresi(input); return; }
        const r = await ctx.api.rijesiKolonu(ctx.kvizId, p.redni, k, input.value);
        if (r.tocno) {
          zvuk.tocno();
          polja.forEach((b, i) => { b.textContent = r.polja?.[i] ?? b.textContent; b.classList.add('otvoreno'); b.disabled = true; });
          input.value = r.rjesenje ?? input.value;
          input.disabled = true;
          kol.classList.add('rijesena');
        } else {
          zvuk.netocno();
          protresi(input);
          input.select();
        }
      },
    }, input);
    const kol = h('div', { class: 'kolona' }, ...polja, forma);
    return { kol, polja, input };
  });
  const u = upis(ctx, 'Konačno rješenje', h('div', { class: 'asoc-mreza' }, ...kolone.map((k) => k.kol)));
  const oznaciKonacno = u.oznaci!;
  return {
    ...u,
    fokus: undefined,
    oznaci(r) {
      r.koloneRjesenja?.forEach((rj, k) => {
        const kol = kolone[k];
        if (!kol) return;
        kol.polja.forEach((b, i) => { b.textContent = rj.polja[i]; b.classList.add('otvoreno'); b.disabled = true; });
        kol.input.value = rj.rjesenje;
        kol.input.disabled = true;
      });
      oznaciKonacno(r);
    },
  };
}

export function nacrtajPlocu(p: JavnoPitanje, ctx: Kontekst): Ploca {
  switch (p.tip) {
    case 'anagram': return anagram(p, ctx);
    case 'tragovi': return tragovi(p, ctx);
    case 'tocno_netocno': return tocnoNetocno(p, ctx);
    case 'poredaj': return poredaj(p, ctx);
    case 'asocijacije': return asocijacije(p, ctx);
    default: return p.nacin === 'odabir' ? odabir(p, ctx) : upis(ctx, 'Upiši odgovor');
  }
}
