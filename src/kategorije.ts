import type { KategorijaId } from './tipovi';

export interface Kategorija {
  id: KategorijaId;
  naziv: string;
  boja: string;
  /** SVG sadržaj (viewBox 0 0 24 24, linije u boji teksta). */
  ikona: string;
}

export const KATEGORIJE: Record<KategorijaId, Kategorija> = {
  povijest: {
    id: 'povijest', naziv: 'Povijest', boja: '#E8B04B',
    ikona: '<path d="M4 21h16M5 18h14M7 18V9M10.3 18V9M13.7 18V9M17 18V9M3.5 9h17L12 3.5z"/>',
  },
  zemljopis: {
    id: 'zemljopis', naziv: 'Zemljopis', boja: '#3FC8B8',
    ikona: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3.2 3.6 3.2 14.4 0 18M12 3c-3.2 3.6-3.2 14.4 0 18"/>',
  },
  biologija: {
    id: 'biologija', naziv: 'Biologija i prehrana', boja: '#7BD36B',
    ikona: '<path d="M12 7.5c-2-2-7-1.5-7 4 0 5 3.5 10 7 8.5 3.5 1.5 7-3.5 7-8.5 0-5.5-5-6-7-4zM12 7.5c0-2 1-4 3-4.5"/>',
  },
  umjetnost: {
    id: 'umjetnost', naziv: 'Umjetnost', boja: '#FF6FA8',
    ikona: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 16l5-5 4 4 3-3 6 6"/><circle cx="16" cy="8.5" r="1.5"/>',
  },
  knjizevnost: {
    id: 'knjizevnost', naziv: 'Književnost', boja: '#A592FF',
    ikona: '<path d="M3 5c3-1 6-1 9 1v14c-3-2-6-2-9-1zM21 5c-3-1-6-1-9 1v14c3-2 6-2 9-1z"/>',
  },
  glazba: {
    id: 'glazba', naziv: 'Glazba', boja: '#FF8A3D',
    ikona: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  },
  sport: {
    id: 'sport', naziv: 'Sport', boja: '#4DA3FF',
    ikona: '<circle cx="12" cy="12" r="9"/><path d="M12 8l3.5 2.5-1.3 4H9.8l-1.3-4zM12 8V3.2M15.5 10.5l4.6-1.6M14.2 14.5l2.8 3.9M9.8 14.5L7 18.4M8.5 10.5L3.9 8.9"/>',
  },
  video_igre: {
    id: 'video_igre', naziv: 'Video-igre', boja: '#E3DD4A',
    ikona: '<path d="M6.5 8h11a4.5 4.5 0 0 1 4.5 4.5v.5a3.5 3.5 0 0 1-6.3 2.1L14.5 14h-5l-1.2 1.1A3.5 3.5 0 0 1 2 13v-.5A4.5 4.5 0 0 1 6.5 8zM7 10.5v3.5M5.25 12.25h3.5"/><circle cx="16" cy="11.2" r=".9"/><circle cx="18.2" cy="13.2" r=".9"/>',
  },
  znacenje_rijeci: {
    id: 'znacenje_rijeci', naziv: 'Značenje riječi', boja: '#FFC59A',
    ikona: '<path d="M4 4.5h16v11H9.5L4 20zM10 8.5a2 2 0 1 1 3 1.7c-.7.4-1 .8-1 1.6M12 13.3v.2"/>',
  },
};

export function ikonaSvg(id: KategorijaId, klasa = 'ikona'): string {
  return `<svg class="${klasa}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${KATEGORIJE[id].ikona}</svg>`;
}

export const NAZIV_TIPA: Record<string, string> = {
  odabir: 'Pitanje',
  stih: 'Nastavi stih',
  djelo: 'Prepoznaj djelo',
  odlomak: 'Odlomak',
  opis: 'Opis trenutka',
  anagram: 'Anagram',
  asocijacije: 'Asocijacije',
  poredaj: 'Poredaj',
  tragovi: 'Pogodi po tragovima',
  tocno_netocno: 'Točno ili netočno',
  znacenje: 'Značenje riječi',
};
