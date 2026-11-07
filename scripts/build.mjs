// Bundles the app into dist/ (or dev/.state/www for the dev server).
//
//   node scripts/build.mjs            production build for the TV → dist/
//   node scripts/build.mjs --store    build for the Samsung store → dist-store/
//
// The store build leaves out the Google Photos source, its code and the
// privilege only it needs, until it can use an official Google interface
// (see docs/PUBLISHING.md).
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

/**
 * Empties the modules behind the Google Photos source in the store build.
 * Their uses are behind __GOOGLE_PHOTOS__, but tree-shaking alone leaves part
 * of them in the bundle.
 */
const omitGooglePhotos = {
  name: 'omit-google-photos',
  setup(build) {
    build.onLoad({ filter: /[\\/]src[\\/](sources[\\/]gphotos\.ts|screens[\\/]add-gphotos\.tsx)$/ }, () => ({ contents: '', loader: 'empty' }));
  },
};

export function buildOptions({ dev, outdir, store = false }) {
  return {
    plugins: store ? [omitGooglePhotos] : [],
    // Expected there: the emptied modules' imports, all behind __GOOGLE_PHOTOS__.
    logOverride: store ? { 'import-is-undefined': 'silent' } : {},
    entryPoints: {
      app: join(root, 'src/main.tsx'),
      ...(store ? {} : { 'album-worker': join(root, 'src/sources/album-worker.ts') }),
    },
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
      __GOOGLE_PHOTOS__: String(!store),
    },
    // Live reload for the dev server.
    // (Pages only: the album worker shares these options but has no page to reload.)
    banner: dev ? { js: "if (typeof document !== 'undefined') new EventSource('/esbuild').addEventListener('change', () => location.reload());" } : undefined,
  };
}

/** The app manifest; the store build doesn't declare the download privilege. */
export function manifest({ store = false } = {}) {
  const config = readFileSync(join(root, 'tizen/config.xml'), 'utf8').replace('@VERSION@', pkg.version);
  if (!store) return config;
  const stripped = config.replace(/\n\s*<!-- The download manager[\s\S]*?privilege\/download"\/>/, '');
  if (stripped === config) throw new Error('tizen/config.xml: the download privilege block has changed');
  return stripped;
}

export function writeStatic(outdir, { store = false } = {}) {
  mkdirSync(outdir, { recursive: true });
  copyFileSync(join(root, 'src/index.html'), join(outdir, 'index.html'));
  copyFileSync(join(root, 'tizen/icon.png'), join(outdir, 'icon.png'));
  writeFileSync(join(outdir, 'config.xml'), manifest({ store }));
  // The included collections' photos (see scripts/samples/) and the logo
  // images (see scripts/brand/).
  for (const dir of ['samples', 'brand']) {
    const from = join(root, 'assets', dir);
    if (existsSync(from)) cpSync(from, join(outdir, dir), { recursive: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const store = process.argv.includes('--store');
  const name = store ? 'dist-store' : 'dist';
  const outdir = join(root, name);
  rmSync(outdir, { recursive: true, force: true });
  await esbuild.build(buildOptions({ dev: false, outdir, store }));
  writeStatic(outdir, { store });
  console.log(`Built ${pkg.name} ${pkg.version} → ${name}/`);
}
