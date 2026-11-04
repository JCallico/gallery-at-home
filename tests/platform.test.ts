import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { albumPage, albumPhoto, stubBrowser } from './harness';

const win = window as unknown as { tizen?: unknown; webapis?: unknown };

beforeEach(() => {
  stubBrowser();
  vi.resetModules();
});
afterEach(() => {
  delete win.tizen;
  delete win.webapis;
  vi.unstubAllGlobals();
});

describe('on the TV', () => {
  const screensaver = () => {
    const setScreenSaver = vi.fn();
    win.webapis = { appcommon: { setScreenSaver, AppCommonScreenSaverState: { SCREEN_SAVER_ON: 'on', SCREEN_SAVER_OFF: 'off' } } };
    return setScreenSaver;
  };

  it('holds the TV’s screensaver off, and lets it back', async () => {
    const setScreenSaver = screensaver();
    const { setScreenSaverAllowed } = await import('../src/platform/tizen');
    setScreenSaverAllowed(false);
    expect(setScreenSaver).toHaveBeenLastCalledWith('off');
    setScreenSaverAllowed(true);
    expect(setScreenSaver).toHaveBeenLastCalledWith('on');
  });

  it('survives the screensaver control failing, as it did on 2020 TVs', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    screensaver().mockImplementation(() => { throw new TypeError('this.elPlugin.postMessage is not a function'); });
    const { setScreenSaverAllowed } = await import('../src/platform/tizen');
    expect(() => setScreenSaverAllowed(false)).not.toThrow();
  });

  it('does nothing outside the TV', async () => {
    const { setScreenSaverAllowed, registerRemoteKeys, exitApp } = await import('../src/platform/tizen');
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    expect(() => { setScreenSaverAllowed(false); registerRemoteKeys(); exitApp(); }).not.toThrow();
  });

  it('registers the remote’s extra keys, tolerating models without some', async () => {
    const registerKey = vi.fn((key: string) => { if (key === 'ChannelUp') throw new Error('unsupported'); });
    win.tizen = { tvinputdevice: { registerKey } };
    const { registerRemoteKeys } = await import('../src/platform/tizen');
    expect(() => registerRemoteKeys()).not.toThrow();
    expect(registerKey).toHaveBeenCalledWith('ColorF3Blue');
    expect(registerKey).toHaveBeenCalledWith('MediaPlayPause');
  });

  it('exits through the TV’s application API', async () => {
    const exit = vi.fn();
    win.tizen = { application: { getCurrentApplication: () => ({ exit }) } };
    const { exitApp } = await import('../src/platform/tizen');
    exitApp();
    expect(exit).toHaveBeenCalled();
  });

  it('lists only mounted USB drives, and reads their folders', async () => {
    const file = (name: string, isDirectory: boolean) => ({ name, isDirectory, modified: new Date(1000), toURI: () => `file:///${name}` });
    win.tizen = {
      filesystem: {
        listStorages: (ok: (s: unknown[]) => void) => ok([
          { label: 'removable_sda1', type: 'EXTERNAL', state: 'MOUNTED' },
          { label: 'internal0', type: 'INTERNAL', state: 'MOUNTED' },
          { label: 'removable_sdb1', type: 'EXTERNAL', state: 'UNMOUNTABLE' },
        ]),
        addStorageStateChangeListener: () => 1,
        resolve: (_path: string, ok: (dir: unknown) => void) => ok({
          listFiles: (done: (f: unknown[]) => void) => done([file('DCIM', true), file('a.jpg', false)]),
          resolve: () => file('a.jpg', false),
        }),
      },
    };
    const { filesystem } = await import('../src/platform/fs');
    expect(await filesystem.drives()).toEqual([{ label: 'removable_sda1', name: 'USB drive' }]);
    const entries = await filesystem.list('removable_sda1');
    expect(entries.map((e) => [e.name, e.path, e.isDir])).toEqual([
      ['DCIM', 'removable_sda1/DCIM', true],
      ['a.jpg', 'removable_sda1/a.jpg', false],
    ]);
  });
});

describe('reading albums in the background worker', () => {
  /** A Worker stand-in that replies however the test says. */
  const stubWorker = (reply: (msg: { id: number }, worker: { onmessage: (e: unknown) => void; onerror: () => void }) => void) => {
    const created: string[] = [];
    vi.stubGlobal('Worker', class {
      onmessage: (e: unknown) => void = () => undefined;
      onerror: () => void = () => undefined;
      constructor(url: string) {
        created.push(url);
      }
      postMessage(msg: { id: number }) {
        setTimeout(() => reply(msg, this), 0);
      }
    });
    return created;
  };
  const album = { title: 'From worker', url: 'u', albumId: 'A', key: 'K', total: 1, complete: true, photos: [] };

  it('uses the worker when it is available, doing no reading on the page', async () => {
    const created = stubWorker((msg, w) => w.onmessage({ data: { id: msg.id, album } }));
    const page = vi.fn();
    vi.stubGlobal('fetch', page);
    const { fetchAlbum } = await import('../src/sources/gphotos');
    expect((await fetchAlbum('https://photos.app.goo.gl/AbC')).title).toBe('From worker');
    expect(created).toEqual(['album-worker.js']);
    expect(page).not.toHaveBeenCalled();
  });

  it('reads on the page when the worker is refused', async () => {
    stubWorker((msg, w) => w.onmessage({ data: { id: msg.id, refused: true, error: 'refused' } }));
    vi.stubGlobal('fetch', vi.fn(async () => new Response(albumPage('On the page', [albumPhoto('a')]))));
    const { fetchAlbum } = await import('../src/sources/gphotos');
    expect((await fetchAlbum('https://photos.app.goo.gl/AbC')).title).toBe('On the page');
  });

  it('reads on the page when the worker file fails to load', async () => {
    stubWorker((_msg, w) => w.onerror());
    vi.stubGlobal('fetch', vi.fn(async () => new Response(albumPage('On the page', [albumPhoto('a')]))));
    const { fetchAlbum } = await import('../src/sources/gphotos');
    expect((await fetchAlbum('https://photos.app.goo.gl/AbC')).title).toBe('On the page');
  });

  it('reports other errors from the worker', async () => {
    stubWorker((msg, w) => w.onmessage({ data: { id: msg.id, refused: false, error: 'Couldn’t read this album' } }));
    const { fetchAlbum } = await import('../src/sources/gphotos');
    await expect(fetchAlbum('https://photos.app.goo.gl/AbC')).rejects.toThrow('Couldn’t read');
  });
});
