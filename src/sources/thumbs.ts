// Small thumbnails for sources that only have full-size originals (USB,
// network shares, web links). A grid of 16 tiles would otherwise decode 16
// camera-sized images, ~10 MB of memory each, which is slow on a TV. Each
// original is fetched and decoded once, redrawn at THUMB_MAX and kept as a
// small JPEG; grids then only decode those.

const THUMB_MAX = 480;
const CACHE_LIMIT = 400;
const PARALLEL = 3;

export interface SmallThumb {
  url: string;
  /** EXIF orientation still to apply to `url` (1 once the pixels are upright). */
  orientation: number;
}

const cache = new Map<string, Promise<SmallThumb>>();

/**
 * A downscaled copy of `url`. Falls back to the original when it can't be
 * shrunk (e.g. the TV refuses to read the file's bytes), so it never fails
 * where the original would have worked.
 */
export function smallThumb(id: string, url: string, orientation: number): Promise<SmallThumb> {
  const hit = cache.get(id);
  if (hit) {
    // Most recently used goes to the back.
    cache.delete(id);
    cache.set(id, hit);
    return hit;
  }
  const p = limit(() => shrink(url, orientation)).catch((err) => {
    console.warn('Using full-size thumbnail', err);
    cache.delete(id);
    return { url, orientation };
  });
  cache.set(id, p);
  while (cache.size > CACHE_LIMIT) {
    const [oldest, old] = cache.entries().next().value as [string, Promise<SmallThumb>];
    cache.delete(oldest);
    // An <img> that already loaded keeps showing after its blob is revoked.
    void old.then((t) => t.url.startsWith('blob:') && t.url !== url && URL.revokeObjectURL(t.url));
  }
  return p;
}

async function shrink(url: string, orientation: number): Promise<SmallThumb> {
  // Read the bytes ourselves: a canvas holding a cross-origin image can't be
  // exported, while one drawn from our own blob can.
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const original = URL.createObjectURL(await res.blob());
  try {
    const img = await decode(original);
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const scale = Math.min(1, THUMB_MAX / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    (ctx as CanvasRenderingContext2D & { imageSmoothingQuality?: string }).imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob) throw new Error('Could not encode thumbnail');
    // The re-encoded JPEG has no EXIF. If this browser drew the photo
    // already rotated, the pixels are upright; if not, rotation still applies.
    return { url: URL.createObjectURL(blob), orientation: (await browserAppliesExif()) ? 1 : orientation };
  } finally {
    URL.revokeObjectURL(original);
  }
}

function decode(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode image'));
    img.src = src;
  });
}

// --- Does this browser rotate JPEGs by their EXIF orientation? ---------------
// Chromium 69 (2020 TVs) doesn't; newer ones (and the emulator) do. Checked
// once with a 2×1 JPEG tagged "rotate 90°": rotated, it decodes as 1×2.

let exifCheck: Promise<boolean> | null = null;

function browserAppliesExif(): Promise<boolean> {
  if (!exifCheck) exifCheck = detectExifRotation().catch(() => false);
  return exifCheck;
}

async function detectExifRotation(): Promise<boolean> {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 1;
  const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg'));
  if (!jpeg) return false;
  const bytes = new Uint8Array(await new Response(jpeg).arrayBuffer());
  // APP1 "Exif" segment: big-endian TIFF with one IFD entry, Orientation = 6.
  const app1 = new Uint8Array([
    0xff, 0xe1, 0x00, 0x22, // marker, length 34
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // "MM", 42, IFD at 8
    0x00, 0x01, // one entry
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x06, 0x00, 0x00, // Orientation SHORT 6
    0x00, 0x00, 0x00, 0x00, // no next IFD
  ]);
  const tagged = new Blob([bytes.subarray(0, 2), app1, bytes.subarray(2)], { type: 'image/jpeg' });
  const url = URL.createObjectURL(tagged);
  try {
    const img = await decode(url);
    return img.naturalWidth === 1 && img.naturalHeight === 2;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// --- A few at a time ----------------------------------------------------------

let running = 0;
const waiting: (() => void)[] = [];

async function limit<T>(task: () => Promise<T>): Promise<T> {
  if (running >= PARALLEL) await new Promise<void>((resolve) => waiting.push(resolve));
  running++;
  try {
    return await task();
  } finally {
    running--;
    waiting.shift()?.();
  }
}
