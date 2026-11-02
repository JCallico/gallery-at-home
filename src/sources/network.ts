// NAS / PC shares reachable over HTTP: WebDAV (Synology, Nextcloud, QNAP,
// rclone, Windows/IIS…) or, failing that, a plain web server directory
// listing (nginx autoindex, Apache, `python -m http.server`).

import { fetchHead } from './exif';
import { authedImageUrl, basicAuth, HttpError, isImageName, request, viaProxy } from './net';
import { NetworkSource } from '../store/types';
import { Entry, Listing, photoRef, SourceAdapter, sortEntries } from './types';

const PROPFIND_BODY =
  '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop>' +
  '<d:resourcetype/><d:getcontenttype/><d:getlastmodified/><d:displayname/>' +
  '</d:prop></d:propfind>';

function withSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}

function lastSegment(url: string): string {
  const path = new URL(url).pathname.replace(/\/+$/, '');
  return decodeURIComponent(path.slice(path.lastIndexOf('/') + 1)) || new URL(url).host;
}

function davChild(el: Element, name: string): Element | undefined {
  return Array.from(el.getElementsByTagNameNS('DAV:', name))[0];
}

async function listWebDav(source: NetworkSource, folderUrl: string): Promise<Entry[]> {
  const res = await request(folderUrl, {
    method: 'PROPFIND',
    headers: { Depth: '1', 'Content-Type': 'application/xml; charset=utf-8', ...basicAuth(source.username, source.password) },
    body: PROPFIND_BODY,
  });
  const xml = new DOMParser().parseFromString(await res.text(), 'application/xml');
  const responses = Array.from(xml.getElementsByTagNameNS('DAV:', 'response'));
  if (!responses.length) throw new Error('Not a WebDAV response');

  const self = new URL(folderUrl).pathname.replace(/\/+$/, '');
  const entries: Entry[] = [];
  for (const r of responses) {
    const href = davChild(r, 'href')?.textContent?.trim();
    if (!href) continue;
    const url = new URL(href, folderUrl).href;
    if (new URL(url).pathname.replace(/\/+$/, '') === self) continue;
    const isDir = !!(davChild(r, 'resourcetype') && davChild(davChild(r, 'resourcetype')!, 'collection'));
    const name = davChild(r, 'displayname')?.textContent?.trim() || lastSegment(url);
    if (name.startsWith('.') || name.startsWith('@')) continue; // .thumbnails, Synology @eaDir
    if (isDir) {
      entries.push({ type: 'folder', key: withSlash(url), name });
    } else {
      const type = davChild(r, 'getcontenttype')?.textContent ?? '';
      if (!type.startsWith('image/') && !isImageName(name)) continue;
      const modified = Date.parse(davChild(r, 'getlastmodified')?.textContent ?? '');
      entries.push({
        type: 'photo',
        ref: photoRef(source.id, url, name, { takenAt: Number.isNaN(modified) ? undefined : modified }),
      });
    }
  }
  return entries;
}

async function listIndexPage(source: NetworkSource, folderUrl: string): Promise<Entry[]> {
  const res = await request(folderUrl, { headers: basicAuth(source.username, source.password) });
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
  const base = new URL(folderUrl);
  const seen = new Set<string>();
  const entries: Entry[] = [];
  for (const a of Array.from(doc.querySelectorAll('a[href]'))) {
    const raw = a.getAttribute('href')!;
    if (raw.startsWith('?') || raw.startsWith('#')) continue; // sort links
    const url = new URL(raw, base);
    url.hash = '';
    // Only children of this folder: no parent links, no other sites.
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname) || url.pathname === base.pathname) continue;
    if (url.search || seen.has(url.href)) continue;
    seen.add(url.href);
    const name = lastSegment(url.href);
    if (name.startsWith('.')) continue;
    if (url.pathname.endsWith('/')) entries.push({ type: 'folder', key: url.href, name });
    else if (isImageName(url.pathname)) entries.push({ type: 'photo', ref: photoRef(source.id, url.href, name) });
  }
  return entries;
}

export function networkAdapter(source: NetworkSource): SourceAdapter {
  const rootUrl = withSlash(source.url);
  const auth = basicAuth(source.username, source.password);
  // Remember which protocol works so we only probe once per session.
  let protocol: 'webdav' | 'index' | null = null;

  const listFolder = async (url: string): Promise<Entry[]> => {
    if (protocol !== 'index') {
      try {
        const entries = await listWebDav(source, url);
        protocol = 'webdav';
        return entries;
      } catch (err) {
        const fallback = !(err instanceof HttpError) || [400, 403, 404, 405, 501].includes(err.status);
        if (protocol === 'webdav' || !fallback || (err instanceof HttpError && err.status === 401)) throw err;
      }
    }
    const entries = await listIndexPage(source, url);
    protocol = 'index';
    return entries;
  };

  const imageUrl = (url: string) => (auth.Authorization ? authedImageUrl(url, auth) : Promise.resolve(url));

  return {
    source,
    async list(folderKey): Promise<Listing> {
      const url = folderKey ?? rootUrl;
      return {
        key: folderKey,
        title: folderKey ? lastSegment(url) : source.name,
        entries: sortEntries(await listFolder(url)),
      };
    },
    thumbUrl: (ref) => imageUrl(ref.key),
    imageUrl: (ref) => imageUrl(ref.key),
    readHead: (ref) => fetchHead(viaProxy(ref.key), { headers: auth }),
  };
}

/** Checks that a share answers before saving it. Throws a readable error. */
export async function testNetworkSource(source: NetworkSource): Promise<number> {
  try {
    const listing = await networkAdapter(source).list(null);
    return listing.entries.length;
  } catch (err) {
    if (err instanceof HttpError && err.status === 401) throw new Error('The server rejected the user name or password.');
    if (err instanceof HttpError) throw new Error(`The server answered ${err.status}.`);
    throw new Error('Could not reach that address from the TV.');
  }
}
