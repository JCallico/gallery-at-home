import { useEffect, useMemo, useState } from 'preact/hooks';
import { useKeys, useNav } from '../nav/router';
import { createCollection, getCollection, getNowShowing, updateSettings, useStore } from '../store/store';
import { HOME_VIEWS } from '../store/types';
import { AmbientBackdrop } from '../ui/ambient';
import { chooseNewSource } from './sources';
import { Icon } from '../ui/icons';
import { choose, prompt, toast } from '../ui/overlay';
import { coverOf } from './common';
import { sortByName } from './home-order';
import { focusCollection, IndexView, JumpView, NewPoster, ShelvesView, VIEW_LABELS, ViewGlyph, ViewProps, WallView } from './home-views';

// Home is the photos themselves: the focused collection fills the screen as
// a soft backdrop, with its name over it. The collections are arranged in
// one of four layouts (home-views.tsx), chosen with the switch in the top bar.

// Remembered so Back lands on the collection you came from.
let lastFocused: string | null = null;

export function Home() {
  const nav = useNav();
  const collections = useStore((s) => s.collections);
  const view = useStore((s) => s.settings.homeView);
  const sorted = useMemo(() => sortByName(collections), [collections]);
  useStore((s) => s.nowShowing);
  const showing = getNowShowing();
  const [focusedId, setFocusedId] = useState<string | null>(
    () => (lastFocused && getCollection(lastFocused) ? lastFocused : showing?.collectionId ?? sorted[0]?.id ?? null),
  );
  const focus = (id: string | null) => {
    lastFocused = id;
    setFocusedId(id);
  };
  const hero = focusedId ? getCollection(focusedId) : undefined;

  // Switching layouts keeps your place: the collection stays in view.
  useEffect(() => {
    if (focusedId) document.querySelector(`[data-collection-id="${CSS.escape(focusedId)}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [view]);

  useKeys((action) => {
    // Down from the top bar returns to the collection you were on, however
    // far away it is on screen.
    if (action === 'down' && document.activeElement?.closest('.topbar')) return focusCollection(focusedId);
    // Play (or Green) on a focused poster starts it straight away.
    if (action !== 'green' && action !== 'play' && action !== 'playpause') return false;
    if (!hero) return false;
    if (!hero.photos.length) toast('Add some photos first.');
    else nav.push({ name: 'player', id: hero.id });
    return true;
  });

  const create = async () => {
    const how = await choose({
      title: 'New collection',
      options: [
        { value: 'source', label: 'From a new source', hint: 'Google Photos album, NAS or web links; named after it' },
        { value: 'empty', label: 'Empty collection', hint: 'Name it now and add photos from any source' },
      ] as const,
    });
    if (how === 'source') return void chooseNewSource(nav, undefined, true);
    if (how !== 'empty') return;
    const name = await prompt({ title: 'New collection', label: 'Name', value: `Collection ${collections.length + 1}`, confirmLabel: 'Create' });
    if (!name) return;
    const c = createCollection(name);
    lastFocused = c.id;
    nav.push({ name: 'collection', id: c.id });
  };

  const props: ViewProps = { collections, sorted, hero, showing, focus, create, open: (c) => nav.push({ name: 'collection', id: c.id }) };
  return (
    <div class={`screen home home-${view}`}>
      <AmbientBackdrop photo={hero ? coverOf(hero) : null} />

      <div class="topbar">
        <img class="wordmark" src="brand/title.png" alt="Gallery at Home" />
        <div class="topbar-right">
          {collections.length > 0 && (
            <div class="view-switch" role="group" aria-label="Home layout">
              {HOME_VIEWS.map((v) => (
                <button
                  key={v}
                  class={`view-btn ${v === view ? 'on' : ''}`}
                  data-nav
                  data-nav-id={`view-${v}`}
                  aria-label={VIEW_LABELS[v]}
                  aria-pressed={v === view}
                  onClick={() => updateSettings({ homeView: v })}
                >
                  <ViewGlyph view={v} />
                  <span class="view-btn-label">{VIEW_LABELS[v]}</span>
                </button>
              ))}
            </div>
          )}
          <button class="icon-btn" data-nav data-nav-id="go-sources" aria-label="Sources" onClick={() => nav.push({ name: 'sources' })}>
            <Icon name="sources" />
            <span class="icon-btn-label">Sources</span>
          </button>
          <button class="icon-btn" data-nav data-nav-id="go-settings" aria-label="Settings" onClick={() => nav.push({ name: 'settings' })}>
            <Icon name="settings" />
            <span class="icon-btn-label">Settings</span>
          </button>
        </div>
      </div>

      {!collections.length && <Welcome create={create} focus={focus} />}
      {view === 'wall' && collections.length > 0 && <WallView {...props} />}
      {view === 'shelves' && collections.length > 0 && <ShelvesView {...props} />}
      {view === 'index' && collections.length > 0 && <IndexView {...props} />}
      {view === 'jump' && collections.length > 0 && <JumpView {...props} />}
    </div>
  );
}

/** Home with nothing in it yet: there is nothing to arrange, so no layouts. */
function Welcome({ create, focus }: Pick<ViewProps, 'create' | 'focus'>) {
  return (
    <>
      <div class="hero">
        <h1 class="hero-title">Your photos, on the wall.</h1>
        <div class="hero-meta">
          Make a collection from a USB drive, your NAS or the web, then play it framed, as a slideshow
          or as a mosaic.
        </div>
      </div>
      <div class="shelf">
        <div class="shelf-row" data-nav-row>
          <NewPoster focus={focus} create={create} autofocus />
        </div>
      </div>
    </>
  );
}
