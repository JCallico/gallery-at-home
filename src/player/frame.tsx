import { ComponentChildren } from 'preact';
import { layoutImage } from '../ui/photo';
import { FRAMES, FrameSpec } from './frames';
import { surfaces } from './moulding';
import { Prepared } from './prepare';

// The TV as a picture frame. The moulding runs around the edges of the
// screen and the mat fills everything inside it; both stay put while the
// photos change. Each photo gets its own opening cut in the mat, sized to the
// photo's shape (a portrait gets a tall opening with wide margins), and only
// that opening crossfades from one photo to the next, the way a print sits
// in a real frame.
//
//   moulding  four pieces, each cut at 45° at both ends (clip-path), grain
//             running along the piece, a carved profile shaded across it,
//             lit from above (top piece brightest, bottom darkest)
//   mat       recessed under the moulding, which casts a shadow onto it;
//             bottom-weighted, with the photo's label in the extra margin
//   bevel     the mat's white 45° cut around the opening
//
// The frame itself is static, so it costs nothing per frame.

type Side = 'top' | 'right' | 'bottom' | 'left';
const SIDES: Side[] = ['top', 'right', 'bottom', 'left'];

/** Light falling from above: how much each piece is brightened or shaded. */
const LIGHT: Record<Side, string> = {
  top: 'rgba(255,255,255,0.10)',
  left: 'rgba(255,255,255,0.03)',
  right: 'rgba(0,0,0,0.10)',
  bottom: 'rgba(0,0,0,0.24)',
};

/** Profile gradients run from the outer edge to the inner edge. */
const INWARD: Record<Side, string> = { top: 'to bottom', right: 'to left', bottom: 'to top', left: 'to right' };

const BEVEL = 6;
const BEAD = 12;
/** Most of a photo that Fill may crop away to fill the opening. */
const MAX_CROP = 0.25;
const W = 1920;
const H = 1080;
/** Extra mat below the opening, for the label (bottom-weighted, as framers do). */
const LABEL = 40;

export interface ScreenFrameLayout {
  /** Moulding width at the screen's edge. */
  border: number;
  /** Least mat around an opening. */
  margin: number;
  /** Where openings may go: the mat minus its margins and the label band. */
  area: { left: number; top: number; width: number; height: number };
  /** Distance from the screen's bottom to the middle of the label band. */
  labelCenter: number;
  /** Text colour that reads on this mat. */
  ink: 'dark' | 'light';
}

/** Sizes for a frame filling the 1920×1080 stage (scaled up from the spec). */
/**
 * `withLabel`: keep a band at the bottom of the mat for the caption and
 * clock. Without one the mat is even all round and the photo centred.
 */
export function screenFrameLayout(style: keyof typeof FRAMES, withLabel = true): ScreenFrameLayout {
  const spec = FRAMES[style];
  // A whole-screen frame: mouldings a little heavier than on a print and a
  // slim mat, so the photo covers most of what's inside the frame.
  const border = Math.round(spec.border * 1.25);
  const margin = Math.round(spec.mat * 0.45);
  const top = border + margin;
  return {
    border,
    margin,
    area: { left: top, top, width: W - top * 2, height: H - top * 2 - (withLabel ? LABEL : 0) },
    labelCenter: border + Math.round((margin + LABEL) / 2),
    ink: spec.floating ? 'light' : 'dark',
  };
}

/** The whole-screen frame: mat and moulding, with the openings in between. */
export function ScreenFrame(props: { style: keyof typeof FRAMES; children: ComponentChildren }) {
  const spec = FRAMES[props.style];
  const { border: b } = screenFrameLayout(props.style);
  return (
    <div class={`screen-frame frame-${props.style}`}>
      <div class="frame-mat" style={{ left: `${b}px`, top: `${b}px`, width: `${W - b * 2}px`, height: `${H - b * 2}px`, background: spec.matColor }} />
      {props.children}
      {SIDES.map((side) => (
        <div key={side} class="moulding" style={piece(side, spec, props.style, b)} />
      ))}
    </div>
  );
}

/**
 * One opening in the mat with its photo in it: as large as the area allows
 * for the photo's shape, centred.
 */
