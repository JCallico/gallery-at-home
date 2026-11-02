// Development server: runs the TV app in a desktop browser.
//
//   npm run dev   →  http://localhost:5173
//
// - Bundles with esbuild in watch mode and live-reloads the page.
// - Serves dev/sample-usb as a fake USB drive ("removable_sda1"), standing
//   in for tizen.filesystem.
// - /__dev/proxy forwards cross-origin requests (WebDAV,
//   web links). On the TV the packaged app needs no proxy: config.xml's
//   <access> grants cross-origin access directly.
// - Answers the TV-only $WEBAPIS script with an empty file.

import * as esbuild from 'esbuild';
import { createReadStream, readdirSync, statSync } from 'node:fs';
import http from 'node:http';
import { dirname, join, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { buildOptions, writeStatic } from '../scripts/build.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outdir = join(here, '.state', 'www');
const usbRoot = join(here, 'sample-usb');
const DRIVE = 'removable_sda1';
const PORT = Number(process.env.PORT ?? 5173);
const HOST = process.env.HOST ?? '127.0.0.1';

writeStatic(outdir);
const ctx = await esbuild.context(buildOptions({ dev: true, outdir }));
await ctx.watch();
const { port: esbuildPort } = await ctx.serve({ servedir: outdir, host: '127.0.0.1', port: 0 });

// --- Fake USB drive ---------------------------------------------------------

function diskPath(virtual) {
  if (virtual !== DRIVE && !virtual.startsWith(`${DRIVE}/`)) throw new Error('No such drive');
  const full = resolve(usbRoot, `.${virtual.slice(DRIVE.length)}`);
  if (full !== usbRoot && !full.startsWith(usbRoot + sep)) throw new Error('Outside the drive');
  return full;
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function serveFile(req, res, file) {
  const { size } = statSync(file);
  const type = /\.png$/i.test(file) ? 'image/png' : /\.webp$/i.test(file) ? 'image/webp' : 'image/jpeg';
  const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? '');
  if (range) {
    const start = Number(range[1]);
    const end = Math.min(range[2] ? Number(range[2]) : size - 1, size - 1);
    res.writeHead(206, {
      'Content-Type': type,
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': end - start + 1,
      'Accept-Ranges': 'bytes',
    });
    createReadStream(file, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'max-age=3600' });
    createReadStream(file).pipe(res);
  }
}

function handleFs(req, res, url) {
  try {
    if (url.pathname === '/__dev/fs/drives') {
      return json(res, 200, [{ label: DRIVE, name: 'USB drive' }]);
    }
    const path = url.searchParams.get('path') ?? '';
    const full = diskPath(path);
    if (url.pathname === '/__dev/fs/list') {
      const entries = readdirSync(full, { withFileTypes: true })
        .filter((d) => !d.name.startsWith('.'))
        .map((d) => ({
          name: d.name,
          path: `${path}/${d.name}`,
          isDir: d.isDirectory(),
          modified: statSync(join(full, d.name)).mtimeMs,
        }));
      return json(res, 200, entries);
    }
    if (url.pathname === '/__dev/fs/file') return serveFile(req, res, full);
    json(res, 404, { error: 'unknown fs route' });
  } catch (err) {
    json(res, 404, { error: String(err.message) });
  }
}

// --- CORS-free proxy --------------------------------------------------------

const HOP_HEADERS = new Set(['host', 'origin', 'referer', 'connection', 'content-length', 'accept-encoding', 'cookie']);

async function handleProxy(req, res, url) {
  const target = url.searchParams.get('url');
  if (!target || !/^https?:\/\//.test(target)) return json(res, 400, { error: 'url required' });
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) if (!HOP_HEADERS.has(k) && !k.startsWith('sec-')) headers[k] = v;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: chunks.length ? Buffer.concat(chunks) : undefined,
      redirect: 'follow',
    });
    const out = {};
    upstream.headers.forEach((v, k) => {
      if (!['content-encoding', 'content-length', 'transfer-encoding', 'set-cookie'].includes(k)) out[k] = v;
    });
    res.writeHead(upstream.status, out);
    if (upstream.body) Readable.fromWeb(upstream.body).pipe(res);
    else res.end();
  } catch (err) {
    json(res, 502, { error: `proxy: ${err.message}` });
  }
}

// --- Everything else goes to esbuild ------------------------------------------

function forwardToEsbuild(req, res) {
  const upstream = http.request(
    { host: '127.0.0.1', port: esbuildPort, path: req.url, method: req.method, headers: req.headers },
    (r) => {
      res.writeHead(r.statusCode ?? 500, r.headers);
      r.pipe(res);
    },
  );
  upstream.on('error', () => res.writeHead(502).end());
  req.pipe(upstream);
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/__dev/fs/')) return handleFs(req, res, url);
    if (url.pathname === '/__dev/proxy') return void handleProxy(req, res, url);
    if (url.pathname.includes('/webapis/webapis.js')) {
      res.writeHead(200, { 'Content-Type': 'text/javascript' });
      return res.end('// Samsung webapis are only available on the TV\n');
    }
    forwardToEsbuild(req, res);
  })
  .listen(PORT, HOST, () => console.log(`\n  Gallery at Home dev server: http://localhost:${PORT}\n`));
