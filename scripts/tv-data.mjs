// Saves and restores the app's data on a TV (or the emulator), so the app
// can be uninstalled and reinstalled without losing collections, sources
// and settings. Used by `scripts/tv.sh deploy` when a TV refuses to update
// the app in place.
//
//   node scripts/tv-data.mjs backup  <sdb-serial> <file.json>
//   node scripts/tv-data.mjs restore <sdb-serial> <file.json>
//
// How: relaunches the app in debug mode, forwards its DevTools port, and
// reads or writes localStorage through the DevTools protocol. The app is
// left closed afterwards; `tv.sh` launches it normally.
//
// The backup holds everything the app stores, including Google Photos album
// links and network-share passwords, so keep it private.

import { execFile } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const TIZEN_HOME = process.env.TIZEN_HOME ?? join(homedir(), 'tizen-studio');
const SDB = join(TIZEN_HOME, 'tools/sdb');
const APP_ID = 'GalleryAtH.GalleryAtHome';
const PACKAGE = APP_ID.split('.')[0];
const KEY_PREFIX = 'gah.';

const [mode, serial, file] = process.argv.slice(2);
if (!['backup', 'restore'].includes(mode) || !serial || !file) {
  console.error('usage: node scripts/tv-data.mjs backup|restore <sdb-serial> <file.json>');
  process.exit(2);
}

const sdb = (...args) => run(SDB, ['-s', serial, ...args], { timeout: 60000 }).then((r) => r.stdout + r.stderr);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Launches the app in debug mode; returns the TV-side DevTools port. */
async function launchDebug() {
  for (let attempt = 0; attempt < 3; attempt++) {
    await sdb('shell', '0', 'kill', PACKAGE).catch(() => undefined);
    await sleep(2000);
    const out = await sdb('shell', '0', 'debug', APP_ID).catch((e) => String(e.stdout ?? e));
    const port = /port: (\d+)/.exec(out)?.[1];
    if (port) return Number(port);
  }
  throw new Error(`Couldn't start ${APP_ID} in debug mode on ${serial}. Is it installed?`);
}

/** One DevTools session; the TV ends it when the client disconnects, so it's used once. */
async function devtools(localPort) {
  let page;
  for (let i = 0; i < 20 && !page; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${localPort}/json`)).json();
      page = targets.find((t) => t.type === 'page');
    } catch {
      await sleep(500);
    }
  }
  if (!page) throw new Error('The app\'s debug connection didn\'t come up');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('Debug connection failed')), { once: true });
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    pending.get(m.id)?.(m);
    pending.delete(m.id);
  });
  return {
    async eval(expression) {
      const n = ++id;
      const reply = await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('Timed out talking to the TV')), 30000);
        pending.set(n, (m) => {
          clearTimeout(t);
          resolve(m);
        });
        ws.send(JSON.stringify({ id: n, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
      });
      if (reply.error) throw new Error(reply.error.message);
      const r = reply.result;
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    },
    close: () => ws.close(),
  };
}

const localPort = 9300 + Math.floor(Math.random() * 500);
let session;
try {
  const tvPort = await launchDebug();
  await sdb('forward', `tcp:${localPort}`, `tcp:${tvPort}`);
  await sleep(1500);
  session = await devtools(localPort);
  // Plain ES5 for the TVs' older engines.
  if (mode === 'backup') {
    const data = await session.eval(`(function () {
      var o = {};
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k.indexOf(${JSON.stringify(KEY_PREFIX)}) === 0) o[k] = localStorage.getItem(k);
      }
      return o;
    })()`);
    writeFileSync(file, JSON.stringify(data), { mode: 0o600 });
    const state = data['gah.state.v1'] ? JSON.parse(data['gah.state.v1']) : null;
    console.log(state
      ? `Saved ${state.collections.length} collections and ${state.sources.length} sources from ${serial}`
      : `No app data on ${serial} yet (saved an empty backup)`);
  } else {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    const keys = Object.keys(data).filter((k) => k.startsWith(KEY_PREFIX));
    if (!keys.length) {
      console.log('Backup is empty; nothing to restore');
    } else {
      const n = await session.eval(`(function (o) {
        var n = 0;
        for (var k in o) { localStorage.setItem(k, o[k]); n++; }
        return n;
      })(${JSON.stringify(Object.fromEntries(keys.map((k) => [k, data[k]])))})`);
      const state = data['gah.state.v1'] ? JSON.parse(data['gah.state.v1']) : null;
      console.log(`Restored ${n} items${state ? ` (${state.collections.length} collections)` : ''} on ${serial}`);
    }
  }
} finally {
  session?.close();
  await sdb('forward', '--remove', `tcp:${localPort}`).catch(() => undefined);
  await sdb('shell', '0', 'kill', PACKAGE).catch(() => undefined);
}
