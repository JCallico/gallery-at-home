// Picking up where the menus were after the TV closed the app.
//
// TVs close background apps to free memory (since 2017 models), for example
// when another app opens. Reopening the app then starts it afresh, which
// would go straight to "now showing" even though the user only stepped away.
// So the open pages are saved whenever the app goes to the background and
// restored on a fresh start soon after; a resumed app (not closed) just
// carries on. Leaving through the app's own Exit isn't remembered.

import { getCollection, getState } from '../store/store';
import { coverTop, entry, Route, StackEntry } from './router';

const KEY = 'gah.resume.v1';

interface Saved {
  at: number;
  entries: { route: Route; focusId?: string | null }[];
}

let exiting = false;

/** Saves the open pages, with what's focused on the top one. */
export function saveResume(stack: StackEntry[]): void {
  if (exiting) return;
  const saved: Saved = { at: Date.now(), entries: coverTop(stack).map((e) => ({ route: e.route, focusId: e.focusId })) };
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    // Only costs reopening on "now showing".
  }
}

export function clearResume(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing saved, then.
  }
}

/** The user chose to leave: open on "now showing" next time. */
export function markExiting(): void {
  exiting = true;
  clearResume();
}

/** Whether a saved page still has what it shows (a collection can be deleted meanwhile). */
function stillThere(route: Route): boolean {
  switch (route.name) {
    case 'collection':
    case 'play-setup':
    case 'player':
      return !!getCollection(route.id);
    case 'pick-source':
    case 'browse':
      return !!getCollection(route.collectionId);
    case 'add-network':
    case 'add-web':
      return !route.sourceId || getState().sources.some((s) => s.id === route.sourceId);
    case 'add-gphotos':
      return __GOOGLE_PHOTOS__ && (!route.collectionId || !!getCollection(route.collectionId));
    default:
      return true;
  }
}

/**
 * The pages saved when the app last went to the background, if that was less
 * than `withinMs` ago. Read once: a later start opens as usual.
 */
export function takeResume(withinMs: number): StackEntry[] | null {
  let saved: Saved | null = null;
  try {
    saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {
    saved = null;
  }
  clearResume();
  const age = saved ? Date.now() - saved.at : Infinity;
  if (!saved || !Array.isArray(saved.entries) || !(age >= 0 && age < withinMs)) return null;
  const restored: StackEntry[] = [];
  for (const e of saved.entries) {
    if (!e?.route || !stillThere(e.route)) break;
    restored.push({ ...entry(e.route), focusId: e.focusId });
  }
  return restored.length && restored[0].route.name === 'home' ? restored : null;
}
