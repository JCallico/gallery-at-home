import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { $, $$, albumPage, albumPhoto, type AppHandle, click, clickText, find, KEY, mountApp, nav, press, saved, startApp, stubBrowser, text, type } from './harness';

let app: AppHandle;

beforeEach(() => stubBrowser());
afterEach(() => {
  app?.close();
  vi.unstubAllGlobals();
});

const openCollection = (id: string) => click(`[data-collection-id="${id}"]`);
const screen = () => (document.querySelector('.screen-host > *') as HTMLElement | null)?.className ?? '';

describe('Home', () => {
  it('shows the included collections on first run', async () => {
    app = await startApp();
    await find('.poster');
    const titles = $$('.poster-title').map((e) => e.textContent);
    expect(titles).toEqual(['Masterpieces', 'Mountains', 'Still Waters', 'Coastlines', 'Forests & Waterfalls', 'After Dark', 'Space']);
    expect($<HTMLImageElement>('.wordmark')?.alt).toBe('Gallery at Home');
  });

  it('asks before exiting on Back, and Cancel stays', async () => {
    app = await startApp();
    await vi.waitFor(() => expect(document.activeElement?.getAttribute('data-nav')).not.toBeNull());
    press(KEY.back);
    await find('.dialog');
    expect(text('.dialog h2')).toBe('Exit Gallery at Home?');
    await clickText('Cancel', '.dialog');
    await vi.waitFor(() => expect($('.dialog')).toBeNull());
    expect(screen()).toContain('home');
  });

  it('plays the focused collection with the Play key', async () => {
    app = await startApp();
    const poster = await find('[data-collection-id="sample-coast"]');
    poster.focus();
    press(KEY.play);
    await find('.player');
  });
});

describe('New collection', () => {
  const start = async () => {
    app = await startApp();
    await click(nav('new-collection'));
    await find('.dialog');
  };

  it('offers a new source or an empty collection', async () => {
    await start();
    const options = $$('.dialog [data-nav]').map((e) => e.getAttribute('data-nav-id'));
    expect(options).toEqual(['From a new source', 'Empty collection']);
  });

  it('makes an empty collection with a name you choose', async () => {
    await start();
    await clickText('Empty collection', '.dialog');
    await type(`.dialog ${nav('Name')} input`, 'Our trip');
    await clickText('Create', '.dialog');
    await vi.waitFor(() => expect(text('.detail-title')).toBe('Our trip'));
    expect(text('.detail-meta')).toContain('No photos yet');
  });

  it('from web links: names the collection after the source, then picks photos', async () => {
    await start();
    await clickText('From a new source', '.dialog');
    await vi.waitFor(() => expect(text('.dialog h2')).toBe('Add a photo source'));
    await clickText('Web links', '.dialog');
    await type(`${nav('Name')} input`, 'Lighthouses');
    await type(`${nav('Link 1')} input`, 'https://example.com/photos/tower.jpg');
    await click(nav('save'));

    // The name box comes prefilled, so nothing is typed twice.
    const name = await find<HTMLInputElement>('.dialog input');
    expect(name.value).toBe('Lighthouses');
    await clickText('Create', '.dialog');

    await click(nav('select-all'));
    await click(nav('add-selected'));
    await vi.waitFor(() => expect(text('.detail-title')).toBe('Lighthouses'));
    expect(text('.detail-meta')).toContain('1 photo');
    expect(saved().sources[0]).toMatchObject({ kind: 'web', name: 'Lighthouses' });
  });

  it('cancelling the name keeps the source but makes no collection', async () => {
    await start();
    await clickText('From a new source', '.dialog');
    await vi.waitFor(() => expect(text('.dialog h2')).toBe('Add a photo source'));
    await clickText('Web links', '.dialog');
    await type(`${nav('Link 1')} input`, 'https://example.com/a.jpg');
    await click(nav('save'));
    await find('.dialog input');
    const before = saved().collections.length;
    await clickText('Cancel', '.dialog');
    await vi.waitFor(() => expect(screen()).toContain('home'));
    expect(saved().collections).toHaveLength(before);
    expect(saved().sources).toHaveLength(1);
  });

  it('refuses a web link it cannot use', async () => {
    await start();
    await clickText('From a new source', '.dialog');
    await vi.waitFor(() => expect(text('.dialog h2')).toBe('Add a photo source'));
    await clickText('Web links', '.dialog');
    await click(nav('save'));
    await vi.waitFor(() => expect(text('.form-error')).toContain('at least one link'));
  });
});

