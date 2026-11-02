import { loadImage } from '../sources';
import { rememberDimensions } from '../store/store';
import { PhotoRef } from '../store/types';
import { isPortrait } from '../ui/photo';

/** A photo fully downloaded and decoded, ready to appear without stutter. */
export interface Prepared {
  ref: PhotoRef;
  url: string;
  orientation: number;
  img: HTMLImageElement;
  natural: { width: number; height: number };
  portrait: boolean;
  takenAt?: number;
}

export async function prepare(ref: PhotoRef): Promise<Prepared> {
  const loaded = await loadImage(ref);
  const img = new Image();
  img.decoding = 'async';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Could not load ${ref.name}`));
    img.src = loaded.url;
  });
  // Decode off the main thread before it's shown, where supported.
  if (img.decode) await img.decode().catch(() => undefined);
  const natural = { width: img.naturalWidth, height: img.naturalHeight };
  const portrait = isPortrait(natural, loaded.orientation);
  if (!ref.width) rememberDimensions(ref.id, natural.width, natural.height);
  return { ref, url: loaded.url, orientation: loaded.orientation, img, natural, portrait, takenAt: loaded.takenAt };
}

/**
 * Prepares photos by queue index, keeping only a small window in memory:
 * a 4K-capable TV still has far less RAM than a desktop.
 */
export class Preloader {
  private cache = new Map<number, Promise<Prepared>>();

  constructor(private queue: PhotoRef[], private keep = 4) {}

  get length(): number {
    return this.queue.length;
  }

  wrap(i: number): number {
    const n = this.queue.length;
    return ((i % n) + n) % n;
  }

  get(i: number): Promise<Prepared> {
    const index = this.wrap(i);
    let p = this.cache.get(index);
    if (!p) {
      p = prepare(this.queue[index]);
      p.catch(() => this.cache.delete(index));
      this.cache.set(index, p);
      while (this.cache.size > this.keep) {
        const oldest = this.cache.keys().next().value as number;
        this.cache.delete(oldest);
      }
    }
    return p;
  }

  /** Finds the next index (stepping by `dir`) whose photo loads; null if none do. */
  async firstLoadable(start: number, dir: 1 | -1): Promise<{ index: number; photo: Prepared } | null> {
    for (let k = 0; k < this.queue.length; k++) {
      const index = this.wrap(start + k * dir);
      try {
        return { index, photo: await this.get(index) };
      } catch (err) {
        console.warn('Skipping photo', this.queue[index].name, err);
      }
    }
    return null;
  }
}