export function MatOpening(props: { style: keyof typeof FRAMES; photo: Prepared; fill?: boolean; withLabel: boolean }) {
  const { photo } = props;
  const spec = FRAMES[props.style];
  const { area } = screenFrameLayout(props.style, props.withLabel);
  const bevel = spec.bevel ? BEVEL : 0;
  // The photo's upright shape decides the opening's shape.
  const swap = photo.orientation >= 5;
  const nw = swap ? photo.natural.height : photo.natural.width;
  const nh = swap ? photo.natural.width : photo.natural.height;
  // The opening's shape. Whole photo: exactly the photo's. Fill: as close to
  // the whole area's shape as cropping at most MAX_CROP of the photo allows,
  // so most photos fill the frame and a portrait gets a tall opening rather
  // than losing most of itself.
  const aw = area.width - bevel * 2;
  const ah = area.height - bevel * 2;
  const photoAspect = nw / nh;
  const areaAspect = aw / ah;
  const aspect = !props.fill
    ? photoAspect
    : photoAspect < areaAspect
      ? Math.min(areaAspect, photoAspect / (1 - MAX_CROP))
      : Math.max(areaAspect, photoAspect * (1 - MAX_CROP));
  const w = Math.round(Math.min(aw, ah * aspect));
  const h = Math.round(Math.min(ah, aw / aspect));
  const left = area.left + Math.round((area.width - w - bevel * 2) / 2);
  const top = area.top + Math.round((area.height - h - bevel * 2) / 2);
  const img = layoutImage(photo.natural, { width: w, height: h }, photo.orientation, 'fill');
  return (
    <div
      class={`mat-opening ${bevel ? 'frame-bevel' : ''} ${spec.floating ? 'floating' : ''}`}
      style={{ left: `${left}px`, top: `${top}px`, borderWidth: `${bevel}px` }}
    >
      <div class="frame-window" style={{ width: `${w}px`, height: `${h}px` }}>
        <img class="photo" src={photo.url} alt="" style={{ width: `${img.width}px`, height: `${img.height}px`, transform: img.transform }} />
      </div>
    </div>
  );
}

function piece(side: Side, spec: FrameSpec, key: string, b: number): Record<string, string> {
  const w = W;
  const h = H;
  const horizontal = side === 'top' || side === 'bottom';
  const box = {
    top: { left: 0, top: 0, width: w, height: b, clip: [[0, 0], [w, 0], [w - b, b], [b, b]] },
    bottom: { left: 0, top: h - b, width: w, height: b, clip: [[b, 0], [w - b, 0], [w, b], [0, b]] },
    left: { left: 0, top: 0, width: b, height: h, clip: [[0, 0], [b, b], [b, h - b], [0, h]] },
    right: { left: w - b, top: 0, width: b, height: h, clip: [[0, b], [b, 0], [b, h], [0, h - b]] },
  }[side];
  const clip = `polygon(${box.clip.map(([x, y]) => `${x}px ${y}px`).join(', ')})`;

  const tex = surfaces(key, spec.material);
  const profile = `linear-gradient(${INWARD[side]}, ${spec.profile.map(([c, p]) => `${c} ${p}%`).join(', ')})`;
  const light = `linear-gradient(${LIGHT[side]}, ${LIGHT[side]})`;
  // Each piece starts at a different place in the grain, like four cuts
  // from one length of moulding.
  const offset = { top: 0, right: 311, bottom: 577, left: 829 }[side];
  const grainPos = horizontal ? `${-offset}px ${-(offset % 60)}px` : `${-(offset % 60)}px ${-offset}px`;

  const layers = [light, profile, `url(${horizontal ? tex.across : tex.down})`];
  const sizes = ['100% 100%', '100% 100%', 'auto'];
  const positions = ['0 0', '0 0', grainPos];
  const repeats = ['no-repeat', 'no-repeat', 'repeat'];
  if (spec.beads) {
    // A row of gilt beads along the inner lip.
    const at = Math.round(b * 0.86 - BEAD / 2);
    const from = Math.round(b * 0.14 - BEAD / 2);
    const across = { top: at, bottom: from, left: at, right: from }[side];
    layers.splice(1, 0, `radial-gradient(circle at 40% 38%, rgba(255,246,205,0.95) 0, rgba(214,174,82,0.95) 32%, rgba(96,64,16,0.95) 62%, rgba(96,64,16,0) 68%)`);
    sizes.splice(1, 0, `${BEAD}px ${BEAD}px`);
    positions.splice(1, 0, horizontal ? `0 ${across}px` : `${across}px 0`);
    repeats.splice(1, 0, horizontal ? 'repeat-x' : 'repeat-y');
  }
  return {
    left: `${box.left}px`,
    top: `${box.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
    clipPath: clip,
    webkitClipPath: clip,
    backgroundImage: layers.join(', '),
    backgroundSize: sizes.join(', '),
    backgroundPosition: positions.join(', '),
    backgroundRepeat: repeats.join(', '),
  };
}

/**
 * The label in the mat's bottom margin: the photo's title (or date) and
 * credit, centred, or on the left with the time on the right when the clock
 * is on. Small
 * and quiet, in an ink that reads on the mat, like a gallery label.
 */
export function MatLabel(props: { style: keyof typeof FRAMES; caption?: string | null; sub?: string; clock?: string | null }) {
  const { area, labelCenter, ink } = screenFrameLayout(props.style);
  if (!props.caption && !props.clock) return null;
  return (
    <div class={`mat-label ink-${ink} ${props.clock ? 'has-clock' : ''}`} style={{ left: `${area.left}px`, width: `${area.width}px`, bottom: `${labelCenter}px` }}>
      <span class="mat-label-side" />
      <span class="mat-label-caption">
        {props.caption}
        {props.caption && props.sub && <span class="mat-label-sub">{props.sub}</span>}
      </span>
      <span class="mat-label-side mat-label-clock">{props.clock}</span>
    </div>
  );
}