describe('Google Photos album', () => {
  const openForm = async () => {
    await click(nav('new-collection'));
    await find('.dialog');
    await clickText('From a new source', '.dialog');
    await vi.waitFor(() => expect(text('.dialog h2')).toBe('Add a photo source'));
    await clickText('Google Photos', '.dialog');
  };

  it('starts the link box with the short-link prefix', async () => {
    app = await startApp();
    await openForm();
    const input = await find<HTMLInputElement>(`${nav('Album link')} input`);
    expect(input.value).toBe('https://photos.app.goo.gl/');
  });

  it('asks for the code when only the prefix is there', async () => {
    app = await startApp();
    await openForm();
    await click(nav('save'));
    await vi.waitFor(() => expect(text('.form-error')).toContain('Type the code'));
  });

  it('becomes a synced collection, named after the album unless changed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(albumPage('Spain 2025', [albumPhoto('a'), albumPhoto('b'), albumPhoto('v', { 76647426: [] })]))));
    app = await startApp();
    await openForm();
    await type(`${nav('Album link')} input`, 'https://photos.app.goo.gl/AbC123');
    await click(nav('save'));
    const name = await find<HTMLInputElement>('.dialog input');
    expect(name.value).toBe('Spain 2025');
    await type('.dialog input', 'Spain');
    await clickText('Create', '.dialog');
    await vi.waitFor(() => expect(text('.detail-title')).toBe('Spain'));
    expect(text('.detail-meta')).toContain('2 photos');
    expect(text('.detail-meta')).toContain('kept in sync');
    const stored = saved().collections.at(-1);
    expect(stored.albumSourceId).toBe(saved().sources[0].id);
    expect(stored.photos[0].takenAt).toBe(1757144641342);
  });

  it('explains when the album cannot be read', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>Sign in</html>')));
    app = await startApp();
    await openForm();
    await type(`${nav('Album link')} input`, 'photos.app.goo.gl/AbC123');
    await click(nav('save'));
    await vi.waitFor(() => expect(text('.form-error')).toContain('Couldn’t read this album'));
  });

  it('from a collection, can instead copy the photos in once', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(albumPage('Spain', [albumPhoto('a')]))));
    app = await startApp();
    await click(nav('new-collection'));
    await clickText('Empty collection', '.dialog');
    await type(`.dialog ${nav('Name')} input`, 'Mine');
    await clickText('Create', '.dialog');
    await click(nav('add'));
    await click(nav('new-source'));
    await clickText('Google Photos', '.dialog');
    await type(`${nav('Album link')} input`, 'photos.app.goo.gl/AbC123');
    await click(nav('save'));
    await clickText('Add the photos to', '.dialog');
    await vi.waitFor(() => expect(text('.detail-title')).toBe('Mine'));
    expect(text('.detail-meta')).toContain('1 photo');
    expect(saved().collections.at(-1).albumSourceId).toBeUndefined();
  });
});

