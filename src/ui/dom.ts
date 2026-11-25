type Dijete = Node | string | number | null | undefined | false;

/** Mali pomoćnik za stvaranje elemenata: h('button', { class: 'x', onclick: fn }, 'Tekst'). */
export function h<K extends keyof HTMLElementTagNameMap>(
  oznaka: K,
  atributi: Record<string, unknown> = {},
  ...djeca: Dijete[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(oznaka);
  for (const [k, v] of Object.entries(atributi)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2), v as EventListener);
    } else if (k === 'class') {
      el.className = String(v);
    } else if (k === 'html') {
      el.innerHTML = String(v);
    } else if (k === 'style' && typeof v === 'object') {
      Object.assign(el.style, v);
    } else {
      el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const d of djeca) {
    if (d === null || d === undefined || d === false) continue;
    el.append(d instanceof Node ? d : String(d));
  }
  return el;
}

export function ocisti(el: Element): void {
  el.replaceChildren();
}
