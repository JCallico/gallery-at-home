import { useEffect, useState } from 'preact/hooks';
import { sampleCollections } from '../samples';
import {
  AppSettings, Collection, ConfiguredSource, DEFAULT_PLAY, NowShowing, PhotoRef, PlaySettings,
} from './types';

// All app state lives in localStorage on the TV, which the Tizen web runtime
// keeps per application across reboots and app updates.

const STORAGE_KEY = 'gah.state.v1';

interface State {
  collections: Collection[];
  sources: ConfiguredSource[];
  settings: AppSettings;
  nowShowing: NowShowing | null;
  /** The included collections were added once; deleting them sticks. */
  samplesAdded: boolean;
}

function initialState(): State {
  return {
    collections: [],
    sources: [],
    settings: { defaultPlay: { ...DEFAULT_PLAY }, idleMin: 5 },
    nowShowing: null,
    samplesAdded: false,
  };
}

/** Adds the included collections the first time the app runs. */
let seeded = false;
function withSamples(s: State): State {
  if (s.samplesAdded) return s;
  seeded = true;
  const have = new Set(s.collections.map((c) => c.id));
  return { ...s, collections: [...s.collections, ...sampleCollections().filter((c) => !have.has(c.id))], samplesAdded: true };
}

/**
 * Play settings from an older save: new options get their defaults, and the
 * retired Ambient look becomes what it showed, a framed Slideshow with the
 * clock on.
 */
function upgradePlay(play: Partial<PlaySettings> | undefined): PlaySettings {
  const p = { ...DEFAULT_PLAY, ...play } as PlaySettings;
  if ((p.mode as string) === 'ambient') {
    p.mode = 'slideshow';
    if (p.frame === 'none') p.frame = 'gallery';
    p.showClock = true;
  }
  return p;
}

function load(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return withSamples(initialState());
    const saved = JSON.parse(raw) as Partial<State>;
    const base = initialState();
    return withSamples({
      // Older saves predate newer play options; fill them with defaults.
      collections: (saved.collections ?? []).map((c) => ({ ...c, play: upgradePlay(c.play) })),
      // OneDrive sources were removed; drop any saved ones.
      sources: (saved.sources ?? []).filter((x) => (x.kind as string) !== 'onedrive'),
      nowShowing: saved.nowShowing ?? null,
      settings: {
        idleMin: saved.settings?.idleMin ?? base.settings.idleMin,
        defaultPlay: upgradePlay(saved.settings?.defaultPlay),
      },
      samplesAdded: saved.samplesAdded ?? false,
    });
  } catch (err) {
    console.error('Could not read saved state; starting fresh', err);
    return withSamples(initialState());
  }
}

let state: State = load();
const listeners = new Set<() => void>();

function save(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Could not save state', err);
  }
}

// Record the first-run seeding at once, so deleting an included collection
// sticks even if nothing else changes before the app closes.
if (seeded) save();

function commit(next: State): void {
  state = next;
  save();
  listeners.forEach((fn) => fn());
}

export function getState(): State {
  return state;
}

/** Re-renders the calling component whenever the selected slice changes. */
export function useStore<T>(select: (s: State) => T): T {
  const [value, setValue] = useState(() => select(state));
  useEffect(() => {
    const update = () => setValue(() => select(state));
    listeners.add(update);
    update();
    return () => {
      listeners.delete(update);
    };
  }, []);
  return value;
}

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// --- Collections ------------------------------------------------------------

export function getCollection(id: string): Collection | undefined {
  return state.collections.find((c) => c.id === id);
}

export function createCollection(name: string): Collection {
  const now = Date.now();
  const collection: Collection = {
    id: newId(),
    name,
    photos: [],
    createdAt: now,
    updatedAt: now,
    play: { ...state.settings.defaultPlay },
  };
  commit({ ...state, collections: [...state.collections, collection] });
  return collection;
}

function updateCollection(id: string, change: (c: Collection) => Partial<Collection>): void {
  commit({
    ...state,
    collections: state.collections.map((c) =>
      c.id === id ? { ...c, ...change(c), updatedAt: Date.now() } : c,
    ),
  });
}

/** Puts back any included collections that were deleted; returns how many. */
export function restoreSampleCollections(): number {
  const have = new Set(state.collections.map((c) => c.id));
  const missing = sampleCollections().filter((c) => !have.has(c.id));
  if (missing.length) commit({ ...state, collections: [...state.collections, ...missing] });
  return missing.length;
}

export function renameCollection(id: string, name: string): void {
  updateCollection(id, () => ({ name }));
}

