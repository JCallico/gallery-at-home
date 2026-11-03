// Bundles the app into dist/ (or dev/.state/www for the dev server).
//
//   node scripts/build.mjs            production build for the TV → dist/
//
// Output targets Chromium 63, the web engine of 2019 Samsung TVs (Tizen 5.0);
// 2020 TVs (Tizen 5.5) run Chromium 69.

import * as esbuild from 'esbuild';
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

export const TARGET = ['chrome63'];

export function buildOptions({ dev, outdir }) {
  return {
    entryPoints: { app: join(root, 'src/main.tsx'), 'album-worker': join(root, 'src/sources/album-worker.ts') },
    bundle: true,
    outdir,
    target: TARGET,
    format: 'iife',
    jsx: 'automatic',
    jsxImportSource: 'preact',
    minify: !dev,
    sourcemap: dev ? 'inline' : false,
    legalComments: 'none',
    logLevel: 'info',
    define: {
      __DEV__: String(dev),
      __VERSION__: JSON.stringify(pkg.version),
    },
    // Live reload for the dev server.
    // (Pages only: the album worker shares these options but has no page to reload.)
    banner: dev ? { js: "if (typeof document !== 'undefined') new EventSource('/esbuild').addEventListener('change', () => location.reload());" } : undefined,
  };
}

export function writeStatic(outdir) {
  mkdirSync(outdir, { recursive: true });
  copyFileSync(join(root, 'src/index.html'), join(outdir, 'index.html'));
  copyFileSync(join(root, 'tizen/icon.png'), join(outdir, 'icon.png'));
  const config = readFileSync(join(root, 'tizen/config.xml'), 'utf8').replace('@VERSION@', pkg.version);
  writeFileSync(join(outdir, 'config.xml'), config);
  // The included collections' photos (see scripts/samples/) and the logo
  // images (see scripts/brand/).
  for (const dir of ['samples', 'brand']) {
    const from = join(root, 'assets', dir);
    if (existsSync(from)) cpSync(from, join(outdir, dir), { recursive: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const outdir = join(root, 'dist');
  rmSync(outdir, { recursive: true, force: true });
  await esbuild.build(buildOptions({ dev: false, outdir }));
  writeStatic(outdir);
  console.log(`Built ${pkg.name} ${pkg.version} → dist/`);
}
