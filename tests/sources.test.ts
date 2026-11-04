import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GooglePhotosSource, NetworkSource, PhotoRef, WebSource } from '../src/store/types';
import { albumPage, albumPhoto, stubBrowser } from './harness';

beforeEach(() => {
  stubBrowser();
  vi.resetModules();
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const respond = (map: Record<string, () => Response>) =>
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const key = Object.keys(map).find((k) => String(url).includes(k));
    if (!key) throw new TypeError(`no route for ${url}`);
    return map[key]();
  }));
const fetchMock = () => fetch as unknown as ReturnType<typeof vi.fn>;

describe('web links', () => {
  const source: WebSource = { id: 'w', kind: 'web', name: 'Links', urls: ['https://x.test/a.jpg', 'https://x.test/gallery'] };
  const adapter = async () => (await import('../src/sources/web')).webAdapter(source);

  it('lists direct photos, and pages as folders', async () => {
    const listing = await (await adapter()).list(null);
    expect(listing.entries.map((e) => e.type)).toEqual(['photo', 'folder']);
  });

  it('collects photos from a web page', async () => {
    respond({ gallery: () => new Response('<html><img src="/one.png"><a href="two.jpg">x</a><a href="page.html">y</a></html>', { headers: { 'content-type': 'text/html' } }) });
    const listing = await (await adapter()).list('https://x.test/gallery');
    expect(listing.entries.map((e) => (e.type === 'photo' ? e.ref.key : ''))).toEqual(['https://x.test/one.png', 'https://x.test/two.jpg']);
  });

  it('reads JSON lists in the usual shapes', async () => {
    respond({ gallery: () => new Response(JSON.stringify({ photos: [{ url: 'https://x.test/1.jpg' }, 'https://x.test/2.jpg', { src: 'https://x.test/3.jpg' }, 5] })) });
    const listing = await (await adapter()).list('https://x.test/gallery');
    expect(listing.entries).toHaveLength(3);
  });

  it('reads plain lists of links, removing duplicates', async () => {
    respond({ gallery: () => new Response('https://x.test/1.jpg\nnot a link\nhttps://x.test/1.jpg\nhttps://x.test/2.jpg\n', { headers: { 'content-type': 'text/plain' } }) });
    const listing = await (await adapter()).list('https://x.test/gallery');
    expect(listing.entries).toHaveLength(2);
  });
});

