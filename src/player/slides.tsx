import { useEffect, useRef, useState } from 'preact/hooks';
import { PlaySettings } from '../store/types';
import { layoutImage } from '../ui/photo';
import { ComponentChildren } from 'preact';
import { MatOpening, ScreenFrame } from './frame';
import { effectiveFrame } from './frames';
import { Prepared, Preloader } from './prepare';

// One renderer for the single-photo modes: Slideshow, Ken Burns, Ambient,
// Duo and Memories. They differ in framing and motion, not in sequencing.

export interface Command {
  kind: 'next' | 'prev';
  seq: number;
}

interface Slide {
  photos: Prepared[];
  /** Queue index of photos[0]. */
  index: number;
  key: number;
  dir: 1 | -1;
  /** Ken Burns motion variant. */
  variant: number;
}

interface Props {
  preloader: Preloader;
  startIndex: number;
  settings: PlaySettings;
  paused: boolean;
  command: Command | null;
  onShow: (photos: Prepared[], index: number) => void;
  onFail: () => void;
}

const SCREEN = { width: 1920, height: 1080 };

export function transitionMs(settings: PlaySettings): number {
  if (settings.mode === 'ambient') return 2500;
  // Framed photos crossfade slowly, like a picture being swapped on a wall.
  if (effectiveFrame(settings) !== 'none') return 2000;
  if (settings.mode === 'kenburns') return 2000;
  return { fade: 1200, slide: 900, zoom: 1400, none: 0 }[settings.transition];
}

let slideKey = 0;

