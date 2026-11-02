// Normalizes remote-control and keyboard events into a small set of actions.
// Tizen sends its own key codes for Back, media and colour keys; the desktop
// browser equivalents are listed alongside so the app can be driven from a
// keyboard during development.

export type KeyAction =
  | 'left' | 'right' | 'up' | 'down' | 'enter' | 'back' | 'exit'
  | 'playpause' | 'play' | 'pause' | 'stop' | 'next' | 'prev'
  | 'red' | 'green' | 'yellow' | 'blue' | 'info';

const BY_CODE: Record<number, KeyAction> = {
  37: 'left', 38: 'up', 39: 'right', 40: 'down', 13: 'enter',
  10009: 'back', 10182: 'exit',
  10252: 'playpause', 415: 'play', 19: 'pause', 413: 'stop',
  417: 'next', 412: 'prev', 10233: 'next', 10232: 'prev',
  427: 'next', 428: 'prev',
  403: 'red', 404: 'green', 405: 'yellow', 406: 'blue', 457: 'info',
};

// Desktop stand-ins. Backspace only means Back outside text fields.
const BY_KEY: Record<string, KeyAction> = {
  Escape: 'back', Backspace: 'back', ' ': 'playpause',
  MediaPlayPause: 'playpause', MediaTrackNext: 'next', MediaTrackPrevious: 'prev',
  '.': 'next', ',': 'prev', i: 'info',
  '1': 'red', '2': 'green', '3': 'yellow', '4': 'blue',
};

export function keyAction(e: KeyboardEvent): KeyAction | null {
  const inField = isTextField(e.target);
  const byCode = BY_CODE[e.keyCode];
  if (byCode) {
    // Left/right move the caret inside a text field rather than the focus.
    if (inField && (byCode === 'left' || byCode === 'right')) return null;
    return byCode;
  }
  if (inField) return e.key === 'Escape' ? 'back' : null;
  return BY_KEY[e.key] ?? null;
}

export function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLTextAreaElement) return true;
  return target instanceof HTMLInputElement && !['checkbox', 'radio', 'button'].includes(target.type);
}
