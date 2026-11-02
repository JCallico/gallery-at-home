// Photos from the internet. Each saved URL is either a direct image link or
// a "list": a text file with one URL per line, a JSON array of URLs (or of
// objects with a `url`), or a web page whose images are collected.

import { fetchHead } from './exif';
import { isImageName, request, viaProxy } from './net';
import { WebSource } from '../store/types';
import { Entry, Listing, photoRef, SourceAdapter } from './types';

function looksLikeImage(url: string): boolean {
  try {
    return isImageName(new URL(url).pathname);
  } catch {
    return false;
  }
}

function nameFor(url: string): string {
  const u = new URL(url);
  const seg = decodeURIComponent(u.pathname.slice(u.pathname.lastIndexOf('/') + 1));
  return seg || u.host;
}

function urlsFromJson(data: unknown): string[] {
  const list = Array.isArray(data) ? data : (data as any)?.photos ?? (data as any)?.images ?? [];
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => (typeof item === 'string' ? item : item?.url ?? item?.src))
    .filter((u): u is string => typeof u === 'string');
}

async function expandList(listUrl: string): Promise<string[]> {
  const res = await request(listUrl);
  const type = res.headers.get('content-type') ?? '';
  const text = await res.text();
  let urls: string[];
  if (type.includes('json') || /^\s*[[{]/.test(text)) {
    urls = urlsFromJson(JSON.parse(text));
  } else if (type.includes('html') || /<html|<img/i.test(text)) {
    const doc = new DOMParser().parseFromString(text, 'text/html');
    urls = [
      ...Array.from(doc.querySelectorAll('img[src]')).map((i) => i.getAttribute('src')!),
      ...Array.from(doc.querySelectorAll('a[href]')).map((a) => a.getAttribute('href')!).filter(looksLikeImage),
    ];
  } else {
    urls = text.split(/\s+/).filter((line) => /^https?:\/\//i.test(line));
  }
  const absolute = urls.map((u) => new URL(u, listUrl).href);
  return Array.from(new Set(absolute)).filter((u) => /^https?:/.test(u));
}

export function webAdapter(source: WebSource): SourceAdapter {
  const toPhoto = (url: string): Entry => ({ type: 'photo', ref: photoRef(source.id, url, nameFor(url)) });
  return {
    source,
    async list(folderKey): Promise<Listing> {
      if (folderKey) {
        const urls = await expandList(folderKey);
        return { key: folderKey, title: new URL(folderKey).host, entries: urls.map(toPhoto) };
      }
      const entries = source.urls.map((url) =>
        looksLikeImage(url) ? toPhoto(url) : { type: 'folder' as const, key: url, name: `${new URL(url).host}${new URL(url).pathname}` },
      );
      return { key: null, title: source.name, entries };
    },
    // Plain <img> loads are not subject to CORS, so no proxy is needed.
    thumbUrl: (ref) => Promise.resolve(ref.key),
    imageUrl: (ref) => Promise.resolve(ref.key),
    readHead: (ref) => fetchHead(viaProxy(ref.key)),
  };
}