describe('Collection', () => {
  it('lists its photos and actions', async () => {
    app = await startApp();
    await openCollection('sample-coast');
    await find('.photo-tile');
    expect($$('.photo-tile')).toHaveLength(8);
    expect(text(nav('options'))).toContain('Slideshow');
  });

  it('draws big collections a few rows at a time', async () => {
    const photos = Array.from({ length: 200 }, (_, i) => ({ id: `s|${i}`, sourceId: 'samples', key: `coast/${i}.jpg`, name: `${i}` }));
    // The grid's end only comes into view once scrolled to.
    let reachEnd: (() => void) | undefined;
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(private cb: (r: { target: Element; isIntersecting: boolean }[]) => void) {}
        observe(target: Element) {
          if (target.classList.contains('grid-more')) reachEnd = () => this.cb([{ target, isIntersecting: true }]);
          else this.cb([{ target, isIntersecting: true }]);
        }
        unobserve() {}
        disconnect() {}
      },
    );
    app = await startApp({ samplesAdded: true, collections: [{ id: 'big', name: 'Big', photos, play: {} }] });
    await openCollection('big');
    await find('.photo-tile');
    expect($$('.photo-tile')).toHaveLength(48);
    expect(text('.detail-meta')).toContain('200 photos');
    await vi.waitFor(() => expect(reachEnd).toBeDefined());
    reachEnd?.();
    await vi.waitFor(() => expect($$('.photo-tile')).toHaveLength(96));
  });

  it('offers the photo menu, and shows one photo from it', async () => {
    app = await startApp();
    await openCollection('sample-coast');
    (await find('.photo-tile')).click();
    await find('.dialog.sheet');
    await clickText('Show this photo', '.dialog');
    await find('.player');
    await vi.waitFor(() => expect(text('.info-sub')).toContain('Showing one photo'));
    expect(saved().nowShowing.photoId).toContain('coast/');
  });

  it('removes a photo and sets a cover from the menu', async () => {
    app = await startApp();
    await openCollection('sample-coast');
    (await find('.photo-tile')).click();
    await clickText('Use as cover', '.dialog');
    await vi.waitFor(() => expect(saved().collections.find((c: { id: string }) => c.id === 'sample-coast').coverId).toBeTruthy());
    (await find('.photo-tile')).click();
    await clickText('Remove from collection', '.dialog');
    await vi.waitFor(() => expect($$('.photo-tile')).toHaveLength(7));
  });

  it('renames and deletes through More', async () => {
    app = await startApp();
    await openCollection('sample-coast');
    await click(nav('more'));
    await clickText('Rename', '.dialog');
    await type('.dialog input', 'Seaside');
    await clickText('Save', '.dialog');
    await vi.waitFor(() => expect(text('.detail-title')).toBe('Seaside'));
    await vi.waitFor(() => expect($('.dialog')).toBeNull());
    await click(nav('more'));
    await clickText('Delete collection', '.dialog');
    await vi.waitFor(() => expect(text('.dialog h2')).toContain('Delete'));
    await clickText('Delete', '.dialog-actions');
    await vi.waitFor(() => expect(screen()).toContain('home'));
    expect(saved().collections.find((c: { id: string }) => c.id === 'sample-coast')).toBeUndefined();
  });
});

describe('Style', () => {
  const openStyle = async (id = 'sample-coast') => {
    app = await startApp();
    await openCollection(id);
    await click(nav('options'));
    await find('.style-rows');
  };
  const rows = () => $$('.style-rows [data-nav]').map((e) => e.getAttribute('data-nav-id'));
  const value = (row: string) => text(`${nav(row)} .row-value span`);
  const coast = () => saved().collections.find((c: { id: string }) => c.id === 'sample-coast').play;

  it('offers only the choices that matter for the look', async () => {
    await openStyle();
    expect(rows()).toContain('Frame');
    await click(nav('Look'));
    await vi.waitFor(() => expect(value('Look')).toBe('Ken Burns'));
    expect(rows()).not.toContain('Frame');
    expect(rows()).not.toContain('Transition');
  });

  it('cycles through exactly the five looks', async () => {
    await openStyle();
    const seen: string[] = [value('Look')];
    for (let i = 0; i < 4; i++) {
      await click(nav('Look'));
      const before = seen[seen.length - 1];
      await vi.waitFor(() => expect(value('Look')).not.toBe(before));
      seen.push(value('Look'));
    }
    expect(seen).toEqual(['Slideshow', 'Ken Burns', 'Mosaic', 'Duo', 'Memories']);
    expect(coast().order).toBe('date');
  });

  it('applies a frame, previews it, and defaults to filling it', async () => {
    await openStyle();
    await click(nav('Frame'));
    await vi.waitFor(() => expect(coast().frame).not.toBe('none'));
    await find('.preview-stage .moulding');
    expect($$('.preview-stage .moulding')).toHaveLength(4);
    expect(value('Fit')).toBe('Fill the frame');
  });

  it('remembers changes per collection', async () => {
    await openStyle();
    await click(nav('Clock'));
    await vi.waitFor(() => expect(coast().showClock).toBe(true));
    const others = saved().collections.filter((c: { id: string }) => c.id === 'sample-mountains');
    expect(others[0].play.showClock).toBe(false);
  });

  it('calls the caption option Caption', async () => {
    await openStyle();
    expect(rows()).toContain('Caption');
    expect(rows()).not.toContain('Date of each photo');
  });

  it('plays from the button', async () => {
    await openStyle();
    await click(nav('start'));
    await find('.player');
  });
});

