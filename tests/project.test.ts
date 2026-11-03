// Guards the things that only fail on a real TV, where they're easy to miss:
// engine compatibility, the app manifest, and the included photos' files
// and licences.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SAMPLE_COLLECTIONS } from '../src/samples';

const root = join(__dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');

describe('oldest supported TV engine (Chromium 63, 2019 TVs)', () => {
  it('is what the build targets', () => {
    expect(read('scripts/build.mjs')).toContain("TARGET = ['chrome63']");
    expect(read('tizen/config.xml')).toContain('required_version="5.0"');
  });

  // esbuild lowers new syntax, but can't add missing functions.
  const NEWER_APIS: [RegExp, string][] = [
    [/\.flatMap\(/, 'Array.flatMap (Chromium 69)'],
    [/\.flat\(/, 'Array.flat (69)'],
    [/Object\.fromEntries/, 'Object.fromEntries (73)'],
    [/\.matchAll\(/, 'String.matchAll (73)'],
    [/\.replaceAll\(/, 'String.replaceAll (85)'],
    [/\.trimStart\(|\.trimEnd\(/, 'trimStart/trimEnd (66)'],
    [/\.at\(-?\d/, 'Array.at (92)'],
    [/\bglobalThis\b/, 'globalThis (71)'],
    [/\bstructuredClone\b/, 'structuredClone (98)'],
    [/\bqueueMicrotask\b/, 'queueMicrotask (71)'],
    [/\bResizeObserver\b/, 'ResizeObserver (64)'],
    [/Promise\.(allSettled|any)\b/, 'Promise.allSettled/any (76/85)'],
    [/AbortSignal\.timeout/, 'AbortSignal.timeout (103)'],
  ];
  const sources = walk(join(root, 'src')).filter((f) => /\.tsx?$/.test(f));

  it.each(NEWER_APIS)('source code avoids %s', (pattern, what) => {
    const offenders = sources.filter((f) => pattern.test(stripComments(readFileSync(f, 'utf8'))));
    expect(offenders, `${what} is missing on 2019 TVs`).toEqual([]);
  });

  const NEWER_CSS: [RegExp, string][] = [
    [/(^|[\s;{])gap\s*:/m, 'gap (grid: Chromium 66, flex: 84); use grid-gap or margins'],
    [/(^|[\s;{])inset\s*:/m, 'inset (87)'],
    [/\b(clamp|min|max)\(/, 'clamp/min/max (79)'],
    [/\bcolor-mix\(/, 'color-mix (111)'],
    [/:(is|where|has)\(/, ':is/:where/:has (88+)'],
  ];

  it.each(NEWER_CSS)('stylesheets avoid %s', (pattern, what) => {
    for (const file of ['src/styles.css', 'src/player.css']) {
      expect(pattern.test(stripComments(read(file))), `${file} uses ${what}`).toBe(false);
    }
  });
});

describe('app manifest', () => {
  const xml = new DOMParser().parseFromString(read('tizen/config.xml').replace('@VERSION@', '1.0.0'), 'application/xml');
  const csp = xml.getElementsByTagName('tizen:content-security-policy')[0]?.textContent ?? '';

  it('is well-formed', () => {
    expect(xml.querySelector('parsererror')).toBeNull();
  });

  it('has the name the store listing must match', () => {
    expect(xml.querySelector('name')?.textContent).toBe('Gallery at Home');
  });

  it('allows the embedded plugin behind the screensaver control on 2020 TVs', () => {
    // An object-src limit silently breaks it on the TV, but not in a browser.
    expect(csp).toContain('default-src');
    expect(csp).not.toMatch(/object-src/);
  });

  it('allows the image types the app creates', () => {
    expect(csp).toMatch(/img-src[^;]*blob:/);
  });
});

describe('app page', () => {
  it('sends no referrer, which Google Photos image links require', () => {
    expect(read('src/index.html')).toContain('<meta name="referrer" content="no-referrer">');
  });
});

describe('included collections', () => {
  const photos = SAMPLE_COLLECTIONS.flatMap((c) => c.photos.map((p) => ({ collection: c.id, ...p })));

  it('are all there', () => {
    expect(SAMPLE_COLLECTIONS).toHaveLength(7);
    expect(photos).toHaveLength(56);
  });

  it.each(photos.map((p) => [`${p.collection}/${p.file}`, p] as const))('%s has its files', (path, p) => {
    expect(existsSync(join(root, 'assets/samples', path))).toBe(true);
    expect(existsSync(join(root, 'assets/samples', p.collection, 'thumb', p.file))).toBe(true);
  });

  it('only use licences that allow bundling, and credit their authors', () => {
    const credits = read('CREDITS.md');
    for (const p of photos) {
      expect(p.license, p.title).toMatch(/^(public domain|cc0|cc by(-sa)? \d)/i);
      expect(p.license, p.title).not.toMatch(/\b(nc|nd)\b/i);
      expect(p.by, p.title).toBeTruthy();
      expect(credits, p.title).toContain(p.title);
    }
  });
});
