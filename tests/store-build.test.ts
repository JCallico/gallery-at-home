// @vitest-environment node
// The store build must really leave Google Photos out: the code, the worker
// and the privilege only it needs. The normal build must keep them.

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as esbuild from 'esbuild';
import { afterAll, describe, expect, it } from 'vitest';
// @ts-expect-error: a plain script, with no type declarations.
import { buildOptions, manifest } from '../scripts/build.mjs';

const dir = mkdtempSync(join(tmpdir(), 'gah-store-build-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

async function bundle(store: boolean) {
  const outdir = join(dir, String(store));
  const result = await esbuild.build({ ...buildOptions({ dev: false, outdir, store }), logLevel: 'silent', metafile: true });
  const outputs = Object.entries((result.metafile as esbuild.Metafile).outputs);
  return {
    code: readFileSync(join(outdir, 'app.js'), 'utf8'),
    scripts: outputs.map(([path]) => path.split('/').pop()).filter((name) => name?.endsWith('.js')),
    // Only what contributed code: tree-shaken modules are still listed, with 0 bytes.
    inputs: outputs.flatMap(([, output]) => Object.entries(output.inputs).filter(([, input]) => input.bytesInOutput > 0).map(([path]) => path)),
  };
}

describe('store build', () => {
  it('has no Google Photos code', async () => {
    const { code, scripts, inputs } = await bundle(true);
    expect(scripts).toEqual(['app.js']);
    expect(inputs.filter((p) => /gphotos|album-worker|fetch-text/.test(p))).toEqual([]);
    expect(code).not.toMatch(/photos\.google|photos\.app\.goo\.gl|batchexecute|album-worker|DownloadRequest/);
    expect(code).not.toContain('Google Photos, NAS');
  });

  it('doesn’t declare the download privilege', () => {
    const xml = manifest({ store: true });
    expect(xml).not.toContain('privilege/download');
    expect(xml).not.toContain('Google');
    expect(xml).toContain('privilege/externalstorage');
  });
});

describe('normal build', () => {
  it('keeps Google Photos', async () => {
    const { code, scripts } = await bundle(false);
    expect(scripts).toContain('album-worker.js');
    expect(code).toContain('Google Photos, NAS');
    expect(code).toContain('photos.app.goo.gl');
    expect(manifest()).toContain('privilege/download');
  });
});

describe('both builds', () => {
  it('declare no billing privileges', () => {
    for (const xml of [manifest(), manifest({ store: true })]) {
      expect(xml).not.toMatch(/privilege\/(productinfo|billing|sso\.partner)/);
    }
  });
});
