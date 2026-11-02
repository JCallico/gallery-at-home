// Step 1 of choosing the sample collections: list Commons featured pictures
// per theme, keep those whose licence allows bundling and whose shape suits a
// TV, and download small previews for review.
//
//   node scripts/samples/candidates.mjs <workdir>
//
// Writes <workdir>/<theme>.json and <workdir>/<theme>/NNN.jpg previews.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { allowedLicense, files, get, subcats } from './commons.mjs';

export const THEMES = {
  mountains: { cats: ['Featured pictures of mountains'] },
  lakes: { cats: ['Featured pictures of lakes', 'Featured pictures of watercourses'] },
  coast: { cats: ['Featured pictures of coasts', 'Featured pictures of beaches', 'Featured pictures of islands'] },
  forests: { cats: ['Featured pictures of forests', 'Featured pictures of waterfalls'] },
  night: { cats: ['Featured pictures of aurora', 'Featured night photography', 'Featured pictures of twilights'] },
  space: { cats: ['Featured pictures taken from satellites', 'Featured pictures of galaxies', 'Featured pictures of planets', 'Featured pictures of the Moon'] },
  // Paintings come from The Met instead (see met.mjs): Commons files its
  // paintings by museum, not by genre.
};

// Enough to choose 8 good ones from, without fetching thousands of previews.
const MAX_PER_THEME = 120;

const work = process.argv[2];
if (!work) throw new Error('usage: candidates.mjs <workdir>');
const only = process.argv[3]?.split(',');

for (const [theme, { cats, art = false }] of Object.entries(THEMES)) {
  if (only && !only.includes(theme)) continue;
  const seen = new Set();
  const list = [];
  // Paintings are filed by genre in subcategories; take those too.
  const all = art ? [...cats, ...(await subcats(cats[0]))] : cats;
  for (const cat of all) {
    if (list.length >= MAX_PER_THEME) break;
    for (const f of await files(cat, { max: art ? 150 : 400, previewWidth: 500 })) {
      if (seen.has(f.title)) continue;
      seen.add(f.title);
      const ratio = f.width / f.height;
      const shapeOk = art ? ratio > 0.6 && ratio < 2.1 : ratio > 1.25 && ratio < 2.1; // no panoramas
      if (f.mime !== 'image/jpeg' || !shapeOk || Math.max(f.width, f.height) < 2000) continue;
      if (!allowedLicense(f.license)) continue;
      list.push({ ...f, cat });
      if (list.length >= MAX_PER_THEME) break;
    }
    console.error(`${theme}: ${cat} → ${list.length}`);
  }
  const dir = join(work, theme);
  mkdirSync(dir, { recursive: true });
  for (const [i, f] of list.entries()) {
    f.n = i + 1;
    const file = join(dir, `${String(f.n).padStart(3, '0')}.jpg`);
    if (existsSync(file)) continue; // already fetched on an earlier run
    const res = await get(f.preview);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  writeFileSync(join(work, `${theme}.json`), JSON.stringify(list, null, 1));
  console.error(`${theme}: ${list.length} candidates`);
}