describe('Player', () => {
  const play = async (id: string) => {
    app = await startApp();
    await openCollection(id);
    await click(nav('play'));
    await find('.player img');
  };
  const shownSrc = () => $$<HTMLImageElement>('.player img').map((i) => i.getAttribute('src')).pop();

  it('shows the frame and the photo’s label on the mat', async () => {
    await play('sample-masterpieces');
    expect($$('.moulding')).toHaveLength(4);
    expect($('.player')?.className).toContain('player-framed');
    expect(shownSrc()).toContain('samples/masterpieces/');
  });

  it('steps through photos with left and right', async () => {
    await play('sample-coast');
    const first = shownSrc();
    press(KEY.right);
    await vi.waitFor(() => expect(shownSrc()).not.toBe(first));
    press(KEY.left);
    await vi.waitFor(() => expect(shownSrc()).toBe(first));
  });

  it('pauses and resumes with OK', async () => {
    await play('sample-coast');
    press(13);
    await find('.pause-badge');
    press(13);
    await vi.waitFor(() => expect($('.pause-badge')).toBeNull());
  });

  it('changes look with Blue, through every look', async () => {
    await play('sample-coast');
    const seen: string[] = [];
    for (let i = 0; i < 5; i++) {
      press(KEY.blue);
      const before = seen[seen.length - 1];
      const mode = await vi.waitFor(() => {
        const m = /player-(slideshow|kenburns|mosaic|duo|memories)/.exec($('.player')?.className ?? '')?.[1];
        if (!m || m === before) throw new Error('no change yet');
        return m;
      });
      seen.push(mode);
    }
    expect(new Set(seen)).toEqual(new Set(['kenburns', 'mosaic', 'duo', 'memories', 'slideshow']));
  });

  it('fills the mosaic wall', async () => {
    await play('sample-coast');
    press(KEY.blue);
    await vi.waitFor(() => expect($('.player')?.className).toContain('kenburns'));
    press(KEY.blue);
    await vi.waitFor(() => expect($$('.mosaic-tile img').length).toBeGreaterThanOrEqual(7));
  });

  it('skips a photo that will not load', async () => {
    const photos = [
      { id: 's|broken', sourceId: 'samples', key: 'coast/broken.jpg', name: 'broken' },
      { id: 's|ok', sourceId: 'samples', key: 'coast/ok.jpg', name: 'ok' },
    ];
    app = await startApp({ samplesAdded: true, collections: [{ id: 'c', name: 'C', photos, play: {} }] });
    await openCollection('c');
    await click(nav('play'));
    await vi.waitFor(() => expect(shownSrc()).toContain('ok.jpg'));
  });

  it('leaves when none of the photos load', async () => {
    const photos = [{ id: 's|broken', sourceId: 'samples', key: 'coast/broken.jpg', name: 'broken' }];
    app = await startApp({ samplesAdded: true, collections: [{ id: 'c', name: 'C', photos, play: {} }] });
    await openCollection('c');
    await click(nav('play'));
    await vi.waitFor(() => expect(text('.toast')).toContain('None of these photos'));
    expect(screen()).not.toContain('player');
  });

  it('stays pinned: reopening the app goes straight back to it', async () => {
    await play('sample-coast');
    app.close();
    app = await mountApp();
    await find('.player img');
    expect(shownSrc()).toContain('samples/coast/');
    press(KEY.back);
    await vi.waitFor(() => expect(screen()).toContain('home'));
  });
});