describe('network shares', () => {
  const source: NetworkSource = { id: 'n', kind: 'network', name: 'NAS', url: 'http://nas.test/photos', username: 'me', password: 'pw' };
  const dav = (...rows: string[]) => `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">${rows.join('')}</d:multistatus>`;
  const folder = (href: string) => `<d:response><d:href>${href}</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>`;
  const file = (href: string, type = 'image/jpeg', modified = '') =>
    `<d:response><d:href>${href}</d:href><d:propstat><d:prop><d:resourcetype/><d:getcontenttype>${type}</d:getcontenttype><d:getlastmodified>${modified}</d:getlastmodified></d:prop></d:propstat></d:response>`;
  const load = () => import('../src/sources/network');

  it('reads a WebDAV folder: folders first, no hidden items, photos only', async () => {
    respond({
      nas: () => new Response(dav(folder('/photos/'), file('/photos/b%20c.jpg', 'image/jpeg', 'Mon, 01 Jan 2024 10:00:00 GMT'), folder('/photos/2019/'), folder('/photos/@eaDir/'), file('/photos/notes.txt', 'text/plain'))),
    });
    const { networkAdapter } = await load();
    const { entries } = await networkAdapter(source).list(null);
    expect(entries.map((e) => (e.type === 'folder' ? e.name : e.ref.name))).toEqual(['2019', 'b c.jpg']);
    const photo = entries[1];
    expect(photo.type === 'photo' && photo.ref.takenAt).toBe(Date.UTC(2024, 0, 1, 10));
  });

  it('sends the credentials with each request', async () => {
    respond({ nas: () => new Response(dav(folder('/photos/'))) });
    const { networkAdapter } = await load();
    await networkAdapter(source).list(null);
    const init = fetchMock().mock.calls[0][1];
    expect(init.method).toBe('PROPFIND');
    expect(init.headers.Authorization).toBe(`Basic ${btoa('me:pw')}`);
  });

  it('falls back to a plain web folder listing', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === 'PROPFIND'
        ? new Response('', { status: 405 })
        : new Response('<a href="../">up</a><a href="?C=N">sort</a><a href="sub/">sub</a><a href="a.jpg">a</a><a href="a.jpg">again</a><a href="doc.pdf">d</a><a href="http://other.test/x.jpg">o</a><a href=".hidden.jpg">h</a>')));
    const { networkAdapter } = await load();
    const adapter = networkAdapter(source);
    const { entries } = await adapter.list(null);
    expect(entries.map((e) => (e.type === 'folder' ? e.name : e.ref.name))).toEqual(['sub', 'a.jpg']);
    // Having learned the protocol, it stops probing WebDAV.
    fetchMock().mockClear();
    await adapter.list('http://nas.test/photos/sub/');
    expect(fetchMock().mock.calls[0][1].method).toBeUndefined();
  });

  it('turns failures into readable messages', async () => {
    const { testNetworkSource } = await load();
    respond({ nas: () => new Response('', { status: 401 }) });
    await expect(testNetworkSource(source)).rejects.toThrow('user name or password');
    respond({ nas: () => new Response('', { status: 500 }) });
    await expect(testNetworkSource(source)).rejects.toThrow('answered 500');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    await expect(testNetworkSource(source)).rejects.toThrow('Could not reach');
  });

  it('loads photos from password-protected shares through a private copy', async () => {
    respond({ nas: () => new Response(new Blob(['x'])) });
    const { networkAdapter } = await load();
    const ref: PhotoRef = { id: 'n|a', sourceId: 'n', key: 'http://nas.test/photos/a.jpg', name: 'a' };
    expect(await networkAdapter(source).imageUrl(ref)).toBe('blob:test');
    const open = networkAdapter({ ...source, username: undefined, password: undefined });
    expect(await open.imageUrl(ref)).toBe(ref.key);
  });
});

describe('Google Photos adapter', () => {
  const source: GooglePhotosSource = { id: 'g', kind: 'gphotos', name: 'Spain', url: 'https://photos.google.com/share/ALBUM?key=K' };
  const ref: PhotoRef = { id: 'g|a', sourceId: 'g', key: 'https://lh3.googleusercontent.com/pw/a', name: 'a' };

  it('asks Google for TV-sized images and thumbnails', async () => {
    const { gphotosAdapter } = await import('../src/sources/gphotos');
    const adapter = gphotosAdapter(source);
    expect(await adapter.imageUrl(ref)).toBe(`${ref.key}=w1920-h1440`);
    expect(await adapter.thumbUrl(ref)).toBe(`${ref.key}=w480-h480`);
    expect(adapter.readHead).toBeUndefined();
  });

  it('keeps photo ids stable across reads, from Google’s id not the image link', async () => {
    const { albumRefs } = await import('../src/sources/gphotos');
    const album = { title: 'S', url: '', albumId: 'A', key: 'K', total: 1, complete: true, photos: [{ mediaId: 'm1', url: 'https://lh3/changes', width: 1, height: 2, takenAt: 5 }] };
    expect(albumRefs(source, album)[0]).toMatchObject({ id: 'g|m1', key: 'https://lh3/changes', takenAt: 5 });
  });

  it('lists the album’s photos', async () => {
    respond({ 'photos.google.com/share': () => new Response(albumPage('Spain', [albumPhoto('a'), albumPhoto('b')])) });
    const { gphotosAdapter } = await import('../src/sources/gphotos');
    const listing = await gphotosAdapter(source).list(null);
    expect(listing.title).toBe('Spain');
    expect(listing.entries).toHaveLength(2);
  });
});

