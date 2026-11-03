import { beforeEach, describe, expect, it, vi } from 'vitest';
import { focusFirst, moveFocus } from '../src/nav/spatial';

/** A focusable element at a fixed position (jsdom has no layout). */
function box(id: string, left: number, top: number, width = 100, height = 100, parent: HTMLElement = document.body): HTMLElement {
  const el = document.createElement('button');
  el.setAttribute('data-nav', '');
  el.setAttribute('data-nav-id', id);
  el.getBoundingClientRect = () => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} }) as DOMRect;
  parent.appendChild(el);
  return el;
}
const focused = () => document.activeElement?.getAttribute('data-nav-id');

beforeEach(() => {
  document.body.innerHTML = '';
  Element.prototype.scrollIntoView = vi.fn();
});

describe('moveFocus', () => {
  it('moves to the neighbour in each direction', () => {
    box('a', 0, 0).focus();
    box('right', 200, 0);
    box('below', 0, 200);
    moveFocus('right');
    expect(focused()).toBe('right');
    moveFocus('left');
    expect(focused()).toBe('a');
    moveFocus('down');
    expect(focused()).toBe('below');
  });

  it('prefers the element lined up over a nearer diagonal one', () => {
    box('a', 0, 0).focus();
    box('diagonal', 150, 120);
    box('aligned', 400, 0);
    moveFocus('right');
    expect(focused()).toBe('aligned');
  });

  it('stays put when nothing lies that way', () => {
    box('a', 0, 0).focus();
    box('b', 0, 200);
    expect(moveFocus('left')).toBe(false);
    expect(focused()).toBe('a');
  });

  it('stops at the end of a shelf rather than jumping to the top bar', () => {
    box('top-bar', 1500, 0, 100, 60);
    const shelf = document.createElement('div');
    shelf.setAttribute('data-nav-row', '');
    document.body.appendChild(shelf);
    box('poster-1', 100, 700, 400, 250, shelf);
    box('last-poster', 600, 700, 400, 250, shelf).focus();
    moveFocus('right');
    expect(focused()).toBe('last-poster');
    moveFocus('up');
    expect(focused()).toBe('top-bar');
  });

  it('going down onto a line of buttons lands on the first', () => {
    box('wide-row', 0, 0, 1200, 90).focus();
    box('save', 0, 200, 200, 70);
    box('more', 220, 200, 200, 70);
    box('cancel', 440, 200, 200, 70);
    moveFocus('down');
    expect(focused()).toBe('save');
  });

  it('stays inside an open dialog', () => {
    box('behind', 0, 300).focus();
    const dialog = document.createElement('div');
    dialog.setAttribute('data-nav-scope', '');
    document.body.appendChild(dialog);
    box('ok', 0, 0, 100, 100, dialog);
    box('cancel', 200, 0, 100, 100, dialog);
    focusFirst();
    expect(focused()).toBe('ok');
    moveFocus('down');
    expect(focused()).toBe('ok');
    moveFocus('right');
    expect(focused()).toBe('cancel');
  });

  it('skips disabled and hidden elements', () => {
    box('a', 0, 0).focus();
    const disabled = box('disabled', 150, 0) as HTMLButtonElement;
    disabled.disabled = true;
    box('hidden', 300, 0, 0, 0);
    box('far', 600, 0);
    moveFocus('right');
    expect(focused()).toBe('far');
  });
});

describe('focusFirst', () => {
  it('honours the autofocus marker', () => {
    box('first', 0, 0);
    box('wanted', 200, 0).setAttribute('data-nav-autofocus', 'true');
    focusFirst();
    expect(focused()).toBe('wanted');
  });
});
