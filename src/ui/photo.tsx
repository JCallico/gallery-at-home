import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { orientationTransform } from '../sources/exif';
import { loadImage, loadThumb } from '../sources';
import { PhotoRef } from '../store/types';

/**
 * Size and transform for an <img> showing a photo upright inside a box.
 * Done by hand (rather than object-fit) because the EXIF rotation can swap
 * width and height, which object-fit knows nothing about on older engines.
 */
export function layoutImage(
  natural: { width: number; height: number },
  box: { width: number; height: number },
  orientation: number,
  fit: 'fit' | 'fill',
): { width: number; height: number; transform: string } {
  const { transform, swap } = orientationTransform(orientation);
  const shownW = swap ? natural.height : natural.width;
  const shownH = swap ? natural.width : natural.height;
  const fx = box.width / shownW;
  const fy = box.height / shownH;
  const scale = fit === 'fit' ? Math.min(fx, fy) : Math.max(fx, fy);
  return {
    width: natural.width * scale,
    height: natural.height * scale,
    transform: `translate(-50%, -50%) ${transform}`,
  };
}

export function isPortrait(natural: { width: number; height: number }, orientation: number): boolean {
  const swap = orientationTransform(orientation).swap;
  return swap ? natural.width > natural.height : natural.height > natural.width;
}

// One shared observer: thumbnails load when near the viewport and are
// released when scrolled far away, which keeps big USB folders within the
// TV's memory.
type Watcher = (visible: boolean) => void;
const watchers = new WeakMap<Element, Watcher>();
let observer: IntersectionObserver | null = null;

function observe(el: Element, fn: Watcher): () => void {
  if (!observer) {
    observer = new IntersectionObserver(
      (records) => records.forEach((r) => watchers.get(r.target)?.(r.isIntersecting)),
      { rootMargin: '1200px 0px' },
    );
  }
  watchers.set(el, fn);
  observer.observe(el);
  return () => {
    observer!.unobserve(el);
    watchers.delete(el);
  };
}

/**
 * Lazy, upright, cropped thumbnail filling its (positioned) parent. `full`
 * loads the screen-sized photo instead, for pictures shown large.
 */
export function Thumb({ photo, full }: { photo: PhotoRef; full?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [src, setSrc] = useState<{ url: string; orientation: number } | null>(null);
  const [style, setStyle] = useState<Record<string, string> | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => observe(box.current!, setVisible), []);

  useEffect(() => {
    setFailed(false);
    if (!visible) {
      setSrc(null);
      setStyle(null);
      return;
    }
    let live = true;
    (full ? loadImage : loadThumb)(photo).then(
      (p) => live && setSrc({ url: p.url, orientation: p.orientation }),
      (err) => {
        console.warn('Thumbnail failed', photo.name, err);
        if (live) setFailed(true);
      },
    );
    return () => {
      live = false;
    };
  }, [visible, photo.id, attempt]);

  // The network may be why it failed: try again when it's back.
  useEffect(() => {
    if (!failed) return;
    const retry = () => {
      setSrc(null);
      setStyle(null);
      setAttempt((n) => n + 1);
    };
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [failed]);

  const onLoad = (e: Event) => {
    const img = e.currentTarget as HTMLImageElement;
    const el = box.current;
    // The tile can be gone by the time its image arrives (grid redrawn).
    if (!el || !src) return;
    const l = layoutImage(
      { width: img.naturalWidth, height: img.naturalHeight },
      { width: el.clientWidth, height: el.clientHeight },
      src.orientation,
      'fill',
    );
    setStyle({ width: `${l.width}px`, height: `${l.height}px`, transform: l.transform });
  };

  return (
    <div class="thumb" ref={box}>
      {src && <img src={src.url} onLoad={onLoad} onError={() => setFailed(true)} class={style ? 'ready' : ''} style={style ?? undefined} alt="" />}
    </div>
  );
}

/** Measures an element's size once mounted and on window resize. */
export function useBoxSize(ref: { current: HTMLElement | null }) {
  const [size, setSize] = useState({ width: 1920, height: 1080 });
  useLayoutEffect(() => {
    const measure = () => {
      if (ref.current) setSize({ width: ref.current.clientWidth, height: ref.current.clientHeight });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  return size;
}
