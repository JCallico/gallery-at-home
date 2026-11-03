// Renders the logo to the files the app and README use.
//
//   node scripts/brand/render.mjs
//
// Writes tizen/icon.png (TV app icon), assets/brand/title.png (Home-screen
// title, 2×) and docs/logo.png (README). Needs Chromium; the lettering uses
// Noto Serif, so it's rendered to images here rather than left to the TV's
// fonts.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { icon, stacked, title } from './logo.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const tmp = mkdtempSync(join(tmpdir(), 'gah-brand-'));

function render(svg, w, h, scale, out) {
  const page = join(tmp, 'page.html');
  writeFileSync(page, `<!doctype html><html><body style="margin:0;background:transparent">${svg}</body></html>`);
  execFileSync('chromium', [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', `--force-device-scale-factor=${scale}`,
    '--default-background-color=00000000', `--window-size=${w},${h}`, `--screenshot=${out}`, `file://${page}`,
  ], { stdio: 'ignore' });
  console.log('wrote', out.replace(`${root}/`, ''));
}

render(icon(), 512, 423, 1, join(root, 'tizen/icon.png'));
render(title(), 360, 64, 2, join(root, 'assets/brand/title.png'));
render(stacked(), 520, 440, 1, join(root, 'docs/logo.png'));
