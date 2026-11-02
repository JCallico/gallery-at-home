import { createContext } from 'preact';
import { useContext, useEffect, useRef } from 'preact/hooks';
import { KeyAction } from '../platform/keys';
import { PlaySettings } from '../store/types';
import { currentNavId } from './spatial';

export type Route =
  | { name: 'home' }
  | { name: 'sources' }
  | { name: 'settings' }
  | { name: 'credits' }
  | { name: 'collection'; id: string }
  | { name: 'play-setup'; id: string }
  /** `single` shows just startPhotoId (a pinned picture) instead of the collection. */
  | { name: 'player'; id: string; startPhotoId?: string; single?: boolean; settings?: PlaySettings }
  | { name: 'pick-source'; collectionId: string }
  | { name: 'browse'; collectionId: string; sourceId: string; folderKey: string | null; trail: string[] }
  | { name: 'add-network'; sourceId?: string }
  | { name: 'add-web'; sourceId?: string }
  | { name: 'add-onedrive' };


export interface StackEntry {
  route: Route;
  /** Focused element when this entry was covered, restored on return. */
  focusId?: string | null;
  key: number;
}

export interface Navigator {
  push(route: Route): void;
  replace(route: Route): void;
  pop(): void;
  /** Pops back to the nearest entry matching `name` (or home). */
  popTo(name: Route['name']): void;
  /**
   * For screens whose content arrives asynchronously: once it's rendered,
   * focus what was focused before (when returning) or the default item.
   */
  settleFocus(): void;
  stack: StackEntry[];
}

export const NavContext = createContext<Navigator>(null as unknown as Navigator);

export function useNav(): Navigator {
  return useContext(NavContext);
}

let nextKey = 1;
export function entry(route: Route): StackEntry {
  return { route, key: nextKey++ };
}

export function coverTop(stack: StackEntry[]): StackEntry[] {
  const top = stack[stack.length - 1];
  return [...stack.slice(0, -1), { ...top, focusId: currentNavId() }];
}

// --- Per-screen key handling -------------------------------------------------

type KeyHandler = (action: KeyAction, e: KeyboardEvent) => boolean;
const handlers: KeyHandler[] = [];

/** Lets the mounted screen intercept keys first; return true when handled. */
export function useKeys(handler: KeyHandler): void {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    const fn: KeyHandler = (a, e) => latest.current(a, e);
    handlers.push(fn);
    return () => {
      handlers.splice(handlers.indexOf(fn), 1);
    };
  }, []);
}

export function dispatchToScreen(action: KeyAction, e: KeyboardEvent): boolean {
  for (let i = handlers.length - 1; i >= 0; i--) {
    if (handlers[i](action, e)) return true;
  }
  return false;
}
