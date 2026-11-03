// Wikimedia Commons API helpers for choosing the built-in sample photos.
// Polite by design: one request at a time, paced, honouring Retry-After.
import { stripTags as strip } from './strip-tags.mjs';

const API = 'https://commons.wikimedia.org/w/api.php';
export const UA = 'gallery-at-home/0.1 (personal TV photo-frame app; sample-photo curation)';

let last = 0;
async function paced() {
  const wait = last + 1500 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
}

export async function get(url) {
  for (let attempt = 0; attempt < 6; attempt++) {
    await paced();
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.status === 429 || res.status >= 500) {
      const s = Number(res.headers.get('retry-after')) || 30;
      console.error(`  ${res.status}, waiting ${s}s`);
      await new Promise((r) => setTimeout(r, s * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return res;
  }
  throw new Error(`gave up: ${url}`);
}

export async function api(params) {
  const q = new URLSearchParams({ format: 'json', formatversion: '2', ...params });
  return (await get(`${API}?${q}`)).json();
}

/** Subcategories of a category. */
export async function subcats(cat) {
  const d = await api({ action: 'query', list: 'categorymembers', cmtitle: `Category:${cat}`, cmtype: 'subcat', cmlimit: '500' });
  return (d.query?.categorymembers ?? []).map((m) => m.title.replace(/^Category:/, ''));
}


/** Files in a category with size, licence, author and a preview URL. */
export async function files(cat, { previewWidth = 640, max = 600 } = {}) {
  const out = [];
  let cont = {};
  do {
    const d = await api({
      action: 'query', generator: 'categorymembers', gcmtitle: `Category:${cat}`, gcmtype: 'file', gcmlimit: '50',
      prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: String(previewWidth),
      iiextmetadatafilter: 'LicenseShortName|LicenseUrl|Artist|ObjectName|ImageDescription|DateTimeOriginal|Credit|UsageTerms',
      ...cont,
    });
    for (const p of d.query?.pages ?? []) {
      const ii = p.imageinfo?.[0];
      if (!ii) continue;
      const m = ii.extmetadata ?? {};
      out.push({
        title: p.title,
        page: ii.descriptionurl,
        url: ii.url,
        preview: ii.thumburl,
        width: ii.width,
        height: ii.height,
        mime: ii.mime,
        license: strip(m.LicenseShortName?.value),
        licenseUrl: strip(m.LicenseUrl?.value),
        artist: strip(m.Artist?.value),
        name: strip(m.ObjectName?.value),
        description: strip(m.ImageDescription?.value).slice(0, 300),
        date: strip(m.DateTimeOriginal?.value),
      });
    }
    cont = d.continue ?? null;
  } while (cont && out.length < max);
  return out;
}

/** Licences that allow bundling the photo in an app (with attribution where required). */
export function allowedLicense(l) {
  return /^(public domain|pd|cc0|cc by(-sa)? \d(\.\d)?)/i.test(l) && !/nc|nd/i.test(l);
}
