// Step 2: turn the chosen photos (picks.json) into the included collections.
//
//   node scripts/samples/build.mjs [workdir]
//
// For each pick (a Commons file, or a Met artwork chosen with met.mjs):
// reads its licence and author, downloads a large rendition, and writes
//   assets/samples/<theme>/<slug>.jpg         screen-sized (within 1920×1400)
//   assets/samples/<theme>/thumb/<slug>.jpg   grid-sized (480 long edge)
//   src/samples/manifest.json                 what the app reads
//   CREDITS.md                                attribution, with links
// Images are re-encoded with ImageMagick (`magick`), which also drops their
// metadata; EXIF rotation is applied first so every file is upright.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allowedLicense, api, get } from './commons.mjs';
import { MET_LICENSE } from './met.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const work = process.argv[2] ?? '/tmp/gallery-at-home-samples/originals';
const picks = JSON.parse(readFileSync(join(root, 'scripts/samples/picks.json'), 'utf8'));

const strip = (html) => (html ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const slug = (s) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').slice(0, 60);

async function info(title) {
  const d = await api({
    action: 'query', titles: title, prop: 'imageinfo', iiprop: 'url|size|extmetadata', iiurlwidth: '1920',
    iiextmetadatafilter: 'LicenseShortName|LicenseUrl|Artist|ObjectName|DateTimeOriginal',
  });
  const ii = d.query.pages[0].imageinfo?.[0];
  if (!ii) throw new Error(`Not found: ${title}`);
  const m = ii.extmetadata ?? {};
  return {
    page: ii.descriptionurl,
    // A 1920-wide rendition (a size Commons keeps cached), or the original.
    url: ii.width > 1920 ? ii.thumburl : ii.url,
    width: ii.width,
    height: ii.height,
    license: strip(m.LicenseShortName?.value),
    licenseUrl: strip(m.LicenseUrl?.value),
    artist: strip(m.Artist?.value),
    name: strip(m.ObjectName?.value),
    date: strip(m.DateTimeOriginal?.value),
  };
}

function magick(args) {
  execFileSync('magick', args, { stdio: ['ignore', 'ignore', 'inherit'] });
}

function size(file) {
  const [w, h] = execFileSync('magick', ['identify', '-format', '%w %h', file]).toString().split(' ').map(Number);
  return { width: w, height: h };
}

const out = join(root, 'assets/samples');
rmSync(out, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

const manifest = { collections: [] };
const credits = ['# Photo credits', '', 'The collections included with the app. Every photo was resized and re-encoded for the TV; otherwise unchanged.', ''];

for (const c of picks.collections) {
  mkdirSync(join(out, c.id, 'thumb'), { recursive: true });
  const photos = [];
  credits.push(`## ${c.name}`, '');
  for (const p of c.photos) {
    // Commons files: licence and author read fresh from Commons. Met works:
    // public domain, details recorded in picks.json when they were chosen.
    const meta = p.met
      ? { page: p.page, url: p.image, artist: p.by, ...MET_LICENSE }
      : await info(p.file);
    if (!p.met && !allowedLicense(meta.license)) throw new Error(`Licence not allowed for ${p.file}: ${meta.license}`);
    const file = `${slug(p.title)}.jpg`;
    const original = join(work, `${c.id}-${file}`);
    if (!existsSync(original)) writeFileSync(original, Buffer.from(await (await get(meta.url)).arrayBuffer()));

    // Screen size: fit within 1920×1400, never enlarged. Portraits (art)
    // get up to 1400 px tall, enough for a framed photo on a 1080p stage.
    const full = join(out, c.id, file);
    // The Met photographs paintings against black; trim that so the canvas
    // meets the mat. (A few px of tolerance for the dark, uneven edge.)
    const trim = p.met ? ['-bordercolor', 'black', '-border', '1', '-fuzz', '12%', '-trim', '+repage', '-shave', '4x4'] : [];
    magick([original, '-auto-orient', ...trim, '-resize', '1920x1400>', '-strip', '-interlace', 'none', '-sampling-factor', '4:2:0', '-quality', '84', full]);
    magick([full, '-resize', '480x480>', '-strip', '-quality', '80', join(out, c.id, 'thumb', file)]);
    const dims = size(full);

    const by = p.by ?? meta.artist;
    photos.push({ file, title: p.title, by, license: meta.license, licenseUrl: meta.licenseUrl || undefined, source: meta.page, ...dims });
    credits.push(`- **${p.title}**: ${by}. ${meta.license}${meta.licenseUrl ? ` (<${meta.licenseUrl}>)` : ''}. Source: <${meta.page}>`);
    console.error(`${c.id}: ${p.title} (${meta.license})`);
  }
  credits.push('');
  manifest.collections.push({ id: c.id, name: c.name, play: c.play ?? {}, photos });
}

writeFileSync(join(root, 'src/samples/manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);
writeFileSync(join(root, 'CREDITS.md'), credits.join('\n'));
const total = execFileSync('du', ['-sh', out]).toString().split('\t')[0];
console.error(`Done: ${manifest.collections.reduce((n, c) => n + c.photos.length, 0)} photos, ${total}`);
