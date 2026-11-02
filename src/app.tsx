import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { coverTop, dispatchToScreen, entry, Navigator, NavContext, Route, StackEntry } from './nav/router';
import { focusById, focusFirst, moveFocus } from './nav/spatial';
import { keyAction } from './platform/keys';
import { exitApp } from './platform/tizen';
import { AddGooglePhotos } from './screens/add-gphotos';
import { AddNetwork } from './screens/add-network';
import { AddWeb } from './screens/add-web';
import { Browse } from './screens/browse';
import { CollectionScreen } from './screens/collection';
import { CreditsScreen } from './screens/credits';
import { Home } from './screens/home';
import { SettingsScreen } from './screens/settings';
import { SourcesScreen } from './screens/sources';
import { PickSource } from './screens/pick-source';
import { PlaySetup } from './screens/play-setup';
import { Player } from './player/player';
import { getNowShowing, getState } from './store/store';
import { cancelDialog, confirm, isDialogOpen, OverlayHost } from './ui/overlay';

/** The player route for whatever is pinned as "now showing", if anything. */
function nowShowingRoute(): Route | null {
  const now = getNowShowing();
  return now ? { name: 'player', id: now.collectionId, startPhotoId: now.photoId, single: !!now.photoId } : null;
}

function renderRoute(route: Route) {
  switch (route.name) {
    case 'home': return <Home />;
    case 'sources': return <SourcesScreen />;
    case 'settings': return <SettingsScreen />;
    case 'credits': return <CreditsScreen />;
    case 'collection': return <CollectionScreen id={route.id} />;
    case 'play-setup': return <PlaySetup id={route.id} />;
    case 'player': return <Player id={route.id} startPhotoId={route.startPhotoId} single={route.single} settings={route.settings} />;
    case 'pick-source': return <PickSource collectionId={route.collectionId} />;
    case 'browse': return <Browse {...route} />;
    case 'add-network': return <AddNetwork sourceId={route.sourceId} />;
    case 'add-web': return <AddWeb sourceId={route.sourceId} />;
    case 'add-gphotos': return <AddGooglePhotos collectionId={route.collectionId} />;
  }
}

/** Scales the fixed 1920×1080 stage to the window (a no-op on the TV). */
function useStageScale() {
  useLayoutEffect(() => {
    const stage = document.getElementById('stage')!;
    const fit = () => {
      const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
      const x = (window.innerWidth - 1920 * scale) / 2;
      const y = (window.innerHeight - 1080 * scale) / 2;
      stage.style.transform = scale === 1 ? '' : `translate(${x}px, ${y}px) scale(${scale})`;
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
}

/**
 * Brings "now showing" back when the menus sit idle for the configured time,
 * or when the app returns to the foreground — the closest a TV app can get
 * to being the screensaver (Samsung doesn't let apps replace the real one).
 */
function useReturnToNowShowing(stack: StackEntry[], setStack: (fn: (s: StackEntry[]) => StackEntry[]) => void) {
  const lastInput = useRef(Date.now());
  const playing = stack[stack.length - 1].route.name === 'player';
  const playingRef = useRef(playing);
  playingRef.current = playing;

  useEffect(() => {
    const show = () => {
      const route = nowShowingRoute();
      if (!route || playingRef.current) return;
      if (isDialogOpen()) cancelDialog();
      setStack((s) => [...coverTop(s), entry(route)]);
    };
    const onInput = () => {
      lastInput.current = Date.now();
    };
    const tick = setInterval(() => {
      const idleMin = getState().settings.idleMin;
      if (idleMin > 0 && Date.now() - lastInput.current >= idleMin * 60000) {
        lastInput.current = Date.now();
        show();
      }
    }, 10000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        lastInput.current = Date.now();
        show();
      }
    };
    document.addEventListener('keydown', onInput, true);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(tick);
      document.removeEventListener('keydown', onInput, true);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
}

export function App() {
  // Opening the app goes straight to what's pinned; Back reveals the menus.
  const [stack, setStack] = useState<StackEntry[]>(() => {
    const showing = nowShowingRoute();
    return showing ? [entry({ name: 'home' }), entry(showing)] : [entry({ name: 'home' })];
  });
  useStageScale();
  useReturnToNowShowing(stack, setStack);

  const nav = useMemo<Navigator>(
    () => ({
      stack,
      push: (route) => setStack((s) => [...coverTop(s), entry(route)]),
      replace: (route) => setStack((s) => [...s.slice(0, -1), entry(route)]),
      pop: () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)),
      popTo: (name) =>
        setStack((s) => {
          let i = s.length - 2;
          while (i > 0 && s[i].route.name !== name) i--;
          return s.slice(0, i + 1);
        }),
      settleFocus: () => {
        const focusId = stack[stack.length - 1].focusId;
        requestAnimationFrame(() => {
          if (!focusById(focusId)) focusFirst();
        });
      },
    }),
    [stack],
  );

  const top = stack[stack.length - 1];

  // Restore (or establish) focus whenever the visible screen changes.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (!focusById(top.focusId)) focusFirst();
    });
    return () => cancelAnimationFrame(id);
  }, [top.key]);

  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      const action = keyAction(e);
      if (!action) return;
      if (action === 'back' && isDialogOpen()) {
        e.preventDefault();
        cancelDialog();
        return;
      }
      if (!isDialogOpen() && dispatchToScreen(action, e)) {
        e.preventDefault();
        return;
      }
      // Focus can briefly fall to <body> (e.g. a dialog closing as a screen
      // opens; slow TVs take a while to settle). Don't drop the key press:
      // put focus back where it belongs instead.
      const active = document.activeElement;
      if ((!active || active === document.body) && action !== 'back') {
        e.preventDefault();
        if (!focusById(top.focusId)) focusFirst();
        return;
      }
      switch (action) {
        case 'left': case 'right': case 'up': case 'down':
          e.preventDefault();
          moveFocus(action);
          break;
        case 'enter': {
          // Buttons click themselves on Enter; other focusables need help.
          const el = document.activeElement as HTMLElement | null;
          if (el && el.hasAttribute('data-nav') && el.tagName !== 'BUTTON') {
            e.preventDefault();
            el.click();
          }
          break;
        }
        case 'back':
          e.preventDefault();
          if (stack.length > 1) nav.pop();
          else if (await confirm({ title: 'Exit Gallery at Home?', confirmLabel: 'Exit' })) exitApp();
          break;
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [nav, stack.length]);

  return (
    <NavContext.Provider value={nav}>
      <div key={top.key} class="screen-host">
        {renderRoute(top.route)}
      </div>
      <OverlayHost />
    </NavContext.Provider>
  );
}
