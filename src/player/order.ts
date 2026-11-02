import { captureDate } from '../sources';
import { rememberTakenAt } from '../store/store';
import { PhotoRef, PlaySettings } from '../store/types';

// Builds the play queue for a collection according to the chosen order/mode.

export function shuffle<T>(items: T[]): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const resolved = new Set<string>();

/**
 * Fills in capture dates from EXIF for photos whose source can provide it
 * (USB, network, web).
 * Results are written back to the collection so this happens once.
 */
export async function resolveDates(photos: PhotoRef[], onProgress: (done: number, total: number) => void): Promise<PhotoRef[]> {
  const todo = photos.filter((p) => !resolved.has(p.id));
  const dates = new Map<string, number>();
  let done = 0;
  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const p = todo[next++];
      const t = await captureDate(p);
      resolved.add(p.id);
      if (t !== undefined && t !== p.takenAt) dates.set(p.id, t);
      onProgress(++done, todo.length);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  rememberTakenAt(dates);
  return photos.map((p) => (dates.has(p.id) ? { ...p, takenAt: dates.get(p.id) } : p));
}

export function needsDates(play: PlaySettings): boolean {
  return play.mode === 'memories' || play.order === 'date';
}

const byDate = (a: PhotoRef, b: PhotoRef) => (a.takenAt ?? Infinity) - (b.takenAt ?? Infinity);

export function orderPhotos(photos: PhotoRef[], play: PlaySettings): PhotoRef[] {
  switch (play.order) {
    case 'shuffle': return shuffle(photos);
    case 'date': return photos.slice().sort(byDate);
    case 'name': return photos.slice().sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    default: return photos.slice();
  }
}

export interface Memories {
  photos: PhotoRef[];
  /** Explains what was picked, shown before the first photo. */
  title: string;
}

/** Days between two dates' month/day, ignoring the year (wraps at new year). */
function dayOfYearDistance(a: Date, b: Date): number {
  const doy = (d: Date) => Math.round((Date.UTC(2001, d.getMonth(), d.getDate()) - Date.UTC(2001, 0, 1)) / 86400000);
  const diff = Math.abs(doy(a) - doy(b));
  return Math.min(diff, 365 - diff);
}

/** "On this day" in earlier years, widening the window until something is found. */
export function pickMemories(photos: PhotoRef[], now = new Date()): Memories {
  const dated = photos.filter((p) => p.takenAt !== undefined && new Date(p.takenAt).getFullYear() < now.getFullYear());
  const windows: [number, string][] = [
    [0, 'On this day'],
    [3, 'This week in past years'],
    [15, 'This month in past years'],
    [45, 'This season in past years'],
  ];
  for (const [days, title] of windows) {
    const hits = dated.filter((p) => dayOfYearDistance(new Date(p.takenAt!), now) <= days);
    if (hits.length) return { photos: hits.sort(byDate), title };
  }
  const all = photos.filter((p) => p.takenAt !== undefined).sort(byDate);
  return all.length
    ? { photos: all, title: 'No memories from this time of year · showing all by date' }
    : { photos: photos.slice(), title: 'These photos have no dates · showing all' };
}

export function yearsAgo(takenAt: number, now = new Date()): string {
  const years = now.getFullYear() - new Date(takenAt).getFullYear();
  if (years <= 0) return 'This year';
  return years === 1 ? '1 year ago' : `${years} years ago`;
}
