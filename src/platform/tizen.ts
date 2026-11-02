// Thin wrappers over the Tizen / Samsung webapis globals. Every function
// degrades to a no-op (or a dev fallback) when running in a desktop browser.

declare global {
  interface Window {
    tizen?: any;
    webapis?: any;
  }
}

export const isTizen = typeof window.tizen !== 'undefined';

const MEDIA_KEYS = [
  'MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop',
  'MediaFastForward', 'MediaRewind', 'MediaTrackPrevious', 'MediaTrackNext',
  'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue',
  'ChannelUp', 'ChannelDown', 'Info',
];

export function registerRemoteKeys(): void {
  if (!isTizen) return;
  for (const key of MEDIA_KEYS) {
    try {
      window.tizen.tvinputdevice.registerKey(key);
    } catch {
      // Not every model exposes every key; ignore the ones it rejects.
    }
  }
}

/** Keeps the TV's own screensaver away while a slideshow is on screen. */
export function setScreenSaverAllowed(allowed: boolean): void {
  const appcommon = window.webapis?.appcommon;
  if (!appcommon) return;
  try {
    const state = appcommon.AppCommonScreenSaverState;
    appcommon.setScreenSaver(allowed ? state.SCREEN_SAVER_ON : state.SCREEN_SAVER_OFF);
  } catch (err) {
    console.warn('setScreenSaver failed', err);
  }
}

export function exitApp(): void {
  if (isTizen) {
    window.tizen.application.getCurrentApplication().exit();
  } else {
    console.info('[dev] exitApp() called');
  }
}

export function hideApp(): void {
  if (isTizen) window.tizen.application.getCurrentApplication().hide();
}

/** Asks for a runtime (privacy) privilege on Tizen 5+. Resolves true if granted. */
export function requestPrivilege(privilege: string): Promise<boolean> {
  const ppm = window.tizen?.ppm;
  if (!ppm) return Promise.resolve(true);
  try {
    const status = ppm.checkPermission(privilege);
    if (status === 'PPM_ALLOW') return Promise.resolve(true);
    return new Promise((resolve) => {
      ppm.requestPermission(
        privilege,
        (result: string) => resolve(result === 'PPM_ALLOW_FOREVER' || result === 'PPM_ALLOW_ONCE'),
        () => resolve(false),
      );
    });
  } catch {
    // Older firmware without ppm for this privilege: assume the manifest grant.
    return Promise.resolve(true);
  }
}
