import { useState } from 'preact/hooks';
import { useKeys, useNav } from '../nav/router';
import { createCollection, getCollection, getNowShowing, useStore } from '../store/store';
import { AmbientBackdrop } from '../ui/ambient';
import { Icon } from '../ui/icons';
import { prompt, toast } from '../ui/overlay';
import { coverOf, plural, Poster, styleSummary, timeLabel, useClock } from './common';

// Home is the photos themselves: the focused collection fills the screen as
// a soft backdrop, its name large over it, and one row of posters below.

// Remembered so Back lands on the collection you came from.
let lastFocused: string | null = null;

export function Home() {
  const nav = useNav();
  const collections = useStore((s) => s.collections);
  useStore((s) => s.nowShowing);
  const showing = getNowShowing();
  const clock = useClock();
  const [focusedId, setFocusedId] = useState<string | null>(
    () => lastFocused ?? showing?.collectionId ?? collections[0]?.id ?? null,
  );
  const focus = (id: string | null) => {
    lastFocused = id;
    setFocusedId(id);
  };
  const hero = focusedId ? getCollection(focusedId) : undefined;

  // Play (or Green) on a focused poster starts it straight away.
  useKeys((action) => {
    if (action !== 'green' && action !== 'play' && action !== 'playpause') return false;
    if (!hero) return false;
    if (!hero.photos.length) toast('Add some photos first.');
    else nav.push({ name: 'player', id: hero.id });
    return true;
  });

  const create = async () => {
    const name = await prompt({ title: 'New collection', label: 'Name', value: `Collection ${collections.length + 1}`, confirmLabel: 'Create' });
    if (!name) return;
    const c = createCollection(name);
    lastFocused = c.id;
    nav.push({ name: 'collection', id: c.id });
  };

  const heroShowing = hero && showing?.collectionId === hero.id;
  return (
    <div class="screen home">
      <AmbientBackdrop photo={hero ? coverOf(hero) : null} />

      <div class="topbar">
        <img class="wordmark" src="brand/title.png" alt="Gallery at Home" />
        <div class="topbar-right">
          <span class="topbar-clock">{timeLabel(clock)}</span>
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

      <div class="hero">
        {hero ? (
          <>
            {heroShowing && (
              <div class="hero-kicker now">
                <span class="dot" /> Now showing on this TV{showing!.photoId ? ' · one photo' : ''}
              </div>
            )}
            <h1 class="hero-title">{hero.name}</h1>
            <div class="hero-meta">
              {hero.photos.length ? `${plural(hero.photos.length, 'photo')} · ${styleSummary(hero.play)}` : 'No photos yet'}
            </div>
            <div class="hero-hint">
              <b>OK</b> open <span class="sep" /> <b>▶</b> {heroShowing ? 'resume' : 'play on the TV'}
            </div>
          </>
        ) : collections.length ? (
          <>
            <h1 class="hero-title">New collection</h1>
            <div class="hero-meta">Gather photos from a USB drive, OneDrive, your NAS or the web.</div>
          </>
        ) : (
          <>
            <h1 class="hero-title">Your photos, on the wall.</h1>
            <div class="hero-meta">
              Make a collection from a USB drive, OneDrive, your NAS or the web, then play it framed, as a slideshow
              or as a mosaic.
            </div>
          </>
        )}
      </div>

      <div class="shelf">
        <div class="shelf-row" data-nav-row>
          {collections.map((c) => (
            <Poster
              key={c.id}
              collection={c}
              navId={`col-${c.id}`}
              showing={showing?.collectionId === c.id}
              autofocus={c.id === focusedId}
              onFocus={() => focus(c.id)}
              onClick={() => nav.push({ name: 'collection', id: c.id })}
            />
          ))}
          <button
            class="poster poster-new"
            data-nav
            data-nav-id="new-collection"
            data-nav-autofocus={!collections.length || undefined}
            onFocus={() => focus(null)}
            onClick={create}
          >
            <div class="poster-art">
              <Icon name="plus" />
              <span>New collection</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
