import { isSampleCollection } from '../samples';
import { Collection } from '../store/types';

// How Home's layouts order and group the collections.

export function sortByName(list: Collection[]): Collection[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
}

/** The letter a name files under; accents ignored, anything else is '#'. */
export function letterOf(name: string): string {
  const first = name.trim().charAt(0).normalize('NFD').charAt(0).toUpperCase();
  return first >= 'A' && first <= 'Z' ? first : '#';
}

/** The letters in use, in the order they appear in a sorted list. */
export function lettersIn(sorted: Collection[]): string[] {
  const seen: string[] = [];
  for (const c of sorted) {
    const l = letterOf(c.name);
    if (!seen.includes(l)) seen.push(l);
  }
  return seen;
}

/** The first collection of the next (or previous) letter after this one. */
export function letterStep(sorted: Collection[], id: string | null, step: 1 | -1): Collection | undefined {
  const here = sorted.find((c) => c.id === id);
  if (!here) return sorted[0];
  const letters = lettersIn(sorted);
  const target = letters[letters.indexOf(letterOf(here.name)) + step];
  return target ? sorted.find((c) => letterOf(c.name) === target) : undefined;
}

const RECENT_LIMIT = 12;

/** Last played first. */
export function recentlyPlayed(list: Collection[]): Collection[] {
  return list
    .filter((c) => c.playedAt)
    .sort((a, b) => (b.playedAt ?? 0) - (a.playedAt ?? 0))
    .slice(0, RECENT_LIMIT);
}

export interface Shelf {
  id: 'recent' | 'albums' | 'mine' | 'included';
  label: string;
  items: Collection[];
}

/**
 * The rows of the Shelves layout. Empty rows are left out, except "My
 * collections", which holds the New collection tile.
 */
export function shelvesOf(list: Collection[]): Shelf[] {
  const sorted = sortByName(list);
  const included = sorted.filter((c) => isSampleCollection(c.id));
  const albums = sorted.filter((c) => c.albumSourceId);
  const mine = sorted.filter((c) => !c.albumSourceId && !isSampleCollection(c.id));
  const all: Shelf[] = [
    { id: 'recent', label: 'Recently played', items: recentlyPlayed(list) },
    { id: 'albums', label: 'Google Photos albums', items: albums },
    { id: 'mine', label: 'My collections', items: mine },
    { id: 'included', label: 'Included with the app', items: included },
  ];
  return all.filter((s) => s.items.length || s.id === 'mine');
}

/** Up to `count` photos spread evenly through a list, for a quick impression. */
export function spread<T>(items: T[], count: number): T[] {
  if (items.length <= count) return items;
  const out: T[] = [];
  for (let i = 0; i < count; i++) out.push(items[Math.floor((i * items.length) / count)]);
  return out;
}
