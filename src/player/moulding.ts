import { Material } from './frames';

// Generated surfaces for frame mouldings: wood grain, brushed lacquer,
// burnished gilt. Drawn once per frame style into a small canvas, kept as an
// image, and tiled along each piece. A horizontal strip serves the top and
// bottom pieces; a copy rotated 90° serves the sides, so the grain always
// runs along the piece, as in a real mitred frame.

const LENGTH = 1024; // along the grain; waves repeat exactly, so tiles join
const DEPTH = 128; // across the grain; wider than any moulding

export interface Surfaces {
  /** Grain running left–right (top and bottom pieces). */
  across: string;
  /** Grain running up–down (side pieces). */
  down: string;
}

const cache = new Map<string, Surfaces>();

export function surfaces(key: string, material: Material): Surfaces {
  let s = cache.get(key);
  if (!s) {
    const strip = draw(material, seedOf(key));
    s = { across: strip.toDataURL('image/jpeg', 0.9), down: rotated(strip).toDataURL('image/jpeg', 0.9) };
    cache.set(key, s);
  }
  return s;
}

function draw(m: Material, seed: number): HTMLCanvasElement {
  const rand = random(seed);
  const canvas = document.createElement('canvas');
  canvas.width = LENGTH;
  canvas.height = DEPTH;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = m.base;
  ctx.fillRect(0, 0, LENGTH, DEPTH);

  // Figure: broad, soft bands of lighter wood.
  if (m.figure) {
    for (let i = 0; i < 7; i++) {
      const y = rand() * DEPTH;
      const h = 8 + rand() * 30;
      const g = ctx.createLinearGradient(0, y - h, 0, y + h);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.5, m.figure);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, y - h, LENGTH, h * 2);
    }
  }

  // Grain: long wavy lines. Whole numbers of waves per tile keep the seams
  // invisible when the strip repeats.
  if (m.grain) {
    ctx.strokeStyle = m.grain.color;
    for (let i = 0; i < m.grain.count; i++) {
      const y0 = rand() * DEPTH;
      const a1 = 0.5 + rand() * 3;
      const k1 = 1 + Math.floor(rand() * 3);
      const p1 = rand() * Math.PI * 2;
      const a2 = rand() * 1.5;
      const k2 = 3 + Math.floor(rand() * 5);
      const p2 = rand() * Math.PI * 2;
      ctx.globalAlpha = m.grain.alpha[0] + rand() * (m.grain.alpha[1] - m.grain.alpha[0]);
      ctx.lineWidth = 0.4 + rand() * 1.8;
      ctx.beginPath();
      for (let x = 0; x <= LENGTH; x += 8) {
        const t = (x / LENGTH) * Math.PI * 2;
        const y = y0 + a1 * Math.sin(k1 * t + p1) + a2 * Math.sin(k2 * t + p2);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // Streaks: long straight brush or burnish marks.
  if (m.streaks) {
    for (let i = 0; i < m.streaks.count; i++) {
      ctx.fillStyle = rand() < 0.5 ? m.streaks.light : m.streaks.dark;
      const y = rand() * DEPTH;
      const x = rand() * LENGTH;
      const w = 80 + rand() * 500;
      const h = 0.5 + rand() * 1.5;
      ctx.fillRect(x, y, w, h);
      if (x + w > LENGTH) ctx.fillRect(x - LENGTH, y, w, h); // wrap
    }
  }

  // Pores and flecks: short dark dashes along the grain.
  if (m.pores) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    for (let i = 0; i < m.pores; i++) {
      ctx.globalAlpha = 0.2 + rand() * 0.6;
      ctx.fillRect(rand() * LENGTH, rand() * DEPTH, 1 + rand() * 6, 0.6 + rand() * 0.8);
    }
    ctx.globalAlpha = 1;
  }
  return canvas;
}

function rotated(strip: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = DEPTH;
  canvas.height = LENGTH;
  const ctx = canvas.getContext('2d')!;
  ctx.translate(DEPTH, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(strip, 0, 0);
  return canvas;
}

function seedOf(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Small deterministic PRNG (mulberry32): the same frame looks the same every time. */
function random(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
