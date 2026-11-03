// Google Photos shared albums, read from their public web page.
//
// Google has no API for reading a shared album from its link, so this reads
// the album's page the way a browser would. The page embeds the first 300
// items as JSON (an AF_initDataCallback block, "ds:1") plus a token for the
// next page; further pages come from the page's own data endpoint. Each item
// is [mediaId, [url, width, height, …], takenAt, …, {extras}], where extras
// carry a "76647426" entry for videos, which are skipped.
//
// This depends on Google's page format, which can change without notice;
// parse failures surface as "couldn't read this album" rather than crashes.
//
// Newer TVs: their browser engine is refused (see fetch-text.ts), so the
// page comes through the download manager, which can't make the POST the
// later pages need. There, an album is read up to its first 300 items.
//
// This file is the pure reading logic, shared by the background worker
// (album-worker.ts) and the main-thread fallback (gphotos.ts).

/** What people type: the short link the Photos app shares. */
export const SHORT_LINK_PREFIX = 'https://photos.app.goo.gl/';

/** Most items read from one album (pages of 300). */
const MAX_ITEMS = 3000;
const VIDEO_KEY = '76647426';

export interface Album {
  title: string;
  /** The album's full share URL (photos.google.com/share/…?key=…). */
  url: string;
  albumId: string;
  key: string;
  total: number;
  photos: AlbumPhoto[];
  /** False when only the first page could be read (newer TVs). */
  complete: boolean;
}

export interface AlbumPhoto {
  mediaId: string;
  /** Base image URL; sizes are requested by appending "=w…-h…". */
  url: string;
  width: number;
  height: number;
  takenAt?: number;
}

/** Turns whatever was typed or pasted into a URL to fetch, or null if it isn't a Google Photos link. */
export function normalizeLink(input: string): string | null {
  let s = input.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `https://${s.replace(/^\/+/, '')}`;
  try {
    const u = new URL(s);
    const host = u.hostname.toLowerCase();
    if (host === 'photos.app.goo.gl' && u.pathname.length > 1) return u.href;
    if (host === 'photos.google.com' && u.pathname.startsWith('/share/')) return u.href;
    if (host === 'goo.gl' && u.pathname.startsWith('/photos/')) return u.href;
    return null;
  } catch {
    return null;
  }
}

function dataBlock(html: string): unknown[] | null {
  // Plain string search: a regex over the 1.4 MB page stalls an old TV.
  const at = html.indexOf("AF_initDataCallback({key: 'ds:1'");
  if (at < 0) return null;
  const start = html.indexOf('data:', at);
  const end = html.indexOf(', sideChannel: {}});', start);
  if (start < 0 || end < 0) return null;
  try {
    const data = JSON.parse(html.slice(start + 5, end));
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

function toPhotos(items: unknown): AlbumPhoto[] {
  if (!Array.isArray(items)) return [];
  const out: AlbumPhoto[] = [];
  for (const it of items) {
    if (!Array.isArray(it) || typeof it[0] !== 'string' || !Array.isArray(it[1])) continue;
    const extras = it.find((x: unknown) => x && typeof x === 'object' && !Array.isArray(x)) as Record<string, unknown> | undefined;
    if (extras && VIDEO_KEY in extras) continue;
    const [url, width, height] = it[1];
    if (typeof url !== 'string' || !/^https:\/\/lh3\.googleusercontent\.com\//.test(url)) continue;
    out.push({
      mediaId: it[0],
      url,
      width: Number(width) || 0,
      height: Number(height) || 0,
      takenAt: typeof it[2] === 'number' ? it[2] : undefined,
    });
  }
  return out;
}

async function nextPage(net: Transport, albumId: string, key: string, token: string): Promise<{ items: unknown; token: string }> {
  const inner = JSON.stringify([albumId, token, null, key]);
  const body = `f.req=${encodeURIComponent(JSON.stringify([[['snAcKc', inner, null, 'generic']]]))}`;
  const text = await net.post('https://photos.google.com/_/PhotosUi/data/batchexecute', body);
  for (const line of text.split('\n')) {
    if (!line.startsWith('[["wrb.fr"')) continue;
    const payload = JSON.parse(JSON.parse(line)[0][2]);
    return { items: payload[1], token: typeof payload[2] === 'string' ? payload[2] : '' };
  }
  throw new Error('Unexpected reply from Google Photos');
}

/**
 * Network access for readAlbum. Either method throws Refused when Google
 * refuses the request outright (newer TV engines).
 */
export interface Transport {
  get(url: string): Promise<string>;
  /** POST a form-encoded body. */
  post(url: string, body: string): Promise<string>;
}

export class Refused extends Error {
  constructor() {
    super('Google Photos refused the request');
    this.name = 'Refused';
  }
}

/** Reads a shared album: title and every photo (up to MAX_ITEMS items). */
export async function readAlbum(link: string, net: Transport): Promise<Album> {
  const url = normalizeLink(link);
  if (!url) throw new Error('That isn’t a Google Photos album link.');
  const html = await net.get(url);
  const data = dataBlock(html);
  const meta = data && Array.isArray(data[3]) ? (data[3] as unknown[]) : null;
  if (!data || !meta || typeof meta[0] !== 'string') {
    throw new Error('Couldn’t read this album. Check that the link is a shared album and that link sharing is on.');
  }
  const canonical = /<link rel="canonical" href="([^"]+)"/.exec(html);
  const shareUrl = canonical ? canonical[1].replace(/&amp;/g, '&') : url;
  const key = new URL(shareUrl).searchParams.get('key') ?? '';
  const albumId = meta[0];

  const photos = toPhotos(data[1]);
  let token = typeof data[2] === 'string' ? data[2] : '';
  let read = Array.isArray(data[1]) ? data[1].length : 0;
  let complete = true;
  while (token && key && read < MAX_ITEMS) {
    let page: { items: unknown; token: string };
    try {
      page = await nextPage(net, albumId, key, token);
    } catch (err) {
      // Refused (newer TVs, where only the first page can be read): keep
      // what the first page gave.
      if (!(err instanceof Refused)) throw err;
      complete = false;
      break;
    }
    photos.push(...toPhotos(page.items));
    read += Array.isArray(page.items) ? page.items.length : 0;
    token = page.token;
  }
  return {
    title: (typeof meta[1] === 'string' && meta[1].trim()) || 'Google Photos album',
    url: shareUrl,
    albumId,
    key,
    total: typeof meta[21] === 'number' ? meta[21] : read,
    photos,
    complete,
  };
}
