// Minimal JPEG EXIF reader: orientation and capture date only.
//
// The 2020 TV's web engine (Chromium 69) ignores the EXIF orientation flag,
// so phone photos would appear sideways; we read it ourselves and rotate in
// CSS (with `image-orientation: none` so newer engines don't rotate twice).

export interface ExifInfo {
  orientation: number;
  takenAt?: number;
}

const NONE: ExifInfo = { orientation: 1 };
const cache = new Map<string, Promise<ExifInfo>>();

/** Reads EXIF for an image URL; cached per URL key. Never rejects. */
export function readExif(cacheKey: string, load: () => Promise<ArrayBuffer>): Promise<ExifInfo> {
  let pending = cache.get(cacheKey);
  if (!pending) {
    pending = load().then(parseExif, () => NONE);
    cache.set(cacheKey, pending);
  }
  return pending;
}

/** Fetches just the head of a file, where EXIF lives. */
export async function fetchHead(url: string, init: RequestInit = {}): Promise<ArrayBuffer> {
  const headers = new Headers(init.headers);
  headers.set('Range', 'bytes=0-131071');
  const res = await fetch(url, { ...init, headers });
  if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status}`);
  return res.arrayBuffer();
}

export function parseExif(buf: ArrayBuffer): ExifInfo {
  const view = new DataView(buf);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return NONE;
  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset);
    const length = view.getUint16(offset + 2);
    if ((marker & 0xff00) !== 0xff00) return NONE;
    // APP1 holding "Exif\0\0"
    if (marker === 0xffe1 && offset + 10 <= view.byteLength && view.getUint32(offset + 4) === 0x45786966) {
      return parseTiff(view, offset + 10);
    }
    if (marker === 0xffda) return NONE; // start of image data: no EXIF
    offset += 2 + length;
  }
  return NONE;
}

function parseTiff(view: DataView, start: number): ExifInfo {
  try {
    const little = view.getUint16(start) === 0x4949;
    const u16 = (o: number) => view.getUint16(start + o, little);
    const u32 = (o: number) => view.getUint32(start + o, little);
    const ascii = (o: number, n: number) => {
      let s = '';
      for (let i = 0; i < n; i++) {
        const c = view.getUint8(start + o + i);
        if (!c) break;
        s += String.fromCharCode(c);
      }
      return s;
    };

    const result: ExifInfo = { orientation: 1 };
    let dateTime: string | undefined;
    let original: string | undefined;

    const readIfd = (ifd: number, onTag: (tag: number, entry: number) => void) => {
      const count = u16(ifd);
      for (let i = 0; i < count; i++) {
        const entry = ifd + 2 + i * 12;
        onTag(u16(entry), entry);
      }
    };

    let exifIfd = 0;
    readIfd(u32(4), (tag, entry) => {
      if (tag === 0x0112) result.orientation = u16(entry + 8);
      else if (tag === 0x0132) dateTime = ascii(u32(entry + 8), 19);
      else if (tag === 0x8769) exifIfd = u32(entry + 8);
    });
    if (exifIfd) {
      readIfd(exifIfd, (tag, entry) => {
        if (tag === 0x9003) original = ascii(u32(entry + 8), 19);
      });
    }
    result.takenAt = parseExifDate(original ?? dateTime);
    if (result.orientation < 1 || result.orientation > 8) result.orientation = 1;
    return result;
  } catch {
    return NONE; // truncated or malformed EXIF
  }
}

/** EXIF dates look like "2019:07:14 18:03:22" in the camera's local time. */
function parseExifDate(s: string | undefined): number | undefined {
  const m = s && /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(s);
  if (!m || m[1] === '0000') return undefined;
  const t = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
  return Number.isNaN(t) ? undefined : t;
}

/** CSS transform that undoes an EXIF orientation, and whether w/h swap. */
export function orientationTransform(orientation: number): { transform: string; swap: boolean } {
  switch (orientation) {
    case 2: return { transform: 'scaleX(-1)', swap: false };
    case 3: return { transform: 'rotate(180deg)', swap: false };
    case 4: return { transform: 'scaleY(-1)', swap: false };
    case 5: return { transform: 'rotate(90deg) scaleX(-1)', swap: true };
    case 6: return { transform: 'rotate(90deg)', swap: true };
    case 7: return { transform: 'rotate(270deg) scaleX(-1)', swap: true };
    case 8: return { transform: 'rotate(270deg)', swap: true };
    default: return { transform: '', swap: false };
  }
}
