import { describe, expect, it } from 'vitest';
import { letterOf, lettersIn, letterStep, recentlyPlayed, shelvesOf, sortByName, spread } from '../src/screens/home-order';
import { Collection, DEFAULT_PLAY } from '../src/store/types';

const col = (id: string, name: string, extra: Partial<Collection> = {}): Collection => ({
  id, name, photos: [], createdAt: 0, updatedAt: 0, play: DEFAULT_PLAY, ...extra,
});
const names = (list: Collection[]) => list.map((c) => c.name);

describe('sortByName', () => {
  it('ignores case and puts numbers in counting order, leaving the original alone', () => {
    const list = [col('1', 'beach'), col('2', 'Trip 10'), col('3', 'Trip 9'), col('4', 'Attic')];
    expect(names(sortByName(list))).toEqual(['Attic', 'beach', 'Trip 9', 'Trip 10']);
    expect(list[0].name).toBe('beach');
  });
});

describe('letterOf', () => {
  it('files accented names under their plain letter', () => {
    expect(letterOf('Émile')).toBe('E');
    expect(letterOf('  ñandú')).toBe('N');
  });

  it('files everything else under #', () => {
    expect(letterOf('2019 trip')).toBe('#');
    expect(letterOf('写真')).toBe('#');
    expect(letterOf('')).toBe('#');
  });
});

describe('letterStep', () => {
  const sorted = sortByName([col('a1', 'Apple'), col('a2', 'Avocado'), col('c', 'Cherry'), col('d', 'Date')]);

  it('moves to the first collection of the next letter, skipping unused ones', () => {
    expect(letterStep(sorted, 'a1', 1)?.id).toBe('c');
    expect(letterStep(sorted, 'a2', 1)?.id).toBe('c');
  });

  it('moves back a whole letter, not to the start of this one', () => {
    expect(letterStep(sorted, 'c', -1)?.id).toBe('a1');
  });

  it('stops at the ends', () => {
    expect(letterStep(sorted, 'd', 1)).toBeUndefined();
    expect(letterStep(sorted, 'a2', -1)).toBeUndefined();
  });

  it('starts at the top from the New collection tile', () => {
    expect(letterStep(sorted, null, 1)?.id).toBe('a1');
  });

  it('lists the letters in use', () => {
    expect(lettersIn(sorted)).toEqual(['A', 'C', 'D']);
  });
});

describe('recentlyPlayed', () => {
  it('lists only what was played, newest first, at most twelve', () => {
    const list = [col('never', 'Never'), col('old', 'Old', { playedAt: 1 }), col('new', 'New', { playedAt: 2 })];
    expect(recentlyPlayed(list).map((c) => c.id)).toEqual(['new', 'old']);
    const many = Array.from({ length: 20 }, (_, i) => col(`${i}`, `${i}`, { playedAt: i + 1 }));
    expect(recentlyPlayed(many)).toHaveLength(12);
  });
});

describe('shelvesOf', () => {
  it('sorts collections into their shelves, and a played one stays on its own too', () => {
    const shelves = shelvesOf([
      col('sample-coast', 'Coastlines'),
      col('album', 'Spain', { albumSourceId: 'gp', playedAt: 5 }),
      col('mine', 'Birthdays'),
    ]);
    expect(shelves.map((s) => [s.id, names(s.items)])).toEqual([
      ['recent', ['Spain']],
      ['albums', ['Spain']],
      ['mine', ['Birthdays']],
      ['included', ['Coastlines']],
    ]);
  });

  it('leaves out empty shelves but keeps "My collections" for the New tile', () => {
    expect(shelvesOf([col('sample-coast', 'Coastlines')]).map((s) => s.id)).toEqual(['mine', 'included']);
  });
});

describe('spread', () => {
  it('picks evenly through a long list and keeps a short one whole', () => {
    expect(spread([1, 2, 3, 4, 5, 6, 7, 8], 4)).toEqual([1, 3, 5, 7]);
    expect(spread([1, 2], 4)).toEqual([1, 2]);
  });
});
