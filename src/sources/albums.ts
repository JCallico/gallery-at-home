// Keeping collections that mirror a Google Photos album up to date, in the
// background: a refresh never holds up opening or playing a collection.

import { getCollection, getState, syncAlbumPhotos } from '../store/store';
import { GooglePhotosSource } from '../store/types';
import { albumRefs, fetchAlbum } from './gphotos';

/** How old an album read may get before it's read again. */
export const ALBUM_REFRESH_MS = 30 * 60 * 1000;
/** Give the screen time to draw before the refresh's work starts. */
const START_DELAY_MS = 3000;

// When each album was last read, kept apart from the collections so an
// unchanged album costs no save of the (large) collection data.
const READS_KEY = 'gah.albumReads.v1';
const reads: Record<string, number> = (() => {
  try {
    return JSON.parse(localStorage.getItem(READS_KEY) ?? '{}');
  } catch {
    return {};
  }
})();

function markRead(collectionId: string): void {
  reads[collectionId] = Date.now();
  try {
    localStorage.setItem(READS_KEY, JSON.stringify(reads));
  } catch {
    // Only costs an earlier re-read.
  }
}

function lastRead(collectionId: string): number {
  return reads[collectionId] ?? getCollection(collectionId)?.syncedAt ?? 0;
}

const inFlight = new Map<string, Promise<boolean>>();

/**
 * Re-reads the album behind a collection when it's stale (or always, with
 * `force`), after a short delay. Resolves to whether the photos changed;
 * failures (offline, album no longer shared) leave the collection as it was.
 */
export function refreshAlbum(collectionId: string, force = false): Promise<boolean> {
  if (!__GOOGLE_PHOTOS__) return Promise.resolve(false);
  const c = getCollection(collectionId);
  if (!c?.albumSourceId) return Promise.resolve(false);
  if (!force && Date.now() - lastRead(collectionId) < ALBUM_REFRESH_MS) return Promise.resolve(false);
  const source = getState().sources.find((s) => s.id === c.albumSourceId) as GooglePhotosSource | undefined;
  if (!source) return Promise.resolve(false);
  const running = inFlight.get(collectionId);
  if (running) return running;
  const p = new Promise<void>((r) => setTimeout(r, START_DELAY_MS))
    .then(() => fetchAlbum(source.url))
    .then((album) => {
      markRead(collectionId);
      return album.photos.length ? syncAlbumPhotos(collectionId, albumRefs(source, album)) : false;
    })
    .catch((err) => {
      console.warn('Album refresh failed', err);
      return false;
    })
    .finally(() => inFlight.delete(collectionId));
  inFlight.set(collectionId, p);
  return p;
}
