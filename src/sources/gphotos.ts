// Google Photos shared albums as a photo source. Reading an album (fetching
// megabytes of page and parsing it) runs in a background worker, so the
// TV's screen never freezes for it, not even for the memory clean-up that
// follows. On newer TVs Google refuses the worker's requests; then the
// album page comes through Tizen's download manager instead (first 300
// items only). See gphotos-read.ts for how albums are read.

import { GooglePhotosSource, PhotoRef } from '../store/types';
import { canDownload, fetchText, isRefused } from './fetch-text';
import { Album, readAlbum, Refused, Transport } from './gphotos-read';
import { request } from './net';
import { Listing, SourceAdapter } from './types';

export type { Album } from './gphotos-read';
export { normalizeLink, SHORT_LINK_PREFIX } from './gphotos-read';

let worker: Worker | null = null;
let workerBroken = false;
let seq = 0;
const pending = new Map<number, { resolve: (a: Album) => void; reject: (e: Error) => void }>();

function getWorker(): Worker | null {
  if (worker || workerBroken || typeof Worker === 'undefined') return worker;
  try {
    worker = new Worker('album-worker.js');
    worker.onmessage = (e: MessageEvent) => {
      const { id, album, error, refused } = e.data;
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      if (album) p.resolve(album);
      else p.reject(refused ? new Refused() : new Error(error));
    };
    worker.onerror = () => {
      // The worker itself failed to load or crashed: read on the main thread.
      workerBroken = true;
      worker = null;
      pending.forEach((p) => p.reject(new Refused()));
      pending.clear();
    };
  } catch {
    workerBroken = true;
  }
  return worker;
}

function readInWorker(link: string): Promise<Album> {
  const w = getWorker();
  if (!w) return Promise.reject(new Refused());
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, link, proxy: __DEV__ ? `${location.origin}/__dev/proxy?url=` : '' });
  });
}

/** Main-thread reading: the page through the download manager when the engine is refused. */
const mainThread: Transport = {
  get: (url) => fetchText(url),
  post: async (url, body) => {
    try {
      const res = await request(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }, body });
      return await res.text();
    } catch (err) {
      if (isRefused(err) && canDownload()) throw new Refused();
      throw err;
    }
  },
};

/** Reads a shared album: in the background worker, else on the main thread. */
export async function fetchAlbum(link: string): Promise<Album> {
  try {
    return await readInWorker(link);
  } catch (err) {
    if (!(err instanceof Refused)) throw err;
    return readAlbum(link, mainThread);
  }
}

/** Collection entries for an album's photos; ids are stable across re-reads. */
export function albumRefs(source: GooglePhotosSource, album: Album): PhotoRef[] {
  return album.photos.map((p, i) => ({
    id: `${source.id}|${p.mediaId}`,
    sourceId: source.id,
    key: p.url,
    name: `Photo ${i + 1}`,
    takenAt: p.takenAt,
    width: p.width,
    height: p.height,
  }));
}

/** Google serves any size from the base URL; these fit the TV's screen and its grids. */
const sized = (url: string, w: number, h: number) => `${url}=w${w}-h${h}`;

export function gphotosAdapter(source: GooglePhotosSource): SourceAdapter {
  return {
    source,
    async list(): Promise<Listing> {
      const album = await fetchAlbum(source.url);
      return {
        key: null,
        title: album.title,
        entries: albumRefs(source, album).map((ref) => ({ type: 'photo' as const, ref })),
      };
    },
    // Already upright (Google applies the rotation), with the date known:
    // no EXIF to read.
    thumbUrl: (ref) => Promise.resolve(sized(ref.key, 480, 480)),
    imageUrl: (ref) => Promise.resolve(sized(ref.key, 1920, 1440)),
  };
}
