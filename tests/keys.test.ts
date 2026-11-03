import { describe, expect, it } from 'vitest';
import { isTextField, keyAction } from '../src/platform/keys';

const press = (init: KeyboardEventInit & { keyCode?: number }, target?: HTMLElement) => {
  const e = new KeyboardEvent('keydown', { bubbles: true, ...init });
  (target ?? document.body).dispatchEvent(e);
  return e;
};

describe('keyAction', () => {
  it('maps the TV remote key codes', () => {
    const cases: [number, string][] = [
      [38, 'up'], [13, 'enter'], [10009, 'back'], [10252, 'playpause'],
      [403, 'red'], [404, 'green'], [405, 'yellow'], [406, 'blue'],
    ];
    for (const [keyCode, action] of cases) expect(keyAction(press({ keyCode }))).toBe(action);
  });

  it('maps the desktop stand-ins', () => {
    expect(keyAction(press({ key: 'Escape' }))).toBe('back');
    expect(keyAction(press({ key: '2' }))).toBe('green');
  });

  it('ignores keys it does not know', () => {
    expect(keyAction(press({ key: 'q' }))).toBeNull();
  });

  describe('in a text field', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);

    it('leaves left, right and typing to the field', () => {
      expect(keyAction(press({ keyCode: 37 }, input))).toBeNull();
      expect(keyAction(press({ keyCode: 39 }, input))).toBeNull();
      expect(keyAction(press({ key: 'Backspace' }, input))).toBeNull();
      expect(keyAction(press({ key: '2' }, input))).toBeNull();
    });

    it('still lets the remote leave the field', () => {
      expect(keyAction(press({ keyCode: 10009 }, input))).toBe('back');
      expect(keyAction(press({ key: 'Escape' }, input))).toBe('back');
      expect(keyAction(press({ keyCode: 40 }, input))).toBe('down');
    });
  });
});

describe('isTextField', () => {
  it('knows which elements take typing', () => {
    const make = (type: string) => Object.assign(document.createElement('input'), { type });
    expect(isTextField(make('text'))).toBe(true);
    expect(isTextField(make('password'))).toBe(true);
    expect(isTextField(document.createElement('textarea'))).toBe(true);
    expect(isTextField(make('checkbox'))).toBe(false);
    expect(isTextField(document.createElement('button'))).toBe(false);
    expect(isTextField(null)).toBe(false);
  });
});
