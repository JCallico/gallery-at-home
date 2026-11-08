// The Gallery at Home logo: an @ hung in a gold picture frame with a cream
// mat; the bowl of the @ is a small window onto a sunset landscape.
// Everything is drawn as geometry (no font glyphs) except the lettering.

const pt = (cx, cy, R, deg) => [cx + R * Math.cos((deg * Math.PI) / 180), cy + R * Math.sin((deg * Math.PI) / 180)];

/** The @'s stem and outer ring: from the top of the stem, down, round the top, ending open at the lower right. */
function atPath(cx, cy, r, R, endDeg = 52) {
  const [ex, ey] = pt(cx, cy, R, endDeg);
  return `M ${cx + r} ${cy - r * 0.95} L ${cx + r} ${cy + r * 0.25} C ${cx + r} ${cy + r * 1.05} ${cx + R} ${cy + r * 0.95} ${cx + R} ${cy} A ${R} ${R} 0 1 0 ${ex} ${ey}`;
}

let uid = 0;
const nid = (p) => `${p}${++uid}`;

/** A small sunset landscape filling a circle. */
function landscape(cx, cy, r) {
  const sky = nid('sky'), clip = nid('clip'), x0 = cx - r, w = r * 2;
  return `<defs>
    <linearGradient id="${sky}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c26b9c"/><stop offset="0.55" stop-color="#ff9a62"/><stop offset="1" stop-color="#ffcf7a"/></linearGradient>
    <clipPath id="${clip}"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath></defs>
    <g clip-path="url(#${clip})">
      <rect x="${x0}" y="${cy - r}" width="${w}" height="${w}" fill="url(#${sky})"/>
      <circle cx="${cx + r * 0.28}" cy="${cy - r * 0.05}" r="${r * 0.26}" fill="#fff1c9"/>
      <path d="M ${x0} ${cy + r * 0.32} L ${cx - r * 0.45} ${cy - r * 0.18} L ${cx - r * 0.1} ${cy + r * 0.12} L ${cx + r * 0.35} ${cy - r * 0.28} L ${cx + r} ${cy + r * 0.25} L ${cx + r} ${cy + r} L ${x0} ${cy + r} Z" fill="#7b5a8f"/>
      <path d="M ${x0} ${cy + r * 0.55} L ${cx - r * 0.2} ${cy + r * 0.18} L ${cx + r * 0.25} ${cy + r * 0.45} L ${cx + r} ${cy + r * 0.3} L ${cx + r} ${cy + r} L ${x0} ${cy + r} Z" fill="#3b2f5c"/>
      <rect x="${x0}" y="${cy + r * 0.62}" width="${w}" height="${r}" fill="#e7a07a" opacity="0.55"/>
    </g>`;
}

/** The @ mark, `d` = outer diameter. */
export function at(cx, cy, d, stroke = INK) {
  const s = d / 300, r = 62 * s, R = 132 * s, sw = 30 * s;
  return `${landscape(cx, cy, r - sw / 2 + 0.5)}
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${stroke}" stroke-width="${sw}"/>
    <path d="${atPath(cx, cy, r, R)}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/** A gold picture frame with a cream mat filling the box. */
export function frame(x, y, w, h, mat = MAT) {
  const b = Math.max(6, Math.round(Math.min(w, h) * 0.085)), g = nid('mould');
  return `<defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7e3a0"/><stop offset="0.5" stop-color="#c8963c"/><stop offset="1" stop-color="#8a6420"/></linearGradient></defs>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${b * 0.12}" fill="url(#${g})"/>
    <rect x="${x + b * 0.3}" y="${y + b * 0.3}" width="${w - b * 0.6}" height="${h - b * 0.6}" fill="none" stroke="#fff3c4" stroke-opacity="0.45" stroke-width="${Math.max(1, b * 0.09)}"/>
    <rect x="${x + b}" y="${y + b}" width="${w - 2 * b}" height="${h - 2 * b}" fill="${mat}"/>
    <rect x="${x + b}" y="${y + b}" width="${w - 2 * b}" height="${h - 2 * b}" fill="none" stroke="#000" stroke-opacity="0.12" stroke-width="${b * 0.3}"/>`;
}

export const INK = '#2a2440';
export const MAT = '#f3ead6';
export const GOLD_TEXT = '#e9c877';
const SERIF = 'Noto Serif, serif';
const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;

/** TV app icon, 512×423 (Samsung's launcher tile shape). */
export const icon = () => svg(512, 423, `<rect width="512" height="423" fill="#151318"/>${frame(18, 14, 476, 395)}${at(253, 213, 254)}`);

/**
 * Store icon, 1920×1080, in Samsung's two layers: the framed @ on a
 * transparent background (the logo), and a plain backdrop. Smart Hub may
 * mask the corners with a squircle, so the logo stays well inside the centre.
 */
export const storeLogo = () => svg(1920, 1080, `${frame(660, 240, 600, 600)}${at(960, 540, 384)}`);
export const storeBackground = () => svg(1920, 1080, `<defs><radialGradient id="bg" cx="0.5" cy="0.45" r="0.75"><stop offset="0" stop-color="#3a2f4f"/><stop offset="0.6" stop-color="#1d1824"/><stop offset="1" stop-color="#151318"/></radialGradient></defs><rect width="1920" height="1080" fill="url(#bg)"/>`);

/** Square mark. */
export const mark = (S = 256) => svg(S, S, `<rect width="${S}" height="${S}" rx="${S * 0.12}" fill="#151318"/>${frame(S * 0.06, S * 0.06, S * 0.88, S * 0.88)}${at(S / 2, S / 2, S * 0.56)}`);

/** The app's top-bar title (transparent, for the dark Home screen): framed @ + "Gallery at Home". */
export const title = () => svg(360, 64, `${frame(2, 4, 58, 56)}${at(31, 32, 32)}
  <text x="76" y="44" font-family="${SERIF}" font-size="33" font-style="italic" font-weight="500" fill="#f3ead6">Gallery</text>
  <text x="200" y="44" font-family="${SERIF}" font-size="33" font-weight="600" fill="${GOLD_TEXT}">at Home</text>`);

/** Stacked logo for the README and the like. */
export const stacked = (dark = false) => {
  const ink = dark ? '#f3ead6' : INK;
  return svg(520, 440, `<rect width="520" height="440" rx="24" fill="${dark ? '#151318' : MAT}"/>
    ${frame(150, 26, 220, 220)}${at(260, 136, 132)}
    <text x="260" y="340" text-anchor="middle" font-family="${SERIF}" font-size="62" font-style="italic" font-weight="500" fill="${ink}">Gallery</text>
    <text x="262" y="396" text-anchor="middle" font-family="${SERIF}" font-size="34" font-weight="600" letter-spacing="7" fill="#b08534">AT HOME</text>`);
};
