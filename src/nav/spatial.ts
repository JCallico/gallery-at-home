// Geometric "spatial navigation": the arrow keys move focus to the nearest
// focusable element in that direction, the way the TV's own menus behave.
//
// Focusable elements carry `data-nav`. Focus is confined to the innermost
// open `data-nav-scope` (the last one in document order), so a dialog traps
// focus until it closes. `data-nav-id` gives an element a stable identity so
// focus can be restored when returning to a screen. Inside a `data-nav-row`
// the row's ends are hard stops for Left/Right.

export type Direction = 'left' | 'right' | 'up' | 'down';

function scope(): ParentNode {
  const scopes = document.querySelectorAll('[data-nav-scope]');
  return scopes.length ? scopes[scopes.length - 1] : document;
}

function candidates(): HTMLElement[] {
  const all = Array.from(scope().querySelectorAll<HTMLElement>('[data-nav]'));
  return all.filter((el) => {
    if ((el as HTMLButtonElement).disabled) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
}

function current(): HTMLElement | null {
  const el = document.activeElement as HTMLElement | null;
  if (!el || !el.hasAttribute('data-nav')) return null;
  return scope().contains(el) ? el : null;
}

export function focusElement(el: HTMLElement | null): boolean {
  if (!el) return false;
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  return true;
}

export function focusFirst(): boolean {
  const list = candidates();
  const preferred = list.find((el) => el.hasAttribute('data-nav-autofocus'));
  return focusElement(preferred ?? list[0] ?? null);
}

export function focusById(id: string | null | undefined): boolean {
  if (!id) return false;
  const el = scope().querySelector<HTMLElement>(`[data-nav-id="${CSS.escape(id)}"]`);
  return el ? focusElement(el) : false;
}

export function currentNavId(): string | null {
  return current()?.getAttribute('data-nav-id') ?? null;
}

export function moveFocus(dir: Direction): boolean {
  const from = current();
  if (!from) return focusFirst();
  const a = from.getBoundingClientRect();
  const ax = a.left + a.width / 2;
  const ay = a.top + a.height / 2;

  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of candidates()) {
    if (el === from) continue;
    const b = el.getBoundingClientRect();
    const bx = b.left + b.width / 2;
    const by = b.top + b.height / 2;

    // Distance along the direction of travel (edge to edge) and across it.
    let along: number;
    let across: number;
    let overlap: number;
    if (dir === 'left' || dir === 'right') {
      if (dir === 'right' ? bx <= ax + 1 : bx >= ax - 1) continue;
      along = dir === 'right' ? b.left - a.right : a.left - b.right;
      overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      across = Math.abs(by - ay);
      // In a `data-nav-row` (a shelf), sideways moves stay on the row: at its
      // end Right does nothing rather than leaping to something far away.
      if (overlap <= 0 && from.closest('[data-nav-row]')) continue;
    } else {
      if (dir === 'down' ? by <= ay + 1 : by >= ay - 1) continue;
      along = dir === 'down' ? b.top - a.bottom : a.top - b.bottom;
      overlap = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      // Moving down from a wide row onto a line of buttons lands on the
      // first one (reading order), not whichever is nearest its centre.
      across = overlap > 0 ? Math.abs(b.left - a.left) : Math.abs(bx - ax);
    }
    // Elements lined up with the current one win over diagonal neighbours.
    const score = Math.max(along, 0) + (overlap > 0 ? 0 : across * 3) + across * 0.1;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  return focusElement(best);
}

/**
 * Whenever the DOM changes and nothing is focused (content finished loading,
 * the focused element was removed), focus the screen's first item, so the
 * remote never ends up pointing at nothing.
 */
export function keepFocusAlive(root: HTMLElement): void {
  let scheduled = false;
  const check = () => {
    scheduled = false;
    // Only when focus is truly gone; a text field being edited isn't a nav item.
    const active = document.activeElement;
    if (!active || active === document.body) focusFirst();
  };
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(check);
  }).observe(root, { childList: true, subtree: true });
}
