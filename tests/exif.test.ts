import { describe, expect, it } from 'vitest';
import { orientationTransform, parseExif, readExif } from '../src/sources/exif';
import { isPortrait, layoutImage } from '../src/ui/photo';

/** A minimal JPEG head: SOI + APP1/Exif with Orientation and DateTimeOriginal. */
function jpeg({ orientation, date, little = true }: { orientation?: number; date?: string; little?: boolean }): ArrayBuffer {
  const tiff = new DataView(new ArrayBuffer(200));
  const w16 = (o: number, v: number) => tiff.setUint16(o, v, little);
  const w32 = (o: number, v: number) => tiff.setUint32(o, v, little);
  tiff.setUint16(0, little ? 0x4949 : 0x4d4d);
  w16(2, 42);
  w32(4, 8);
  // IFD0: orientation, pointer to the Exif IFD.
  w16(8, 2);
  w16(10, 0x0112); w16(12, 3); w32(14, 1); w16(18, orientation ?? 1);
  w16(22, 0x8769); w16(24, 4); w32(26, 1); w32(30, 40);
  // Exif IFD: DateTimeOriginal, stored at offset 60.
  w16(40, date ? 1 : 0);
  if (date) {
    w16(42, 0x9003); w16(44, 2); w32(46, 20); w32(50, 60);
    for (let i = 0; i < date.length; i++) tiff.setUint8(60 + i, date.charCodeAt(i));
  }
  const out = new Uint8Array(2 + 2 + 2 + 6 + 200);
  const head = new DataView(out.buffer);
  head.setUint16(0, 0xffd8);
  head.setUint16(2, 0xffe1);
  head.setUint16(4, 2 + 6 + 200);
  out.set([0x45, 0x78, 0x69, 0x66, 0, 0], 6);
  out.set(new Uint8Array(tiff.buffer), 12);
  return out.buffer;
}

describe('parseExif', () => {
  it('reads orientation and capture date in either byte order', () => {
    for (const little of [true, false]) {
      const info = parseExif(jpeg({ orientation: 6, date: '2019:07:14 18:03:22', little }));
      expect(info.orientation).toBe(6);
      expect(info.takenAt).toBe(new Date(2019, 6, 14, 18, 3, 22).getTime());
    }
  });

  it('treats blank camera dates as unknown', () => {
    expect(parseExif(jpeg({ date: '0000:00:00 00:00:00' })).takenAt).toBeUndefined();
  });

  it('falls back to upright for invalid orientations', () => {
    expect(parseExif(jpeg({ orientation: 42 })).orientation).toBe(1);
  });

  it('copes with files that are not JPEGs, or are truncated', () => {
    expect(parseExif(new ArrayBuffer(2))).toEqual({ orientation: 1 });
    expect(parseExif(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer)).toEqual({ orientation: 1 });
    expect(parseExif(jpeg({ orientation: 6 }).slice(0, 20))).toEqual({ orientation: 1 });
  });
});

describe('readExif', () => {
  it('never rejects, and caches per key', async () => {
    let calls = 0;
    const load = async () => { calls++; throw new Error('offline'); };
    expect(await readExif('exif-test', load)).toEqual({ orientation: 1 });
    await readExif('exif-test', load);
    expect(calls).toBe(1);
  });
});

describe('upright layout', () => {
  it('marks the orientations that swap width and height', () => {
    expect([1, 2, 3, 4].map((o) => orientationTransform(o).swap)).toEqual([false, false, false, false]);
    expect([5, 6, 7, 8].map((o) => orientationTransform(o).swap)).toEqual([true, true, true, true]);
    expect(orientationTransform(6).transform).toBe('rotate(90deg)');
  });

  it('fits a whole photo inside the box', () => {
    const l = layoutImage({ width: 4000, height: 3000 }, { width: 1920, height: 1080 }, 1, 'fit');
    expect(l.width).toBeCloseTo(1440);
    expect(l.height).toBeCloseTo(1080);
  });

  it('fills the box when asked', () => {
    const l = layoutImage({ width: 4000, height: 3000 }, { width: 1920, height: 1080 }, 1, 'fill');
    expect(l.width).toBeCloseTo(1920);
    expect(l.height).toBeCloseTo(1440);
  });

  it('accounts for rotation when sizing a sideways photo', () => {
    // Stored 4000×3000 but rotated: shown 3000 wide by 4000 tall.
    const l = layoutImage({ width: 4000, height: 3000 }, { width: 1920, height: 1080 }, 6, 'fit');
    expect(l.width).toBeCloseTo(1080);
    expect(l.height).toBeCloseTo(810);
    expect(l.transform).toContain('rotate(90deg)');
    expect(isPortrait({ width: 4000, height: 3000 }, 6)).toBe(true);
    expect(isPortrait({ width: 4000, height: 3000 }, 1)).toBe(false);
  });
});