describe('newer TVs, which Google refuses', () => {
  /** A stand-in for Tizen's download manager and filesystem. */
  const stubTizen = (page: string) => {
    const started: string[] = [];
    vi.stubGlobal('tizen', {
      DownloadRequest: class {
        constructor(public url: string, public dir: string, public name: string) {}
      },
      download: {
        start(req: { url: string; name: string }, cb: { oncompleted: (id: number, path: string) => void }) {
          started.push(req.url);
          setTimeout(() => cb.oncompleted(1, `/tmp/${req.name}`), 0);
        },
      },
      filesystem: {
        openFile: () => ({ readString: () => page, close() {} }),
        deleteFile: vi.fn(),
      },
    });
    return started;
  };

  it('reads the page through the download manager when the browser engine is refused', async () => {
    const started = stubTizen('<html>from the download manager</html>');
    respond({ 'x.test': () => new Response('', { status: 403 }) });
    const { fetchText } = await import('../src/sources/fetch-text');
    expect(await fetchText('https://x.test/page')).toContain('download manager');
    expect(started).toEqual(['https://x.test/page']);
  });

  it('then skips the refused engine for that site', async () => {
    stubTizen('page');
    respond({ 'x.test': () => new Response('', { status: 403 }) });
    const { fetchText } = await import('../src/sources/fetch-text');
    await fetchText('https://x.test/1');
    fetchMock().mockClear();
    await fetchText('https://x.test/2');
    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it('uses the normal route when it works', async () => {
    const started = stubTizen('nope');
    respond({ 'x.test': () => new Response('direct') });
    const { fetchText } = await import('../src/sources/fetch-text');
    expect(await fetchText('https://x.test/page')).toBe('direct');
    expect(started).toEqual([]);
  });

  it('reports the refusal where there is no download manager', async () => {
    respond({ 'x.test': () => new Response('', { status: 403 }) });
    const { fetchText } = await import('../src/sources/fetch-text');
    await expect(fetchText('https://x.test/page')).rejects.toThrow('403');
  });

  it('other server errors are not treated as a refusal', async () => {
    const started = stubTizen('nope');
    respond({ 'x.test': () => new Response('', { status: 500 }) });
    const { fetchText } = await import('../src/sources/fetch-text');
    await expect(fetchText('https://x.test/page')).rejects.toThrow('500');
    expect(started).toEqual([]);
  });

  it('reads a whole album’s first page, marked incomplete', async () => {
    stubTizen(albumPage('Spain', [albumPhoto('a')], 'NEXT'));
    respond({ 'photos.app.goo.gl': () => new Response('', { status: 403 }), batchexecute: () => new Response('', { status: 403 }) });
    const { fetchAlbum } = await import('../src/sources/gphotos');
    const album = await fetchAlbum('https://photos.app.goo.gl/AbC');
    expect(album.complete).toBe(false);
    expect(album.photos).toHaveLength(1);
  });
});

describe('album worker', () => {
  const run = async (data: object) => {
    const posted = vi.fn();
    vi.stubGlobal('postMessage', posted);
    (self as unknown as { postMessage: unknown }).postMessage = posted;
    await import('../src/sources/album-worker');
    (self as unknown as { onmessage: (e: unknown) => void }).onmessage({ data });
    await vi.waitFor(() => expect(posted).toHaveBeenCalled());
    return posted.mock.calls[0][0];
  };

  it('reads an album and replies with it', async () => {
    respond({ 'photos.app.goo.gl': () => new Response(albumPage('Spain', [albumPhoto('a')])) });
    const reply = await run({ id: 7, link: 'https://photos.app.goo.gl/AbC', proxy: '' });
    expect(reply.id).toBe(7);
    expect(reply.album.title).toBe('Spain');
  });

  it('goes through the proxy when told to (dev server)', async () => {
    respond({ 'photos.app.goo.gl': () => new Response(albumPage('Spain', [albumPhoto('a')])) });
    await run({ id: 1, link: 'https://photos.app.goo.gl/AbC', proxy: 'http://localhost/__dev/proxy?url=' });
    expect(fetchMock().mock.calls[0][0]).toContain('__dev/proxy?url=https%3A%2F%2Fphotos.app.goo.gl');
  });

  it('tells the app when Google refuses, so it can fall back', async () => {
    respond({ 'photos.app.goo.gl': () => new Response('', { status: 403 }) });
    const reply = await run({ id: 2, link: 'https://photos.app.goo.gl/AbC', proxy: '' });
    expect(reply.refused).toBe(true);
  });

  it('passes other errors on as they are', async () => {
    respond({ 'photos.app.goo.gl': () => new Response('', { status: 500 }) });
    const reply = await run({ id: 3, link: 'https://photos.app.goo.gl/AbC', proxy: '' });
    expect(reply.refused).toBe(false);
    expect(reply.error).toContain('500');
  });
});

describe('background album refresh', () => {
  const setup = async (photos: string[], syncedAt = 1) => {
    const source: GooglePhotosSource = { id: 'g', kind: 'gphotos', name: 'Spain', url: 'https://photos.google.com/share/ALBUM?key=K' };
    localStorage.setItem('gah.state.v1', JSON.stringify({
      samplesAdded: true,
      sources: [source],
      collections: [{ id: 'c', name: 'Spain', albumSourceId: 'g', syncedAt, play: {}, photos: photos.map((id) => ({ id: `g|${id}`, sourceId: 'g', key: `https://lh3.googleusercontent.com/pw/${id}`, name: id })) }],
    }));
    vi.useFakeTimers();
    const { refreshAlbum } = await import('../src/sources/albums');
    const store = await import('../src/store/store');
    return { refreshAlbum, store };
  };
  const settle = async <T>(p: Promise<T>) => {
    await vi.advanceTimersByTimeAsync(3100);
    return p;
  };

  it('picks up photos added to the album', async () => {
    respond({ 'photos.google.com/share': () => new Response(albumPage('Spain', [albumPhoto('a'), albumPhoto('new')])) });
    const { refreshAlbum, store } = await setup(['a']);
    expect(await settle(refreshAlbum('c'))).toBe(true);
    expect(store.getCollection('c')!.photos.map((p) => p.id)).toEqual(['g|a', 'g|new']);
  });

  it('waits before starting, so opening a collection is never held up', async () => {
    respond({ 'photos.google.com/share': () => new Response(albumPage('Spain', [albumPhoto('a')])) });
    const { refreshAlbum } = await setup(['a']);
    const pending = refreshAlbum('c');
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchMock()).not.toHaveBeenCalled();
    await settle(pending);
    expect(fetchMock()).toHaveBeenCalled();
  });

  it('reads an album once at a time, and not again soon after', async () => {
    respond({ 'photos.google.com/share': () => new Response(albumPage('Spain', [albumPhoto('a')])) });
    const { refreshAlbum } = await setup(['a']);
    const first = refreshAlbum('c');
    const second = refreshAlbum('c');
    await settle(Promise.all([first, second]));
    expect(fetchMock()).toHaveBeenCalledTimes(1);
    fetchMock().mockClear();
    expect(await refreshAlbum('c')).toBe(false);
    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it('can be forced, as the player does every half hour', async () => {
    respond({ 'photos.google.com/share': () => new Response(albumPage('Spain', [albumPhoto('a')])) });
    const { refreshAlbum } = await setup(['a'], Date.now());
    expect(await refreshAlbum('c')).toBe(false);
    await settle(refreshAlbum('c', true));
    expect(fetchMock()).toHaveBeenCalled();
  });

  it('leaves the collection alone when the album can’t be read or comes back empty', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    respond({ 'photos.google.com/share': () => new Response('<html>gone</html>') });
    const { refreshAlbum, store } = await setup(['a']);
    expect(await settle(refreshAlbum('c'))).toBe(false);
    expect(store.getCollection('c')!.photos).toHaveLength(1);
  });

  it('ignores ordinary collections', async () => {
    const { refreshAlbum } = await setup(['a']);
    expect(await refreshAlbum('missing')).toBe(false);
  });
});

describe('small thumbnails', () => {
  it('shrinks an original once and reuses the copy', async () => {
    respond({ 'x.test': () => new Response(new Blob(['big'], { type: 'image/jpeg' })) });
    const { smallThumb } = await import('../src/sources/thumbs');
    const first = await smallThumb('id1', 'https://x.test/a.jpg', 1);
    expect(first.url).toBe('blob:test');
    await smallThumb('id1', 'https://x.test/a.jpg', 1);
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  it('falls back to the original when it can’t be shrunk', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('blocked'); }));
    const { smallThumb } = await import('../src/sources/thumbs');
    expect(await smallThumb('id2', 'https://x.test/b.jpg', 6)).toEqual({ url: 'https://x.test/b.jpg', orientation: 6 });
  });
});

