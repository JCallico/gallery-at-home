import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PhotoRef } from '../src/store/types';

const KEY = 'gah.state.v1';
const ref = (id: string): PhotoRef => ({ id, sourceId: 'gp', key: `https://lh3/${id}`, name: id });

/** Each load runs the store's start-up: reading (and upgrading) the saved state. */
async function loadStore(saved?: unknown) {
  localStorage.clear();
  if (saved !== undefined) localStorage.setItem(KEY, typeof saved === 'string' ? saved : JSON.stringify(saved));
  vi.resetModules();
  return import('../src/store/store');
}
const reopen = () => {
  vi.resetModules();
  return import('../src/store/store');
};

beforeEach(() => localStorage.clear());

describe('first run', () => {
  it('adds the included collections and records that it did', async () => {
    const store = await loadStore();
    expect(store.getState().collections.map((c) => c.id)).toContain('sample-masterpieces');
    expect(JSON.parse(localStorage.getItem(KEY)!).samplesAdded).toBe(true);
  });

  it('adds them after collections people already have', async () => {
    const store = await loadStore({ collections: [{ id: 'mine', name: 'Mine', photos: [] }] });
    expect(store.getState().collections[0].id).toBe('mine');
    expect(store.getState().collections.length).toBeGreaterThan(1);
  });

  it('starts fresh from unreadable data, and logs why', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const store = await loadStore('{not json');
    expect(store.getState().collections.length).toBeGreaterThan(0);
    expect(logged).toHaveBeenCalledWith('Could not read saved state; starting fresh', expect.any(SyntaxError));
  });
});

describe('included collections', () => {
  it('stay deleted, until restored', async () => {
    let store = await loadStore();
    store.deleteCollection('sample-space');
    store = await reopen();
    expect(store.getCollection('sample-space')).toBeUndefined();
    expect(store.restoreSampleCollections()).toBe(1);
    expect(store.getCollection('sample-space')).toBeDefined();
    expect(store.restoreSampleCollections()).toBe(0);
  });
});

describe('older saves', () => {
  const saved = (play: object) => ({ samplesAdded: true, collections: [{ id: 'c', name: 'C', photos: [], play }] });

  it('fills in options added since', async () => {
    const store = await loadStore(saved({ mode: 'duo' }));
    expect(store.getCollection('c')!.play).toMatchObject({ mode: 'duo', frameFit: 'fill', frame: 'none' });
  });

  it('turns the retired Ambient look into a framed slideshow with a clock', async () => {
    const store = await loadStore(saved({ mode: 'ambient', frame: 'none', showClock: false }));
    expect(store.getCollection('c')!.play).toMatchObject({ mode: 'slideshow', frame: 'gallery', showClock: true });
  });

  it('keeps an Ambient collection’s chosen frame', async () => {
    const store = await loadStore(saved({ mode: 'ambient', frame: 'walnut' }));
    expect(store.getCollection('c')!.play.frame).toBe('walnut');
  });

  it('drops the removed OneDrive sources and setting', async () => {
    const store = await loadStore({
      samplesAdded: true,
      sources: [{ id: 'od', kind: 'onedrive', name: 'OD' }, { id: 'w', kind: 'web', name: 'W', urls: [] }],
      settings: { oneDriveClientId: 'abc', idleMin: 9 },
    });
    expect(store.getState().sources.map((s) => s.id)).toEqual(['w']);
    expect(store.getState().settings.idleMin).toBe(9);
    expect(store.getState().settings).not.toHaveProperty('oneDriveClientId');
  });
});

describe('Home layout setting', () => {
  it('defaults to the Jump bar, keeps a saved choice and ignores an unknown one', async () => {
    expect((await loadStore()).getState().settings.homeView).toBe('jump');
    expect((await loadStore({ samplesAdded: true, settings: { homeView: 'wall' } })).getState().settings.homeView).toBe('wall');
    expect((await loadStore({ samplesAdded: true, settings: { homeView: 'index' } })).getState().settings.homeView).toBe('index');
    expect((await loadStore({ samplesAdded: true, settings: { homeView: 'carousel' } })).getState().settings.homeView).toBe('jump');
  });
});

describe('album collections', () => {
  it('replace their photos and keep a cover that is still there', async () => {
    const store = await loadStore();
    const c = store.createAlbumCollection('Spain', 'gp', [ref('a'), ref('b')]);
    store.setCover(c.id, 'b');
    expect(store.syncAlbumPhotos(c.id, [ref('b'), ref('c')])).toBe(true);
    const after = store.getCollection(c.id)!;
    expect(after.photos.map((p) => p.id)).toEqual(['b', 'c']);
    expect(after.coverId).toBe('b');
    store.syncAlbumPhotos(c.id, [ref('c')]);
    expect(store.getCollection(c.id)!.coverId).toBeUndefined();
  });

  it('save nothing when the album has not changed', async () => {
    const store = await loadStore();
    const c = store.createAlbumCollection('Spain', 'gp', [ref('a'), ref('b')]);
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    expect(store.syncAlbumPhotos(c.id, [ref('a'), ref('b')])).toBe(false);
    expect(setItem).not.toHaveBeenCalled();
  });
});

describe('now showing', () => {
  it('survives a restart, and clears when what it pointed at goes', async () => {
    let store = await loadStore();
    const c = store.createAlbumCollection('Spain', 'gp', [ref('a'), ref('b')]);
    store.setNowShowing(c.id, 'a');
    store = await reopen();
    expect(store.getNowShowing()).toMatchObject({ collectionId: c.id, photoId: 'a' });
    store.removePhoto(c.id, 'a');
    expect(store.getNowShowing()).toBeNull();
  });
});

describe('addPhotos', () => {
  it('skips photos already in the collection', async () => {
    const store = await loadStore();
    const c = store.createCollection('Mine');
    expect(store.addPhotos(c.id, [ref('a'), ref('b')])).toBe(2);
    expect(store.addPhotos(c.id, [ref('b'), ref('c')])).toBe(1);
    expect(store.getCollection(c.id)!.photos.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });
});
