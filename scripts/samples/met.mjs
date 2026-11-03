// Candidates for the "Masterpieces" collection from The Met's Open Access
// API: public-domain highlights (CC0), landscapes and seascapes.
//
//   node scripts/samples/met.mjs <workdir>
//
// Writes <workdir>/paintings.json and <workdir>/paintings/NNN.jpg previews.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const API = 'https://collectionapi.metmuseum.org/public/collection/v1';
export const MET_LICENSE = { license: 'CC0 1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/' };

// The API sits behind a bot firewall that blocks bursts: one request at a
// time, paced, backing off when refused.
let last = 0;
async function json(url) {
  for (let i = 0; i < 5; i++) {
    const wait = last + 1200 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    const res = await fetch(url, { headers: { 'User-Agent': 'gallery-at-home/0.1 (personal TV photo-frame app)' } });
    if (res.ok) return res.json();
    console.error(`  ${res.status}, backing off`);
    await new Promise((r) => setTimeout(r, 15000 * (i + 1)));
  }
  throw new Error(`failed: ${url}`);
}

export const metObject = (id) => json(`${API}/objects/${id}`);

const SEARCHES = [
  // European Paintings; The American Wing; Asian Art (Japanese prints); The Robert Lehman Collection
  { departmentId: 11, q: 'landscape' }, { departmentId: 11, q: 'sea' }, { departmentId: 11, q: 'garden' },
  { departmentId: 1, q: 'landscape' }, { departmentId: 1, q: 'river' },
  { departmentId: 6, q: 'Fuji' }, { departmentId: 6, q: 'wave' },
  { departmentId: 15, q: 'landscape' }, { departmentId: 21, q: 'landscape' },
];

const work = process.argv[2];
if (import.meta.url === `file://${process.argv[1]}`) {
  if (!work) throw new Error('usage: met.mjs <workdir>');
  const ids = new Set();
  for (const s of SEARCHES) {
    // v1.1 search is paginated (the unpaginated v1 search was retired).
    let total = 0;
    for (let offset = 0; offset === 0 || offset < Math.min(total, 200); offset += 50) {
      const r = await json(`${API.replace('/v1', '/v1.1')}/search?isHighlight=true&hasImages=true&departmentId=${s.departmentId}&q=${encodeURIComponent(s.q)}&limit=50&offset=${offset}`);
      total = r.total ?? 0;
      (r.objectIDs ?? []).forEach((id) => ids.add(id));
    }
    console.error(`${s.departmentId}/${s.q}: ${total}`);
  }
  const dir = join(work, 'paintings');
  mkdirSync(dir, { recursive: true });
  const list = [];
  for (const id of ids) {
    const o = await metObject(id).catch((err) => {
      console.error(String(err));
      return null;
    });
    if (!o) continue;
    if (!o.isPublicDomain || !o.primaryImageSmall) continue;
    if (!/painting|print/i.test(o.classification ?? '')) continue;
    const n = list.length + 1;
    list.push({ n, id, title: o.title, artist: o.artistDisplayName, date: o.objectDate, classification: o.classification, page: o.objectURL, image: o.primaryImage });
    const img = await fetch(o.primaryImageSmall);
    writeFileSync(join(dir, `${String(n).padStart(3, '0')}.jpg`), Buffer.from(await img.arrayBuffer()));
  }
  writeFileSync(join(work, 'paintings.json'), JSON.stringify(list, null, 1));
  console.error(`paintings: ${list.length} candidates`);
}