describe('USB drives', () => {
  it('lists folders and photos from a drive', async () => {
    respond({
      '/__dev/fs/drives': () => new Response(JSON.stringify([{ label: 'removable_sda1', name: 'USB drive' }])),
      '/__dev/fs/list': () => new Response(JSON.stringify([
        { name: 'DCIM', path: 'removable_sda1/DCIM', isDir: true },
        { name: 'a.jpg', path: 'removable_sda1/a.jpg', isDir: false, modified: 5 },
        { name: 'notes.txt', path: 'removable_sda1/notes.txt', isDir: false },
        { name: '.hidden', path: 'removable_sda1/.hidden', isDir: true },
      ])),
    });
    const { usbAdapter } = await import('../src/sources/usb');
    const adapter = usbAdapter({ id: 'removable_sda1', kind: 'usb', name: 'USB drive' });
    const { entries } = await adapter.list(null);
    expect(entries.map((e) => (e.type === 'folder' ? e.name : e.ref.name))).toEqual(['DCIM', 'a.jpg']);
  });

  it('reports when no drive is readable', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('no server'); }));
    const { refreshDrives } = await import('../src/sources');
    await expect(refreshDrives()).resolves.toBeUndefined();
  });
});

describe('source lookup', () => {
  it('finds the included photos, and drives even while unplugged', async () => {
    const { adapterFor, sourceLabel } = await import('../src/sources');
    expect(adapterFor('samples').source.kind).toBe('samples');
    expect(adapterFor('removable_sdb1').source.kind).toBe('usb');
    expect(sourceLabel('samples')).toBe('Included photos');
  });

  it('explains a photo whose source was removed', async () => {
    const { adapterFor, sourceLabel } = await import('../src/sources');
    expect(() => adapterFor('gone')).toThrow('source has been removed');
    expect(sourceLabel('gone')).toBe('Missing source');
  });

  it('serves included photos and their thumbnails from the package', async () => {
    const { samplesAdapter } = await import('../src/samples');
    const adapter = samplesAdapter();
    const ref: PhotoRef = { id: 'samples|coast/a.jpg', sourceId: 'samples', key: 'coast/a.jpg', name: 'a' };
    expect(await adapter.imageUrl(ref)).toBe('samples/coast/a.jpg');
    expect(await adapter.thumbUrl(ref)).toBe('samples/coast/thumb/a.jpg');
    const root = await adapter.list(null);
    expect(root.entries).toHaveLength(7);
    const folder = await adapter.list('coast');
    expect(folder.entries).toHaveLength(8);
    await expect(adapter.list('nope')).rejects.toThrow();
  });
});
