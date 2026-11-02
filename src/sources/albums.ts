// Keeping collections that mirror a Google Photos album up to date.

import { getCollection, getState, syncAlbumPhotos } from '../store/store';
import { GooglePhotosSource } from '../store/types';
import { albumRefs, fetchAlbum } from './gphotos';

/** How old an album read may get before it's read again. */
export const ALBUM_REFRESH_MS = 30 * 60 * 1000;

const inFlight = new Map<string, Promise<boolean>>();

/**
 * Re-reads the album behind a collection when it's stale (or always, with
 * `force`). Resolves to whether the photos changed; failures (offline, album
 * no longer shared) leave the collection as it was.
 */
export function refreshAlbum(collectionId: string, force = false): Promise<boolean> {
  const c = getCollection(collectionId);
  if (!c?.albumSourceId) return Promise.resolve(false);
  if (!force && c.syncedAt && Date.now() - c.syncedAt < ALBUM_REFRESH_MS) return Promise.resolve(false);
  const source = getState().sources.find((s) => s.id === c.albumSourceId) as GooglePhotosSource | undefined;
  if (!source) return Promise.resolve(false);
  const running = inFlight.get(collectionId);
  if (running) return running;
  const p = fetchAlbum(source.url)
    .then((album) => (album.photos.length ? syncAlbumPhotos(collectionId, albumRefs(source, album)) : false))
    .catch((err) => {
      console.warn('Album refresh failed', err);
      return false;
    })
    .finally(() => inFlight.delete(collectionId));
  inFlight.set(collectionId, p);
  return p;
}