describe('Now showing', () => {
  it('comes back when the app returns to the foreground', async () => {
    app = await startApp();
    await openCollection('sample-coast');
    await click(nav('play'));
    await find('.player img');
    press(KEY.back);
    await vi.waitFor(() => expect(screen()).not.toContain('player'));
    document.dispatchEvent(new Event('visibilitychange'));
    await find('.player img');
  });
});

describe('Settings', () => {
  const open = async () => {
    app = await startApp();
    await click(nav('go-settings'));
    await find('.form');
  };

  it('changes how long the menus wait before returning to the photos', async () => {
    await open();
    await click(nav('Back to “now showing” after'));
    await vi.waitFor(() => expect(saved().settings.idleMin).toBe(10));
  });

  it('restores deleted included collections', async () => {
    app = await startApp();
    await openCollection('sample-space');
    await click(nav('more'));
    await clickText('Delete collection', '.dialog');
    await vi.waitFor(() => expect(text('.dialog h2')).toContain('Delete'));
    await clickText('Delete', '.dialog-actions');
    await vi.waitFor(() => expect(screen()).toContain('home'));
    await click(nav('go-settings'));
    await click(nav('Included collections'));
    await vi.waitFor(() => expect(text('.toast')).toContain('Restored 1 collection'));
    expect(saved().collections.some((c: { id: string }) => c.id === 'sample-space')).toBe(true);
  });

  it('credits every included photo', async () => {
    await open();
    await click(nav('Photo credits'));
    await find('.credits-group');
    expect($$('.credits-group')).toHaveLength(7);
    expect(document.body.textContent).toContain('Vincent van Gogh, 1889');
    expect(document.body.textContent).toContain('CC BY-SA 4.0');
  });

  it('no longer asks for a OneDrive app ID', async () => {
    await open();
    expect(document.body.textContent).not.toContain('OneDrive');
  });
});

describe('Sources', () => {
  it('adds a network share after testing it, and browses its folders', async () => {
    const dav = `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">
      <d:response><d:href>/photos/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>
      <d:response><d:href>/photos/Summer/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>
      <d:response><d:href>/photos/a.jpg</d:href><d:propstat><d:prop><d:resourcetype/><d:getcontenttype>image/jpeg</d:getcontenttype></d:prop></d:propstat></d:response>
    </d:multistatus>`;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(dav)));
    app = await startApp();
    await click(nav('go-sources'));
    await click(nav('new-source'));
    await clickText('NAS or network share', '.dialog');
    await type(`${nav('Address')} input`, 'http://nas.local/photos');
    await click(nav('save'));
    await vi.waitFor(() => expect(saved().sources[0]).toMatchObject({ kind: 'network', url: 'http://nas.local/photos' }));
    await vi.waitFor(() => expect(text('.toast')).toContain('Connected'));
  });

  it('reports a share that rejects the password', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })));
    app = await startApp();
    await click(nav('go-sources'));
    await click(nav('new-source'));
    await clickText('NAS or network share', '.dialog');
    await type(`${nav('Address')} input`, 'http://nas.local/photos');
    await click(nav('save'));
    await vi.waitFor(() => expect(text('.form-error')).toContain('user name or password'));
    expect(saved().sources).toHaveLength(0);
  });

  it('removes a source after asking', async () => {
    app = await startApp({ samplesAdded: true, sources: [{ id: 'w', kind: 'web', name: 'Links', urls: ['https://example.com/a.jpg'] }] });
    await click(nav('go-sources'));
    await click(nav('src-w'));
    await clickText('Remove source', '.dialog');
    await vi.waitFor(() => expect(text('.dialog h2')).toContain('Remove Links'));
    await clickText('Remove', '.dialog-actions');
    await vi.waitFor(() => expect(saved().sources).toHaveLength(0));
  });
});
