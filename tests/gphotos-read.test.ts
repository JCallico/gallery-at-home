import { describe, expect, it, vi } from 'vitest';
import { normalizeLink, readAlbum, Refused, type Transport } from '../src/sources/gphotos-read';

// Mirrors the shape of a real Google Photos shared-album page.
const photo = (id: string, extras: Record<string, unknown> = { 15: 1 }) => [
  id,
  [`https://lh3.googleusercontent.com/pw/${id}`, 4000, 3000, null],
  1757144641342,
  'hash',
  3600000,
  1757144641342,
  ['owner'],
  [[2]],
  2,
  extras,
];
const video = (id: string) => photo(id, { 15: 1, 76647426: [270403] });

function albumPage(items: unknown[], { token = '', total = items.length, title = 'Spain 2025' } = {}): string {
  const meta: unknown[] = new Array(22).fill(null);
  meta[0] = 'ALBUM';
  meta[1] = title;
  meta[21] = total;
  const block = (key: string, data: unknown) => `<script>AF_initDataCallback({key: '${key}', hash: '1', data:${JSON.stringify(data)}, sideChannel: {}});</script>`;
  return `<html><head><link rel="canonical" href="https://photos.google.com/share/ALBUM?key=KEY1&amp;x=1"></head>${block('ds:0', [])}${block('ds:1', [null, items, token, meta, null, 0])}</html>`;
}

const batchReply = (items: unknown[], token = '') =>
  `)]}'\n\n120\n${JSON.stringify([['wrb.fr', 'snAcKc', JSON.stringify([null, items, token]), null, null, null, 'generic']])}\n25\n[["di",12]]\n`;

const LINK = 'https://photos.app.goo.gl/AbC123';

describe('normalizeLink', () => {
  it('accepts the links Google Photos shares', () => {
    expect(normalizeLink(LINK)).toBe(LINK);
    expect(normalizeLink('https://photos.google.com/share/AF1Qip?key=abc')).toContain('/share/AF1Qip');
  });

  it('adds the scheme to a typed link and trims spaces', () => {
    expect(normalizeLink('  photos.app.goo.gl/AbC123 ')).toBe(LINK);
  });

  it('rejects the bare prefix the link box starts with', () => {
    expect(normalizeLink('https://photos.app.goo.gl/')).toBeNull();
  });

  it('rejects anything that is not a Google Photos album', () => {
    expect(normalizeLink('')).toBeNull();
    expect(normalizeLink('https://example.com/share/x')).toBeNull();
    expect(normalizeLink('https://photos.google.com/albums')).toBeNull();
    expect(normalizeLink('https://photos.app.goo.gl.evil.example/AbC')).toBeNull();
  });
});

describe('readAlbum', () => {
  const transport = (html: string, post?: Transport['post']): Transport => ({
    get: vi.fn(async () => html),
    post: post ?? vi.fn(async () => { throw new Error('no POST expected'); }),
  });

  it('reads the title, share URL and photo details from the page', async () => {
    const album = await readAlbum(LINK, transport(albumPage([photo('a'), photo('b')], { total: 2 })));
    expect(album).toMatchObject({ title: 'Spain 2025', albumId: 'ALBUM', key: 'KEY1', total: 2, complete: true });
    expect(album.url).toBe('https://photos.google.com/share/ALBUM?key=KEY1&x=1');
    expect(album.photos.map((p) => p.mediaId)).toEqual(['a', 'b']);
    expect(album.photos[0]).toEqual({
      mediaId: 'a',
      url: 'https://lh3.googleusercontent.com/pw/a',
      width: 4000,
      height: 3000,
      takenAt: 1757144641342,
    });
  });

  it('skips videos', async () => {
    const album = await readAlbum(LINK, transport(albumPage([photo('a'), video('v'), photo('b')])));
    expect(album.photos.map((p) => p.mediaId)).toEqual(['a', 'b']);
  });

  it('ignores entries that do not point at Google image hosting', async () => {
    const bad = ['x', ['https://evil.example/x.jpg', 1, 1], 0];
    const album = await readAlbum(LINK, transport(albumPage([bad, photo('a')])));
    expect(album.photos.map((p) => p.mediaId)).toEqual(['a']);
  });

  it('follows next-page tokens with the album id and key', async () => {
    const post = vi.fn(async (_url: string, body: string) => {
      const req = JSON.parse(JSON.parse(decodeURIComponent(body.replace('f.req=', '')))[0][0][1]);
      expect(req).toEqual(['ALBUM', req[1], null, 'KEY1']);
      return req[1] === 'T1' ? batchReply([photo('b')], 'T2') : batchReply([video('v'), photo('c')]);
    });
    const album = await readAlbum(LINK, transport(albumPage([photo('a')], { token: 'T1', total: 4 }), post));
    expect(post).toHaveBeenCalledTimes(2);
    expect(album.photos.map((p) => p.mediaId)).toEqual(['a', 'b', 'c']);
    expect(album.complete).toBe(true);
  });

  it('keeps the first page when later pages are refused (newer TVs)', async () => {
    const post = vi.fn(async () => { throw new Refused(); });
    const album = await readAlbum(LINK, transport(albumPage([photo('a')], { token: 'T1', total: 900 }), post));
    expect(album.photos).toHaveLength(1);
    expect(album).toMatchObject({ complete: false, total: 900 });
  });

  it('reports other failures on later pages rather than a partial album', async () => {
    const post = vi.fn(async () => { throw new Error('500'); });
    await expect(readAlbum(LINK, transport(albumPage([photo('a')], { token: 'T1' }), post))).rejects.toThrow('500');
  });

  it('stops at the item limit', async () => {
    const page = Array.from({ length: 300 }, (_, i) => photo(`p${i}`));
    const post = vi.fn(async () => batchReply(page, 'more'));
    const album = await readAlbum(LINK, transport(albumPage(page, { token: 'T1' }), post));
    expect(post).toHaveBeenCalledTimes(9);
    expect(album.photos).toHaveLength(3000);
  });

  it('explains when a page has no album data', async () => {
    await expect(readAlbum(LINK, transport('<html>Sign in</html>'))).rejects.toThrow('Couldn’t read this album');
    await expect(readAlbum('https://example.com/x', transport(''))).rejects.toThrow('isn’t a Google Photos');
  });

  it('names untitled albums', async () => {
    const album = await readAlbum(LINK, transport(albumPage([photo('a')], { title: '  ' })));
    expect(album.title).toBe('Google Photos album');
  });
});
