import { FrameStyle, PlaySettings } from '../store/types';

// Picture frames, built like real ones: four moulding pieces mitred at the
// corners, a mat (passe-partout) with a bevelled window, the photo behind it.
// Numbers are px on the 1920×1080 stage. See frame.tsx for the rendering.

/** Generated surface of the moulding (see moulding.ts). */
export interface Material {
  base: string;
  /** Grain lines running along each piece: colour and how many. */
  grain?: { color: string; count: number; alpha: [number, number] };
  /** Lighter bands in the wood (figure). */
  figure?: string;
  /** Fine dark pores / flecks. */
  pores?: number;
  /** Long faint streaks (brushed lacquer, burnished gilt). */
  streaks?: { light: string; dark: string; count: number };
}

export interface FrameSpec {
  label: string;
  /** Moulding width. */
  border: number;
  /** Mat width between moulding and photo; 0 = none. */
  mat: number;
  matColor: string;
  /** A white bevelled cut where the mat meets the photo. */
  bevel: boolean;
  material: Material;
  /**
   * Shading across the moulding, outer edge (0) to inner edge (100), laid
   * over the material: the carved profile, lit from above.
   */
  profile: [string, number][];
  /** A row of beads along the inner lip (ornate gilt frames). */
  beads?: boolean;
  /** The photo casts a shadow onto the backing (floating frames). */
  floating?: boolean;
}

const WOOD_PROFILE: [string, number][] = [
  ['rgba(0,0,0,0.55)', 0], ['rgba(0,0,0,0.22)', 4], ['rgba(255,248,230,0.30)', 11],
  ['rgba(255,248,230,0.10)', 22], ['rgba(0,0,0,0)', 38], ['rgba(0,0,0,0.04)', 60],
  ['rgba(0,0,0,0.30)', 79], ['rgba(0,0,0,0.12)', 83], ['rgba(255,245,220,0.34)', 88],
  ['rgba(255,245,220,0.08)', 94], ['rgba(0,0,0,0.6)', 100],
];

export const FRAMES: Record<Exclude<FrameStyle, 'none'>, FrameSpec> = {
  gallery: {
    label: 'Gallery white', border: 18, mat: 64, matColor: '#f5f3ee', bevel: true,
    material: { base: '#141414', streaks: { light: 'rgba(255,255,255,0.05)', dark: 'rgba(0,0,0,0.25)', count: 40 } },
    profile: [['rgba(0,0,0,0.6)', 0], ['rgba(255,255,255,0.20)', 14], ['rgba(255,255,255,0.04)', 45], ['rgba(0,0,0,0.15)', 85], ['rgba(0,0,0,0.6)', 100]],
  },
  black: {
    label: 'Modern black', border: 34, mat: 66, matColor: '#f2f0eb', bevel: true,
    material: { base: '#171717', streaks: { light: 'rgba(255,255,255,0.05)', dark: 'rgba(0,0,0,0.3)', count: 70 } },
    profile: [
      ['rgba(0,0,0,0.65)', 0], ['rgba(255,255,255,0.24)', 6], ['rgba(255,255,255,0.07)', 16],
      ['rgba(255,255,255,0)', 40], ['rgba(0,0,0,0.18)', 88], ['rgba(255,255,255,0.14)', 94], ['rgba(0,0,0,0.65)', 100],
    ],
  },
  oak: {
    label: 'Natural oak', border: 48, mat: 60, matColor: '#f4eee0', bevel: true,
    material: {
      base: '#c39257', figure: 'rgba(240,205,150,0.35)', pores: 900,
      grain: { color: '#6b4219', count: 110, alpha: [0.08, 0.32] },
    },
    profile: WOOD_PROFILE,
  },
  walnut: {
    label: 'Dark walnut', border: 48, mat: 60, matColor: '#efe9dd', bevel: true,
    material: {
      base: '#4f3220', figure: 'rgba(140,95,60,0.35)', pores: 700,
      grain: { color: '#1d1009', count: 120, alpha: [0.12, 0.45] },
    },
    // Dark wood: the same carving, with softer highlights.
    profile: [
      ['rgba(0,0,0,0.6)', 0], ['rgba(0,0,0,0.25)', 4], ['rgba(255,225,190,0.20)', 11],
      ['rgba(255,225,190,0.06)', 22], ['rgba(0,0,0,0)', 38], ['rgba(0,0,0,0.06)', 60],
      ['rgba(0,0,0,0.35)', 79], ['rgba(0,0,0,0.15)', 83], ['rgba(255,225,190,0.22)', 88],
      ['rgba(255,225,190,0.05)', 94], ['rgba(0,0,0,0.65)', 100],
    ],
  },
  gold: {
    label: 'Classic gold', border: 58, mat: 72, matColor: '#f3ebd5', bevel: true, beads: true,
    material: { base: '#c19a45', pores: 500, streaks: { light: 'rgba(255,240,190,0.18)', dark: 'rgba(90,60,10,0.22)', count: 90 } },
    profile: [
      ['rgba(40,25,0,0.7)', 0], ['rgba(255,240,190,0.6)', 5], ['rgba(80,55,10,0.35)', 11],
      ['rgba(255,240,190,0.4)', 17], ['rgba(0,0,0,0)', 24], ['rgba(60,40,5,0.45)', 35],
      ['rgba(60,40,5,0.55)', 45], ['rgba(255,240,190,0.5)', 57], ['rgba(255,240,190,0.1)', 66],
      ['rgba(60,40,5,0.4)', 74], ['rgba(255,235,180,0.55)', 79], ['rgba(60,40,5,0.55)', 83],
      ['rgba(60,40,5,0.25)', 92], ['rgba(30,20,0,0.75)', 100],
    ],
  },
  floating: {
    label: 'Floating', border: 14, mat: 26, matColor: '#0b0b0b', bevel: false, floating: true,
    material: { base: '#121212', streaks: { light: 'rgba(255,255,255,0.05)', dark: 'rgba(0,0,0,0.3)', count: 30 } },
    profile: [['rgba(0,0,0,0.5)', 0], ['rgba(255,255,255,0.18)', 20], ['rgba(255,255,255,0.03)', 55], ['rgba(0,0,0,0.6)', 100]],
  },
};

export const FRAME_OPTIONS: { value: FrameStyle; label: string }[] = [
  { value: 'none', label: 'No frame' },
  ...(Object.keys(FRAMES) as (keyof typeof FRAMES)[]).map((k) => ({ value: k as FrameStyle, label: FRAMES[k].label })),
];

/** The frame actually used: Ambient always frames (gallery white by default). */
export function effectiveFrame(settings: PlaySettings): FrameStyle {
  if (settings.mode === 'ambient') return settings.frame === 'none' ? 'gallery' : settings.frame;
  if (settings.mode === 'slideshow' || settings.mode === 'memories') return settings.frame;
  return 'none';
}
