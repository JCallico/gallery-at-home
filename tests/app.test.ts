import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { $, $$, albumPage, albumPhoto, type AppHandle, click, clickText, find, KEY, mountApp, nav, press, saved, startApp, stubBrowser, stubNetwork, text, type } from './harness';

let app: AppHandle;

beforeEach(() => {
  stubBrowser();
  stubNetwork();
});
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
    expect(titles).toEqual(['After Dark', 'Coastlines', 'Forests & Waterfalls', 'Masterpieces', 'Mountains', 'Space', 'Still Waters']);
    expect($<HTMLImageElement>('.wordmark')?.alt).toBe('Gallery at Home');
  });

  it('opens on the Jump bar on first run, with a collection focused', async () => {
    app = await startApp();
    await find('.jump-bar');
    expect($(nav('view-jump'))?.getAttribute('aria-pressed')).toBe('true');
    await vi.waitFor(() => expect(document.activeElement?.getAttribute('data-collection-id')).toBe('sample-night'));
    expect(text('.hero-title')).toBe('After Dark');
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

describe('Home layouts', () => {
  const focused = () => document.activeElement?.getAttribute('data-nav-id');
  const pic = (id: string) => ({ id, sourceId: 'samples', key: `coast/${id}.jpg`, name: id });
  const col = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
    id, name, photos: [pic(`${id}-1`), pic(`${id}-2`), pic(`${id}-3`)], createdAt: 1, updatedAt: 1, play: {}, ...extra,
  });
  const library = (homeView: string, extra: Record<string, unknown> = {}) => ({
    samplesAdded: true,
    settings: { homeView },
    collections: [
      col('sp', 'Space'),
      col('al', 'Album', { albumSourceId: 'gp' }),
      col('be', 'Beach', { playedAt: 5 }),
      col('st', 'Still Waters'),
      col('sample-coast', 'Coastlines'),
    ],
    ...extra,
  });

  it('switches layout from the top bar, and remembers it', async () => {
    app = await startApp(library('wall'));
    await find('.home-wall');
    expect($(nav('view-wall'))?.getAttribute('aria-pressed')).toBe('true');
    await click(nav('view-index'));
    await find('.home-index');
    expect($(nav('view-index'))?.getAttribute('aria-pressed')).toBe('true');
    expect($(nav('view-wall'))?.getAttribute('aria-pressed')).toBe('false');
    expect(saved().settings.homeView).toBe('index');
    app.close();
    app = await mountApp();
    await find('.home-index');
  });

  it('has nothing to switch while there are no collections', async () => {
    app = await startApp({ samplesAdded: true, collections: [] });
    await vi.waitFor(() => expect(focused()).toBe('new-collection'));
    expect($('.view-switch')).toBeNull();
    expect(text('.hero-title')).toBe('Your photos, on the wall.');
  });

  it('Down from the top bar returns to the collection you were on', async () => {
    app = await startApp(library('wall'));
    (await find('[data-collection-id="sp"]')).focus();
    (await find(nav('view-shelves'))).focus();
    press(KEY.down);
    expect(document.activeElement?.getAttribute('data-collection-id')).toBe('sp');
  });

  it('Wall counts your place in the A–Z list', async () => {
    app = await startApp(library('wall'));
    (await find('[data-collection-id="sp"]')).focus();
    await vi.waitFor(() => expect(text('.home-count')).toBe('4 of 5 · A–Z'));
    expect(text('.hero-title')).toBe('Space');
    (await find(nav('new-collection'))).focus();
    await vi.waitFor(() => expect(text('.home-count')).toBe('5 collections'));
    expect(text('.hero-title')).toBe('New collection');
  });

  it('Shelves groups them, showing a played collection twice under different ids', async () => {
    app = await startApp(library('shelves'));
    await find('.home-shelves');
    expect($$('.shelves-label .home-kick').map((e) => e.textContent)).toEqual([
      'Recently played', 'Google Photos albums', 'My collections', 'Included with the app',
    ]);
    expect($(nav('recent-be'))).not.toBeNull();
    expect($(nav('col-be'))).not.toBeNull();
    const ids = $$('[data-nav-id]').map((e) => e.getAttribute('data-nav-id'));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('Index jumps a letter with CH▼ and back with CH▲', async () => {
    app = await startApp(library('index'));
    (await find('[data-collection-id="al"]')).focus();
    press(428);
    expect(document.activeElement?.getAttribute('data-collection-id')).toBe('be');
    press(428);
    expect(document.activeElement?.getAttribute('data-collection-id')).toBe('sample-coast');
    press(427);
    expect(document.activeElement?.getAttribute('data-collection-id')).toBe('be');
  });

  it('Index shows letters once per group, and a sharp preview once focus settles', async () => {
    app = await startApp(library('index'));
    await find('.index-row');
    expect($$('.index-letter').map((e) => e.textContent)).toEqual(['A', 'B', 'C', 'S', '', '']);
    await vi.waitFor(() => {
      const sources = $$<HTMLImageElement>('.index-preview img').map((i) => i.getAttribute('src'));
      expect(sources.some((u) => u?.includes('/thumb/'))).toBe(true);
      expect(sources.some((u) => u && !u.includes('/thumb/'))).toBe(true);
      expect($$('.index-strip-photo').length).toBe(2);
    });
  });

  it('Jump bar shows only the letters in use as choices, and leads into the row', async () => {
    app = await startApp(library('jump'));
    await find('.jump-bar');
    expect($$('.jump-letter[data-nav]').map((e) => e.textContent)).toEqual(['A', 'B', 'C', 'S']);
    expect($$('.jump-letter.off').length).toBe(22);
    (await find(nav('jump-S'))).focus();
    await vi.waitFor(() => expect(text('.hero-title')).toBe('Space'));
    expect(text('.home-hints')).toContain('choose a letter');
    press(KEY.down);
    expect(focused()).toBe('col-sp');
    await vi.waitFor(() => expect(text('.home-hints')).toContain('browse'));
    press(KEY.up);
    expect(focused()).toBe('jump-S');
  });

  it('Jump bar shows recents on request, and offers none until something is played', async () => {
    app = await startApp(library('jump'));
    (await find(nav('jump-recent'))).focus();
    await vi.waitFor(() => expect($$('.shelf-row [data-collection-id]').map((e) => e.getAttribute('data-collection-id'))).toEqual(['be']));
    press(KEY.down);
    expect(focused()).toBe('col-be');
    press(KEY.up);
    expect(focused()).toBe('jump-recent');
    app.close();
    app = await startApp(library('jump', { collections: [col('sp', 'Space')] }));
    await find('.jump-bar');
    expect($(nav('jump-recent'))).toBeNull();
    expect($('.jump-recent.off')).not.toBeNull();
  });

  it('playing a collection puts it in Recently played', async () => {
    app = await startApp(library('shelves'));
    (await find(nav('col-sp'))).focus();
    await vi.waitFor(() => expect(text('.hero-title')).toBe('Space'));
    press(KEY.play);
    await find('.player');
    await vi.waitFor(() => expect(saved().collections.find((c: { id: string }) => c.id === 'sp').playedAt).toBeGreaterThan(0));
    press(KEY.back);
    await find(nav('recent-sp'));
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
    stubNetwork(() => new Response(albumPage('Spain 2025', [albumPhoto('a'), albumPhoto('b'), albumPhoto('v', { 76647426: [] })])));
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
    stubNetwork(() => new Response('<html>Sign in</html>'));
    app = await startApp();
    await openForm();
    await type(`${nav('Album link')} input`, 'photos.app.goo.gl/AbC123');
    await click(nav('save'));
    await vi.waitFor(() => expect(text('.form-error')).toContain('Couldn’t read this album'));
  });

  it('from a collection, can instead copy the photos in once', async () => {
    stubNetwork(() => new Response(albumPage('Spain', [albumPhoto('a')])));
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
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const photos = [
      { id: 's|broken', sourceId: 'samples', key: 'coast/broken.jpg', name: 'broken' },
      { id: 's|ok', sourceId: 'samples', key: 'coast/ok.jpg', name: 'ok' },
    ];
    app = await startApp({ samplesAdded: true, collections: [{ id: 'c', name: 'C', photos, play: {} }] });
    await openCollection('c');
    await click(nav('play'));
    await vi.waitFor(() => expect(shownSrc()).toContain('ok.jpg'));
    expect(warned).toHaveBeenCalledWith('Skipping photo', 'broken', expect.any(Error));
  });

  it('leaves when none of the photos load', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
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
  it('leaves the page as it was when the app returns to the foreground', async () => {
    app = await startApp();
    await openCollection('sample-coast');
    await click(nav('play'));
    await find('.player img');
    press(KEY.back);
    await vi.waitFor(() => expect(screen()).not.toContain('player'));
    const page = screen();
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen()).toBe(page);
  });
});

describe('After the TV closes the app in the background', () => {
  const hide = () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
  };
  /** Pins a collection as "now showing", then opens Settings from Home. */
  const pinThenOpenSettings = async () => {
    app = await startApp();
    await openCollection('sample-coast');
    await click(nav('play'));
    await find('.player img');
    press(KEY.back);
    await vi.waitFor(() => expect(screen()).not.toContain('player'));
    press(KEY.back);
    await vi.waitFor(() => expect(screen()).toContain('home'));
    await click(nav('go-settings'));
    await find('.form');
  };
  /** The TV closes the app, and the user opens it again. */
  const closeAndReopen = async () => {
    app.close();
    vi.restoreAllMocks();
    app = await mountApp();
  };

  it('reopens on the page that was open', async () => {
    await pinThenOpenSettings();
    hide();
    await closeAndReopen();
    await find('.form');
    expect($('.player')).toBeNull();
    await vi.waitFor(() => expect(document.activeElement?.getAttribute('data-nav')).not.toBeNull());
    press(KEY.back);
    await vi.waitFor(() => expect(screen()).toContain('home'));
  });

  it('opens on "now showing" once the idle time has passed', async () => {
    await pinThenOpenSettings();
    hide();
    app.close();
    vi.restoreAllMocks();
    const later = Date.now() + 6 * 60000;
    vi.spyOn(Date, 'now').mockReturnValue(later);
    app = await mountApp();
    await find('.player');
  });

  it('opens on "now showing" after leaving through Exit', async () => {
    await pinThenOpenSettings();
    await vi.waitFor(() => expect(document.activeElement?.getAttribute('data-nav')).not.toBeNull());
    press(KEY.back);
    await vi.waitFor(() => expect(screen()).toContain('home'));
    await vi.waitFor(() => expect(document.activeElement?.getAttribute('data-nav')).not.toBeNull());
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    press(KEY.back);
    await clickText('Exit', '.dialog');
    hide();
    await closeAndReopen();
    await find('.player');
  });

  it('opens on "now showing" when the page is gone', async () => {
    app = await startApp();
    await openCollection('sample-coast');
    await find('.collection, .screen');
    hide();
    app.close();
    vi.restoreAllMocks();
    const state = saved();
    state.collections = state.collections.filter((c: { id: string }) => c.id !== 'sample-coast');
    localStorage.setItem('gah.state.v1', JSON.stringify(state));
    app = await mountApp();
    await find('.poster');
    expect(screen()).toContain('home');
  });
});

describe('Idle return to "now showing"', () => {
  const pinThenOpenSettings = async () => {
    app = await startApp();
    await openCollection('sample-coast');
    await click(nav('play'));
    await find('.player img');
    press(KEY.back);
    await vi.waitFor(() => expect(screen()).not.toContain('player'));
    press(KEY.back);
    await vi.waitFor(() => expect(screen()).toContain('home'));
    await click(nav('go-settings'));
    await find('.form');
  };

  afterEach(() => vi.useRealTimers());

  it('happens after the idle time in the menus', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    await pinThenOpenSettings();
    vi.advanceTimersByTime(5 * 60000 + 10000);
    await vi.waitFor(() => expect(screen()).toContain('player'));
  });

  it('doesn’t count time the app spent paused in the background', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    await pinThenOpenSettings();
    // Paused: the clock moves on but no timer runs; then one overdue tick.
    vi.setSystemTime(Date.now() + 10 * 60000);
    vi.advanceTimersByTime(10000);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect($('.form')).not.toBeNull();
    expect($('.player')).toBeNull();
  });
});

