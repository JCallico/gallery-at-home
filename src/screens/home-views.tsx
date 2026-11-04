import { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useKeys } from '../nav/router';
import { focusById, focusElement } from '../nav/spatial';
import { Collection, HomeView, NowShowing } from '../store/types';
import { Icon } from '../ui/icons';
import { Thumb } from '../ui/photo';
import { coverOf, plural, Poster, styleSummary } from './common';
import { letterOf, lettersIn, letterStep, recentlyPlayed, shelvesOf, spread } from './home-order';

// Home's four layouts for finding a collection. Home owns which collection
// has the focus; each layout only arranges them.

export interface ViewProps {
  collections: Collection[];
  /** The same collections, A to Z. */
  sorted: Collection[];
  /** The focused collection; undefined on the New collection tile. */
  hero: Collection | undefined;
  showing: NowShowing | null;
  focus(id: string | null): void;
  open(c: Collection): void;
  create(): void;
}

export const VIEW_LABELS: Record<HomeView, string> = {
  wall: 'Wall',
  shelves: 'Shelves',
  index: 'Index',
  jump: 'Jump bar',
};

/** A small picture of each layout, for the switch in the top bar. */
export function ViewGlyph({ view }: { view: HomeView }) {
  const r = (x: number, y: number, w: number, h: number) => <rect x={x} y={y} width={w} height={h} rx="1.2" />;
  return (
    <svg viewBox="0 0 36 24" fill="currentColor" aria-hidden="true">
      {view === 'wall' && [0, 8.67, 17.33].map((y) => [0, 9.33, 18.67, 28].map((x) => <g key={`${x}-${y}`}>{r(x, y, 8, 6.67)}</g>))}
      {view === 'shelves' && [0, 12.5].map((y) => (
        <g key={y}>
          {r(0, y, 8, 1.8)}
          {r(0, y + 3, 11, 8)}
          {r(12.5, y + 3, 11, 8)}
          {r(25, y + 3, 11, 8)}
        </g>
      ))}
      {view === 'index' && (
        <>
          {[0, 6.3, 12.6, 18.9].map((y) => <g key={y}>{r(0, y, 12, 5.1)}</g>)}
          {r(15, 0, 21, 24)}
        </>
      )}
      {view === 'jump' && (
        <>
          {[0, 5.2, 10.4, 15.6, 20.8, 26, 31.2].map((x) => <g key={x}>{r(x, 0, 4, 5)}</g>)}
          {r(0, 9, 16.5, 15)}
          {r(19.5, 9, 16.5, 15)}
        </>
      )}
    </svg>
  );
}

/** Moves focus to a collection wherever the layout shows it first. */
export function focusCollection(id: string | null | undefined): boolean {
  if (!id) return focusById('new-collection');
  return focusElement(document.querySelector<HTMLElement>(`[data-collection-id="${CSS.escape(id)}"]`));
}

const showingLine = (p: ViewProps) => !!p.hero && p.showing?.collectionId === p.hero.id;

function heroMeta(c: Collection): string {
  return c.photos.length ? `${plural(c.photos.length, 'photo')} · ${styleSummary(c.play)}` : 'No photos yet';
}

const NEW_HINT = 'Gather photos from a USB drive, your NAS or the web.';

export function NewPoster({ focus, create, autofocus }: { focus: ViewProps['focus']; create: () => void; autofocus?: boolean }) {
  return (
    <button class="poster poster-new" data-nav data-nav-id="new-collection" data-nav-autofocus={autofocus || undefined} onFocus={() => focus(null)} onClick={create}>
      <div class="poster-art">
        <Icon name="plus" />
        <span>New collection</span>
      </div>
    </button>
  );
}

function Hints({ children }: { children: ComponentChildren }) {
  return <div class="hero-hint home-hints">{children}</div>;
}

const Hint = ({ k, label }: { k: string; label: string }) => (
  <>
    <b>{k}</b> {label} <span class="sep" />
  </>
);

// --- Wall: every collection in a grid ----------------------------------------

export function WallView(p: ViewProps) {
  const at = p.hero ? p.sorted.indexOf(p.hero) + 1 : 0;
  return (
    <>
      <div class="wall-head">
        <h1 class="hero-title">{p.hero?.name ?? 'New collection'}</h1>
        <div class={`wall-meta ${showingLine(p) ? 'now' : ''}`}>
          {p.hero ? `${showingLine(p) ? 'Now showing · ' : ''}${heroMeta(p.hero)}` : NEW_HINT}
        </div>
      </div>
      <div class="wall-scroll">
        <div class="wall-grid" data-nav-row>
          {p.sorted.map((c) => (
            <Poster
              key={c.id}
              collection={c}
              navId={`col-${c.id}`}
              showing={p.showing?.collectionId === c.id}
              autofocus={c === p.hero}
              onFocus={() => p.focus(c.id)}
              onClick={() => p.open(c)}
            />
          ))}
          <NewPoster focus={p.focus} create={p.create} />
        </div>
      </div>
      <div class="wall-fade" />
      <Hints>
        <Hint k="OK" label="open" />
        <Hint k="▶" label="play" />
        <Hint k="▲▼" label="one row at a time" />
      </Hints>
      <div class="home-count">{at ? `${at} of ${p.sorted.length} · A–Z` : `${p.sorted.length} collections`}</div>
    </>
  );
}