export function deleteCollection(id: string): void {
  commit({
    ...state,
    collections: state.collections.filter((c) => c.id !== id),
    nowShowing: state.nowShowing?.collectionId === id ? null : state.nowShowing,
  });
}

/** Adds photos not already in the collection; returns how many were new. */
/** A new collection that mirrors a Google Photos album. */
export function createAlbumCollection(name: string, sourceId: string, photos: PhotoRef[]): Collection {
  const c = createCollection(name);
  updateCollection(c.id, () => ({ photos, albumSourceId: sourceId, syncedAt: Date.now() }));
  return getCollection(c.id)!;
}

/**
 * Replaces an album collection's photos with a fresh read of the album,
 * keeping the cover when it's still there. Returns whether anything changed.
 */
export function syncAlbumPhotos(id: string, photos: PhotoRef[]): boolean {
  const before = getCollection(id);
  if (!before) return false;
  const changed = before.photos.length !== photos.length || before.photos.some((p, i) => p.id !== photos[i].id);
  updateCollection(id, (c) => ({
    photos,
    syncedAt: Date.now(),
    coverId: c.coverId && photos.some((p) => p.id === c.coverId) ? c.coverId : undefined,
  }));
  return changed;
}

export function addPhotos(id: string, photos: PhotoRef[]): number {
  let added = 0;
  updateCollection(id, (c) => {
    const have = new Set(c.photos.map((p) => p.id));
    const fresh = photos.filter((p) => !have.has(p.id) && have.add(p.id));
    added = fresh.length;
    return { photos: [...c.photos, ...fresh] };
  });
  return added;
}

export function removePhoto(id: string, photoId: string): void {
  updateCollection(id, (c) => ({
    photos: c.photos.filter((p) => p.id !== photoId),
    coverId: c.coverId === photoId ? undefined : c.coverId,
  }));
  if (state.nowShowing?.photoId === photoId) commit({ ...state, nowShowing: null });
}

export function setCover(id: string, photoId: string): void {
  updateCollection(id, () => ({ coverId: photoId }));
}

export function setPlaySettings(id: string, play: PlaySettings): void {
  updateCollection(id, () => ({ play }));
}

/** Records dimensions learned while displaying a photo (used by Duo mode). */
export function rememberDimensions(photoId: string, width: number, height: number): void {
  let changed = false;
  const collections = state.collections.map((c) => {
    if (!c.photos.some((p) => p.id === photoId && p.width !== width)) return c;
    changed = true;
    return { ...c, photos: c.photos.map((p) => (p.id === photoId ? { ...p, width, height } : p)) };
  });
  if (changed) commit({ ...state, collections });
}

/** Saves capture dates resolved from EXIF so they're only read once. */
export function rememberTakenAt(dates: Map<string, number>): void {
  if (!dates.size) return;
  commit({
    ...state,
    collections: state.collections.map((c) =>
      c.photos.some((p) => dates.has(p.id) && p.takenAt !== dates.get(p.id))
        ? { ...c, photos: c.photos.map((p) => (dates.has(p.id) ? { ...p, takenAt: dates.get(p.id) } : p)) }
        : c,
    ),
  });
}

// --- Now showing ----------------------------------------------------------

/** Pins what's playing so the app returns to it when opened or left idle. */
export function setNowShowing(collectionId: string, photoId?: string): void {
  const cur = state.nowShowing;
  if (cur && cur.collectionId === collectionId && cur.photoId === photoId) return;
  commit({ ...state, nowShowing: { collectionId, photoId, since: Date.now() } });
}

export function clearNowShowing(): void {
  commit({ ...state, nowShowing: null });
}

/** The pinned item if it still exists (its collection or photo may be gone). */
export function getNowShowing(): NowShowing | null {
  const n = state.nowShowing;
  const c = n && getCollection(n.collectionId);
  if (!n || !c || !c.photos.length) return null;
  if (n.photoId && !c.photos.some((p) => p.id === n.photoId)) return null;
  return n;
}

// --- Sources & settings -----------------------------------------------------

export function saveSource(source: ConfiguredSource): void {
  const exists = state.sources.some((s) => s.id === source.id);
  commit({
    ...state,
    sources: exists
      ? state.sources.map((s) => (s.id === source.id ? source : s))
      : [...state.sources, source],
  });
}

export function removeSource(id: string): void {
  commit({ ...state, sources: state.sources.filter((s) => s.id !== id) });
}

export function updateSettings(change: Partial<AppSettings>): void {
  commit({ ...state, settings: { ...state.settings, ...change } });
}
