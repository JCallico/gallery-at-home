import { describe, expect, it } from 'vitest';
import { needsDates, orderPhotos, pickMemories, shuffle, yearsAgo } from '../src/player/order';
import { DEFAULT_PLAY, type PhotoRef } from '../src/store/types';

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime();
const ref = (name: string, takenAt?: number): PhotoRef => ({ id: name, sourceId: 's', key: name, name, takenAt });
const names = (list: PhotoRef[]) => list.map((p) => p.name);

describe('orderPhotos', () => {
  const photos = [ref('IMG_10', at(2021, 1, 1)), ref('IMG_2', at(2019, 1, 1)), ref('none')];

  it('keeps the order photos were added', () => {
    expect(names(orderPhotos(photos, { ...DEFAULT_PLAY, order: 'added' }))).toEqual(['IMG_10', 'IMG_2', 'none']);
  });

  it('sorts by date, undated last', () => {
    expect(names(orderPhotos(photos, { ...DEFAULT_PLAY, order: 'date' }))).toEqual(['IMG_2', 'IMG_10', 'none']);
  });

  it('sorts file names numerically', () => {
    expect(names(orderPhotos(photos, { ...DEFAULT_PLAY, order: 'name' }))).toEqual(['IMG_2', 'IMG_10', 'none']);
  });

  it('does not reorder the collection itself', () => {
    const before = names(photos);
    orderPhotos(photos, { ...DEFAULT_PLAY, order: 'date' });
    expect(names(photos)).toEqual(before);
  });

  it('shuffles without losing or adding photos', () => {
    const list = Array.from({ length: 50 }, (_, i) => i);
    const out = shuffle(list);
    expect(out.slice().sort((a, b) => a - b)).toEqual(list);
    expect(list[0]).toBe(0);
  });
});

describe('needsDates', () => {
  it('is true only when dates decide what plays', () => {
    expect(needsDates({ ...DEFAULT_PLAY, mode: 'memories' })).toBe(true);
    expect(needsDates({ ...DEFAULT_PLAY, order: 'date' })).toBe(true);
    expect(needsDates(DEFAULT_PLAY)).toBe(false);
  });
});

describe('pickMemories', () => {
  const now = new Date(2026, 5, 15, 12);

  it('prefers this exact day in past years', () => {
    const picked = pickMemories([ref('day', at(2020, 6, 15)), ref('week', at(2021, 6, 13))], now);
    expect(picked.title).toBe('On this day');
    expect(names(picked.photos)).toEqual(['day']);
  });

  it('widens the window until something matches', () => {
    expect(pickMemories([ref('week', at(2021, 6, 13))], now).title).toBe('This week in past years');
    expect(pickMemories([ref('month', at(2021, 6, 1))], now).title).toBe('This month in past years');
    expect(pickMemories([ref('season', at(2021, 7, 20))], now).title).toBe('This season in past years');
  });

  it('ignores photos from this year', () => {
    const picked = pickMemories([ref('now', at(2026, 6, 15))], now);
    expect(picked.title).toContain('No memories');
  });

  it('wraps around the new year', () => {
    const picked = pickMemories([ref('dec', at(2020, 12, 30))], new Date(2026, 0, 1, 12));
    expect(picked.title).toBe('This week in past years');
  });

  it('still shows something when nothing is dated', () => {
    const picked = pickMemories([ref('a')], now);
    expect(picked.title).toContain('no dates');
    expect(names(picked.photos)).toEqual(['a']);
  });
});

describe('yearsAgo', () => {
  const now = new Date(2026, 5, 15);
  it('reads naturally', () => {
    expect(yearsAgo(at(2026, 1, 1), now)).toBe('This year');
    expect(yearsAgo(at(2025, 1, 1), now)).toBe('1 year ago');
    expect(yearsAgo(at(2019, 1, 1), now)).toBe('7 years ago');
  });
});