// --- Shelves: rows that fill themselves --------------------------------------

export function ShelvesView(p: ViewProps) {
  const shelves = useMemo(() => shelvesOf(p.collections), [p.collections]);
  return (
    <>
      <div class="shelves-head">
        <h1 class="hero-title">{p.hero?.name ?? 'New collection'}</h1>
        <div class="hero-meta">{p.hero ? heroMeta(p.hero) : NEW_HINT}</div>
      </div>
      <div class="shelves-scroll">
        {shelves.map((shelf) => (
          <div class="shelves-section" key={shelf.id}>
            <div class="shelves-label">
              <span class="home-kick">{shelf.label}</span>
              {shelf.id !== 'recent' && <span class="shelves-count">{shelf.items.length}</span>}
            </div>
            <div class="shelves-row" data-nav-row>
              {shelf.items.map((c) => (
                <Poster
                  key={c.id}
                  collection={c}
                  // A recently played collection is also on its own shelf.
                  navId={`${shelf.id === 'recent' ? 'recent' : 'col'}-${c.id}`}
                  showing={p.showing?.collectionId === c.id}
                  autofocus={c === p.hero}
                  onFocus={() => p.focus(c.id)}
                  onClick={() => p.open(c)}
                />
              ))}
              {shelf.id === 'mine' && <NewPoster focus={p.focus} create={p.create} />}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// --- Index: an A–Z list beside a large preview -------------------------------

/** The value, once it has stopped changing: holding ▼ shouldn't load every photo on the way. */
function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}

export function IndexView(p: ViewProps) {
  // CH▲ goes up the list and CH▼ down it, as the arrows do; the other
  // next/previous keys (and , . on a keyboard) follow suit.
  useKeys((action, e) => {
    if (action !== 'next' && action !== 'prev') return false;
    const down = e.keyCode === 428 || (e.keyCode !== 427 && action === 'next');
    // From the focused row, not the hero: pressed quickly, keys outrun the redraw.
    const here = document.activeElement?.getAttribute('data-collection-id') ?? p.hero?.id ?? null;
    const target = letterStep(p.sorted, here, down ? 1 : -1);
    if (target) focusCollection(target.id);
    return true;
  });
  const settled = useSettled(p.hero, 300);
  const cover = p.hero && coverOf(p.hero);
  const strip = settled ? spread(settled.photos.filter((x) => x.id !== coverOf(settled)?.id), 4) : [];
  let lastLetter = '';
  return (
    <>
      <div class="index-head home-kick">{plural(p.sorted.length, 'collection')}</div>
      <div class="index-list" data-nav-row>
        {p.sorted.map((c) => {
          const letter = letterOf(c.name);
          const first = letter !== lastLetter;
          lastLetter = letter;
          const art = coverOf(c);
          return (
            <button
              key={c.id}
              class="index-row"
              data-nav
              data-nav-id={`col-${c.id}`}
              data-collection-id={c.id}
              data-nav-autofocus={c === p.hero || undefined}
              onFocus={() => p.focus(c.id)}
              onClick={() => p.open(c)}
            >
              <span class="index-letter">{first ? letter : ''}</span>
              <span class="index-art">{art ? <Thumb photo={art} /> : <Icon name="image" />}</span>
              <span class="index-name">{c.name}</span>
              {p.showing?.collectionId === c.id && <span class="index-now" />}
              <span class="index-size">{c.photos.length.toLocaleString()}</span>
            </button>
          );
        })}
        <button class="index-row" data-nav data-nav-id="new-collection" onFocus={() => p.focus(null)} onClick={p.create}>
          <span class="index-letter" />
          <span class="index-art"><Icon name="plus" /></span>
          <span class="index-name">New collection</span>
        </button>
      </div>
      <div class="index-panel">
        <div class="index-preview">
          {cover && <Thumb key={cover.id} photo={cover} />}
          {cover && settled === p.hero && <Thumb key={`full-${cover.id}`} photo={cover} full />}
          {!cover && <div class="poster-empty"><Icon name={p.hero ? 'image' : 'plus'} /></div>}
        </div>
        <h1 class="hero-title">{p.hero?.name ?? 'New collection'}</h1>
        <div class="hero-meta">
          {p.hero ? `${showingLine(p) ? 'Now showing · ' : ''}${heroMeta(p.hero)}` : NEW_HINT}
        </div>
        <div class="index-strip">
          {strip.map((photo) => (
            <span class="index-strip-photo" key={photo.id}><Thumb photo={photo} /></span>
          ))}
        </div>
      </div>
      <Hints>
        <Hint k="OK" label="open" />
        <Hint k="▶" label="play" />
        <Hint k="CH ▲▼" label="next letter" />
      </Hints>
    </>
  );
}

// --- Jump bar: recents and letters above one row of large posters ------------

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// Kept so Back returns to the row you were looking at.
let lastRow: 'all' | 'recent' = 'all';

export function JumpView(p: ViewProps) {
  const recent = useMemo(() => recentlyPlayed(p.collections), [p.collections]);
  const [rowMode, setRowModeState] = useState<'all' | 'recent'>(() =>
    lastRow === 'recent' && recent.some((c) => c === p.hero) ? 'recent' : 'all',
  );
  const setRowMode = (mode: 'all' | 'recent') => {
    lastRow = mode;
    setRowModeState(mode);
  };
  const [inBar, setInBar] = useState(false);
  // A new object each time, so returning to the same letter scrolls again.
  const [jumpTo, setJumpTo] = useState<{ id: string } | null>(null);
  const row = useRef<HTMLDivElement>(null);
  const items = rowMode === 'recent' ? recent : p.sorted;
  const present = lettersIn(p.sorted);
  const letters = present.includes('#') ? ['#', ...ALPHABET] : ALPHABET;
  const current = rowMode === 'all' && p.hero ? letterOf(p.hero.name) : null;

  // Show the chosen letter's collections at the start of the row.
  useLayoutEffect(() => {
    if (!jumpTo || !row.current) return;
    const el = row.current.querySelector<HTMLElement>(`[data-collection-id="${CSS.escape(jumpTo.id)}"]`);
    row.current.scrollLeft = el ? el.offsetLeft - 96 : 0;
  }, [jumpTo]);

  const choose = (mode: 'all' | 'recent', first: Collection) => {
    setRowMode(mode);
    setInBar(true);
    p.focus(first.id);
    setJumpTo({ id: first.id });
  };

  const chipId = () => (rowMode === 'recent' ? 'jump-recent' : `jump-${current ?? present[present.length - 1]}`);

  // The row and the bar lead to each other, whatever lines up on screen.
  useKeys((action) => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return false;
    if (action === 'down' && el.closest('.topbar')) return focusById(chipId());
    if (action === 'down' && el.closest('.jump-bar')) return focusCollection(p.hero?.id);
    if (action === 'up' && el.closest('.shelf-row')) return focusById(chipId());
    return false;
  });

  return (
    <>
      <div class="hero">
        {showingLine(p) && (
          <div class="hero-kicker now">
            <span class="dot" /> Now showing on this TV{p.showing?.photoId ? ' · one photo' : ''}
          </div>
        )}
        <h1 class="hero-title">{p.hero?.name ?? 'New collection'}</h1>
        <div class="hero-meta">{p.hero ? heroMeta(p.hero) : NEW_HINT}</div>
      </div>
      <div class="jump-bar" data-nav-row>
        {recent.length ? (
          <button
            class={`jump-recent ${rowMode === 'recent' ? 'on' : ''}`}
            data-nav
            data-nav-id="jump-recent"
            onFocus={() => choose('recent', recent[0])}
            onClick={() => focusCollection(recent[0].id)}
          >
            Recent
          </button>
        ) : (
          <span class="jump-recent off">Recent</span>
        )}
        {letters.map((l) => {
          const first = p.sorted.find((c) => letterOf(c.name) === l);
          if (!first) return <span class="jump-letter off" key={l}>{l}</span>;
          return (
            <button
              key={l}
              class={`jump-letter ${current === l ? 'on' : ''}`}
              data-nav
              data-nav-id={`jump-${l}`}
              onFocus={() => choose('all', first)}
              onClick={() => focusCollection(first.id)}
            >
              {l}
            </button>
          );
        })}
      </div>
      <div class="shelf">
        <div class="shelf-row" data-nav-row ref={row}>
          {items.map((c) => (
            <Poster
              key={c.id}
              collection={c}
              navId={`col-${c.id}`}
              showing={p.showing?.collectionId === c.id}
              autofocus={c === p.hero}
              onFocus={() => {
                setInBar(false);
                p.focus(c.id);
              }}
              onClick={() => p.open(c)}
            />
          ))}
          <NewPoster focus={p.focus} create={p.create} />
        </div>
      </div>
      <Hints>
        {inBar ? <Hint k="◀ ▶" label="choose a letter" /> : <Hint k="◀ ▶" label="browse" />}
        {inBar ? <Hint k="▼" label="into the row" /> : <Hint k="▲" label="letters" />}
        <Hint k="▶" label="play" />
      </Hints>
      {p.hero && <div class="home-count">{p.sorted.indexOf(p.hero) + 1} of {p.sorted.length}</div>}
    </>
  );
}
