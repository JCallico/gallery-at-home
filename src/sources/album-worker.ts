// Background worker that reads Google Photos albums (see gphotos.ts), so
// the fetching, parsing and the memory clean-up afterwards happen off the
// TV's main thread. Built as its own file, album-worker.js.

import { readAlbum, Refused, Transport } from './gphotos-read';

declare const self: { onmessage: ((e: MessageEvent) => void) | null; postMessage(data: unknown): void };

function transport(proxy: string): Transport {
  const call = async (url: string, init?: RequestInit) => {
    let res: Response;
    try {
      res = await fetch(proxy ? proxy + encodeURIComponent(url) : url, init);
    } catch {
      // A refused cross-site request can also surface as a network error.
      throw new Refused();
    }
    if (res.status === 403) throw new Refused();
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
    return res.text();
  };
  return {
    get: (url) => call(url),
    post: (url, body) => call(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }, body }),
  };
}

self.onmessage = (e: MessageEvent) => {
  const { id, link, proxy } = e.data as { id: number; link: string; proxy: string };
  readAlbum(link, transport(proxy)).then(
    (album) => self.postMessage({ id, album }),
    (err: Error) => self.postMessage({ id, refused: err instanceof Refused, error: err.message }),
  );
};
