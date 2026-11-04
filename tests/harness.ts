// Runs the real app in jsdom. jsdom has no layout, image loading or canvas,
// so this supplies small stand-ins; everything else is the real code.

import { vi } from 'vitest';

export const KEY = { back: 10009, red: 403, green: 404, yellow: 405, blue: 406, up: 38, down: 40, left: 37, right: 39, play: 415 };

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 1920;
  naturalHeight = 1280;
  decoding = 'auto';
  crossOrigin: string | null = null;
  private url = '';
  get src() {
    return this.url;
  }
  set src(v: string) {
    this.url = v;
    setTimeout(() => (v.includes('broken') ? this.onerror?.() : this.onload?.()), 0);
  }
  decode() {
    return Promise.resolve();
  }
}

/** Canvas drawing is irrelevant to these tests; accept and ignore it all. */
const fakeContext = () =>
  new Proxy({} as Record<string, unknown>, {
    get: (target, name) => {
      if (name in target) return target[name as string];
      if (name === 'createLinearGradient') return () => ({ addColorStop() {} });
      return () => undefined;
    },
    set: (target, name, value) => {
      target[name as string] = value;
      return true;
    },
  });

export function stubBrowser(): void {
  vi.stubGlobal('Image', FakeImage);
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(private cb: (records: { target: Element; isIntersecting: boolean }[]) => void) {}
      observe(target: Element) {
        this.cb([{ target, isIntersecting: true }]);
      }
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('CSS', { escape: (s: string) => s.replace(/["\\]/g, '\\$&') });
  HTMLCanvasElement.prototype.getContext = (() => fakeContext()) as never;
  HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,AAAA';
  HTMLCanvasElement.prototype.toBlob = (cb: BlobCallback) => {
    cb(new Blob(['small'], { type: 'image/jpeg' }));
  };
  Element.prototype.scrollIntoView = () => undefined;
  // Everything gets a size, so focus can land on it.
  Element.prototype.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100, x: 0, y: 0, toJSON() {} }) as DOMRect;
  URL.createObjectURL = () => 'blob:test';
  URL.revokeObjectURL = () => undefined;
}

export interface AppHandle {
  close(): void;
}

/** Starts the app afresh on the given saved data (default: a first run). */
export async function startApp(saved?: unknown): Promise<AppHandle> {
  vi.resetModules();
  localStorage.clear();
  if (saved !== undefined) localStorage.setItem('gah.state.v1', JSON.stringify(saved));
  return mountApp();
}

/** Starts the app on whatever is saved, like reopening it on the TV. */
export async function mountApp(): Promise<AppHandle> {
  vi.resetModules();
  document.body.innerHTML = '<div id="stage"></div>';
  const stage = document.getElementById('stage')!;
  const { h, render } = await import('preact');
  const { App } = await import('../src/app');
  render(h(App, null), stage);
  // Let the first paint happen: effects (key handlers, dialogs) register then.
  await new Promise((resolve) => setTimeout(resolve, 120));
  return { close: () => render(null, stage) };
}

export const $ = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector);
export const $$ = <T extends Element = HTMLElement>(selector: string) => Array.from(document.querySelectorAll<T>(selector));
export const nav = (id: string) => `[data-nav-id="${id}"]`;
export const text = (selector: string) => $(selector)?.textContent ?? '';

/** Waits for an element to appear, as the UI updates asynchronously. */
export async function find<T extends Element = HTMLElement>(selector: string): Promise<T> {
  return vi.waitFor(() => {
    const el = $<T>(selector);
    if (!el) throw new Error(`Nothing matches ${selector}`);
    return el;
  });
}

export async function click(selector: string): Promise<void> {
  (await find(selector)).click();
}

/** Clicks the visible item (row or button) with this text. */
export async function clickText(label: string, within = 'body'): Promise<void> {
  const el = await vi.waitFor(() => {
    const match = $$(`${within} [data-nav], ${within} button`).find((e) => e.textContent?.includes(label));
    if (!match) throw new Error(`Nothing says "${label}"`);
    return match;
  });
  el.click();
}

export async function type(selector: string, value: string): Promise<void> {
  const input = await find<HTMLInputElement>(selector);
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/** A remote-control key press, sent to whatever has focus. */
export function press(keyCode: number): void {
  (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent('keydown', { keyCode, bubbles: true, cancelable: true }));
}

export const saved = () => JSON.parse(localStorage.getItem('gah.state.v1')!);

/** Google Photos album page and paging reply, in the shape Google serves. */
export const albumPhoto = (id: string, extras: Record<string, unknown> = { 15: 1 }) => [
  id,
  [`https://lh3.googleusercontent.com/pw/${id}`, 4000, 3000],
  1757144641342,
  'h',
  0,
  0,
  [],
  [],
  2,
  extras,
];

export function albumPage(title: string, items: unknown[], token = ''): string {
  const meta: unknown[] = new Array(22).fill(null);
  meta[0] = 'ALBUM';
  meta[1] = title;
  meta[21] = items.length;
  return `<link rel="canonical" href="https://photos.google.com/share/ALBUM?key=K"><script>AF_initDataCallback({key: 'ds:1', hash: '2', data:${JSON.stringify([null, items, token, meta])}, sideChannel: {}});</script>`;
}
