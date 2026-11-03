import { describe, expect, it } from 'vitest';
import { screenFrameLayout } from '../src/player/frame';
import { effectiveFrame, FRAME_OPTIONS, FRAMES } from '../src/player/frames';
import { DEFAULT_PLAY, type FrameStyle } from '../src/store/types';

const STAGE = { width: 1920, height: 1080 };
const styles = Object.keys(FRAMES) as (keyof typeof FRAMES)[];

describe('effectiveFrame', () => {
  it('applies the chosen frame where framing is offered', () => {
    expect(effectiveFrame({ ...DEFAULT_PLAY, mode: 'slideshow', frame: 'oak' })).toBe('oak');
    expect(effectiveFrame({ ...DEFAULT_PLAY, mode: 'memories', frame: 'gold' })).toBe('gold');
  });

  it('leaves the full-screen looks unframed', () => {
    for (const mode of ['kenburns', 'mosaic', 'duo'] as const) {
      expect(effectiveFrame({ ...DEFAULT_PLAY, mode, frame: 'oak' })).toBe('none');
    }
  });

  it('offers no frame plus every style', () => {
    expect(FRAME_OPTIONS.map((o) => o.value)).toEqual<FrameStyle[]>(['none', ...styles]);
  });
});

describe('screenFrameLayout', () => {
  it.each(styles)('centres the photo vertically when there is no label: %s', (style) => {
    const { area } = screenFrameLayout(style, false);
    const below = STAGE.height - (area.top + area.height);
    expect(below).toBe(area.top);
  });

  it.each(styles)('keeps a band for the label only when there is one: %s', (style) => {
    const withLabel = screenFrameLayout(style, true).area;
    const without = screenFrameLayout(style, false).area;
    expect(withLabel.height).toBeLessThan(without.height);
    expect(withLabel.top).toBe(without.top);
  });

  it.each(styles)('keeps the opening large and inside the mat: %s', (style) => {
    const { area, border } = screenFrameLayout(style, false);
    expect(area.left).toBeGreaterThan(border);
    expect(area.left + area.width).toBeLessThan(STAGE.width);
    // "Make the pictures cover most of the inside of the frame."
    const inside = (STAGE.width - 2 * border) * (STAGE.height - 2 * border);
    expect((area.width * area.height) / inside).toBeGreaterThan(0.75);
  });

  it('uses readable ink on the dark floating mat', () => {
    expect(screenFrameLayout('floating').ink).toBe('light');
    expect(screenFrameLayout('oak').ink).toBe('dark');
  });
});