describe('Network loss', () => {
  const setOnline = (online: boolean) => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online);
    window.dispatchEvent(new Event(online ? 'online' : 'offline'));
  };

  it('says so, leaves the remote working, and clears on reconnecting', async () => {
    app = await startApp();
    await find('.poster');
    expect($('.network-banner')).toBeNull();
    setOnline(false);
    await find('.network-banner');
    expect(text('.network-banner')).toContain('No network connection');
    await vi.waitFor(() => expect(document.activeElement?.getAttribute('data-nav')).not.toBeNull());
    press(KEY.back);
    await find('.dialog');
    await clickText('Cancel', '.dialog');
    setOnline(true);
    await vi.waitFor(() => expect($('.network-banner')).toBeNull());
  });

  it('says so when the app starts without a network', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    app = await startApp();
    await find('.network-banner');
  });

  it('leaves the picture alone after a moment while photos play', async () => {
    app = await startApp();
    await openCollection('sample-coast');
    await click(nav('play'));
    await find('.player img');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      setOnline(false);
      await vi.waitFor(() => expect($('.network-banner')).not.toBeNull());
      await vi.advanceTimersByTimeAsync(10001);
      await vi.waitFor(() => expect($('.network-banner')).toBeNull());
    } finally {
      vi.useRealTimers();
    }
    press(KEY.back);
    await vi.waitFor(() => expect(screen()).not.toContain('player'));
    await find('.network-banner');
  });

  it('reloads a picture that failed once the network is back', async () => {
    stubNetwork(() => {
      throw new TypeError('Failed to fetch');
    });
    const photo = { id: 'p', sourceId: 'w', key: 'https://x.test/p.jpg', name: 'p', url: 'https://x.test/p.jpg' };
    const { h, render } = await import('preact');
    const { Thumb } = await import('../src/ui/photo');
    const sources = await import('../src/sources');
    const load = vi.spyOn(sources, 'loadThumb').mockRejectedValueOnce(new TypeError('offline')).mockResolvedValue({ url: 'blob:ok', orientation: 1 });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const host = document.createElement('div');
    document.body.append(host);
    render(h(Thumb, { photo }), host);
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(host.querySelector('img')).toBeNull();
    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(host.querySelector('img')?.getAttribute('src')).toBe('blob:ok'));
    render(null, host);
    host.remove();
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
    stubNetwork(() => new Response(dav));
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
    stubNetwork(() => new Response('', { status: 401 }));
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