export function SlideStage(props: Props) {
  const { preloader, settings } = props;
  const [slides, setSlides] = useState<Slide[]>([]);
  const current = useRef<Slide | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const busy = useRef(false);
  // Loads can finish after the stage is gone (mode switched, player closed);
  // they must not show anything or start timers then.
  const alive = useRef(true);
  const latest = useRef(props);
  latest.current = props;

  const schedule = () => {
    clearTimeout(timer.current);
    // A lone photo stays put rather than "advancing" to itself.
    if (!alive.current || latest.current.paused || preloader.length <= 1) return;
    timer.current = setTimeout(() => void advance(1), settings.intervalSec * 1000);
  };

  /** Builds the slide at `start`: a pair of portraits in Duo, else one photo. */
  const build = async (start: number, dir: 1 | -1): Promise<Slide | null> => {
    const first = await preloader.firstLoadable(start, dir);
    if (!first) return null;
    const photos = [first.photo];
    let index = first.index;
    if (settings.mode === 'duo' && first.photo.portrait && preloader.length > 1) {
      const otherIndex = preloader.wrap(dir === 1 ? first.index + 1 : first.index - 1);
      try {
        const other = await preloader.get(otherIndex);
        if (other.portrait && otherIndex !== first.index) {
          if (dir === 1) photos.push(other);
          else {
            photos.unshift(other);
            index = otherIndex;
          }
        }
      } catch {
        // Show the single portrait if its partner won't load.
      }
    }
    return { photos, index, key: ++slideKey, dir, variant: Math.floor(Math.random() * 6) };
  };

  const show = (slide: Slide) => {
    if (!alive.current) return;
    const previous = current.current;
    current.current = slide;
    setSlides(previous ? [previous, slide] : [slide]);
    latest.current.onShow(slide.photos, slide.index);
    // Drop the outgoing slide once its exit animation is over.
    setTimeout(() => {
      if (alive.current) setSlides((list) => list.filter((s) => s.key === current.current?.key));
    }, transitionMs(settings) + 100);
    // Warm up what comes next.
    void preloader.get(slide.index + slide.photos.length).catch(() => undefined);
    if (settings.mode === 'duo') void preloader.get(slide.index + slide.photos.length + 1).catch(() => undefined);
    schedule();
  };

  const advance = async (dir: 1 | -1) => {
    if (busy.current) return;
    busy.current = true;
    clearTimeout(timer.current);
    try {
      const cur = current.current;
      const start = !cur ? latest.current.startIndex : dir === 1 ? cur.index + cur.photos.length : cur.index - 1;
      const slide = await build(start, dir);
      if (!alive.current) return;
      if (slide) show(slide);
      else latest.current.onFail();
    } finally {
      busy.current = false;
    }
  };

  useEffect(() => {
    void advance(1);
    return () => {
      alive.current = false;
      clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
    if (!current.current) return;
    if (props.paused) clearTimeout(timer.current);
    else schedule();
  }, [props.paused]);

  // Only commands issued while this stage is showing; a Next pressed in the
  // previous mode must not replay when this one mounts.
  const seenCommand = useRef(props.command?.seq);
  useEffect(() => {
    if (!props.command || props.command.seq === seenCommand.current) return;
    seenCommand.current = props.command.seq;
    void advance(props.command.kind === 'next' ? 1 : -1);
  }, [props.command?.seq]);

  const top = slides[slides.length - 1];
  return (
    <Framed settings={settings}>
      <div class={`stage-slides mode-${settings.mode}`}>
        {slides.map((s) => (
          <SlideView key={s.key} slide={s} settings={settings} leaving={s !== top} />
        ))}
      </div>
    </Framed>
  );
}

/** With a frame chosen, the screen becomes the frame and the slides sit in its mat. */
function Framed({ settings, children }: { settings: PlaySettings; children: ComponentChildren }) {
  const frame = effectiveFrame(settings);
  return frame === 'none' ? <>{children}</> : <ScreenFrame style={frame}>{children}</ScreenFrame>;
}

/** A single still composition (no timing), used by the Style preview. */
export function StillSlide({ photos, settings }: { photos: Prepared[]; settings: PlaySettings }) {
  const shown = settings.mode === 'duo' && photos.length > 1 && photos[0].portrait && photos[1].portrait ? photos.slice(0, 2) : photos.slice(0, 1);
  return (
    <Framed settings={settings}>
      <SlideView slide={{ photos: shown, index: 0, key: 0, dir: 1, variant: 0 }} settings={settings} leaving={false} />
    </Framed>
  );
}

function SlideView({ slide, settings, leaving }: { slide: Slide; settings: PlaySettings; leaving: boolean }) {
  const ms = transitionMs(settings);
  const frame = effectiveFrame(settings);
  const transition = frame !== 'none' || settings.mode === 'kenburns' ? 'fade' : settings.transition;
  const dirClass = slide.dir === 1 ? 'fwd' : 'back';
  const style = { animationDuration: `${ms}ms` };
  const cls = `slide t-${transition} ${dirClass} ${leaving ? 'leave' : 'enter'}`;

  if (frame !== 'none') {
    // Only the opening in the mat changes; the frame around it stays put.
    return (
      <div class={cls} style={style}>
        <MatOpening
          style={frame}
          photo={slide.photos[0]}
          fill={settings.frameFit === 'fill'}
          // Room for the label only when there's one (see MatLabel in player.tsx).
          withLabel={settings.showCaption || settings.showClock || settings.mode === 'ambient'}
        />
      </div>
    );
  }

  if (settings.mode === 'kenburns') {
    const life = settings.intervalSec * 1000 + ms * 2;
    return (
      <div class={cls} style={style}>
        <div class={`kb kb-${slide.variant}`} style={{ animationDuration: `${life}ms` }}>
          <PhotoImg photo={slide.photos[0]} box={SCREEN} fit="fill" />
        </div>
      </div>
    );
  }

  if (slide.photos.length === 2) {
    const half = { width: 940, height: 1040 };
    return (
      <div class={cls} style={style}>
        <Backdrop photo={slide.photos[0]} />
        <div class="duo">
          {slide.photos.map((p) => (
            <div key={p.ref.id} class="duo-cell">
              <PhotoImg photo={p} box={half} fit="fill" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const fit = settings.mode === 'duo' ? 'fit' : settings.fit;
  return (
    <div class={cls} style={style}>
      {fit === 'fit' && <Backdrop photo={slide.photos[0]} />}
      <PhotoImg photo={slide.photos[0]} box={SCREEN} fit={fit} />
    </div>
  );
}

/** The prepared <img>, sized and rotated upright for its box. */
export function PhotoImg({ photo, box, fit }: { photo: Prepared; box: { width: number; height: number }; fit: 'fit' | 'fill' }) {
  const l = layoutImage(photo.natural, box, photo.orientation, fit);
  return (
    <img
      class="photo"
      src={photo.url}
      alt=""
      style={{ width: `${l.width}px`, height: `${l.height}px`, transform: l.transform }}
    />
  );
}

/**
 * A soft, colour-matched background behind photos that don't fill the
 * screen: the photo drawn into a tiny canvas and stretched. Much cheaper on
 * the TV's GPU than a CSS blur filter.
 */
export function Backdrop({ photo }: { photo: Prepared }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    const { swap } = { swap: photo.orientation >= 5 };
    ctx.save();
    // Orientation barely matters at this size except for colour placement.
    if (swap) {
      ctx.translate(16, 9);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(photo.img, -9, -16, 18, 32);
    } else {
      ctx.drawImage(photo.img, 0, 0, 32, 18);
    }
    ctx.restore();
  }, [photo.ref.id]);
  return <canvas ref={canvas} class="backdrop" width={32} height={18} />;
}
