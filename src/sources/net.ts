// Network helpers shared by the sources.
//
// On the TV, the Tizen web runtime lets a packaged app make cross-origin
// requests to origins allowed in config.xml, so no CORS is involved. A
// desktop browser enforces CORS, so during development requests to other
// origins go through the dev server's /__dev/proxy.

export function viaProxy(url: string): string {
  if (!__DEV__) return url;
  const target = new URL(url, location.href);
  if (target.origin === location.origin) return url;
  return `/__dev/proxy?url=${encodeURIComponent(target.href)}`;
}

export async function request(url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(viaProxy(url), init);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new HttpError(res.status, `${res.status} ${res.statusText} for ${url}`, body);
  }
  return res;
}

export class HttpError extends Error {
  constructor(public status: number, message: string, public body: string) {
    super(message);
  }
}

export function basicAuth(username?: string, password?: string): Record<string, string> {
  if (!username) return {};
  const token = btoa(unescape(encodeURIComponent(`${username}:${password ?? ''}`)));
  return { Authorization: `Basic ${token}` };
}

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp)$/i;

export function isImageName(name: string): boolean {
  return IMAGE_EXT.test(name);
}

/**
 * Object URLs for images that need auth headers. Kept in a small LRU so a
 * long slideshow doesn't hold every photo in memory (the TV has little).
 */
const blobUrls = new Map<string, Promise<string>>();
const BLOB_LIMIT = 80;

export function authedImageUrl(url: string, headers: Record<string, string>): Promise<string> {
  const cached = blobUrls.get(url);
  if (cached) {
    blobUrls.delete(url);
    blobUrls.set(url, cached); // mark as recently used
    return cached;
  }
  const pending = request(url, { headers })
    .then((res) => res.blob())
    .then((blob) => URL.createObjectURL(blob));
  pending.catch(() => blobUrls.delete(url));
  blobUrls.set(url, pending);
  while (blobUrls.size > BLOB_LIMIT) {
    const [oldKey, oldUrl] = blobUrls.entries().next().value as [string, Promise<string>];
    blobUrls.delete(oldKey);
    oldUrl.then((u) => URL.revokeObjectURL(u), () => undefined);
  }
  return pending;
}
