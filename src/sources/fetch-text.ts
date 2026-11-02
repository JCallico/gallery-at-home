// Fetching a web page's text, with a fallback for newer TVs.
//
// Newer browser engines (Chromium 76+, so 2021+ TVs and the Tizen 10
// emulator) label every request an app makes "Sec-Fetch-Site: cross-site",
// and some sites refuse those outright, Google Photos among them. Tizen's
// download manager isn't a browser and doesn't add the label, so when a
// fetch is refused the page is downloaded to the app's temporary folder and
// read from there. It can only make plain GET requests, and it's slower.

import { HttpError, request } from './net';

declare const tizen: any;

/** Once a site has refused the browser engine, go straight to the download manager. */
const refusedHosts = new Set<string>();

export function canDownload(): boolean {
  return typeof tizen !== 'undefined' && !!tizen.download && !!tizen.filesystem?.openFile;
}

/** True when `err` is the refusal newer engines get (or a network error with the same cause). */
export function isRefused(err: unknown): boolean {
  return (err instanceof HttpError && err.status === 403) || err instanceof TypeError;
}

export async function fetchText(url: string): Promise<string> {
  const host = new URL(url).host;
  if (!refusedHosts.has(host) || !canDownload()) {
    try {
      return await (await request(url)).text();
    } catch (err) {
      if (!isRefused(err) || !canDownload()) throw err;
      refusedHosts.add(host);
    }
  }
  return downloadText(url);
}

let seq = 0;

function downloadText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const name = `page-${Date.now()}-${++seq}.html`;
    const timer = setTimeout(() => reject(new Error('Timed out reading the page')), 90000);
    const done = (fn: () => void) => {
      clearTimeout(timer);
      fn();
    };
    try {
      const req = new tizen.DownloadRequest(url, 'wgt-private-tmp', name);
      tizen.download.start(req, {
        oncompleted: (_id: number, path: string) =>
          done(() => {
            try {
              const file = tizen.filesystem.openFile(path, 'r');
              const text: string = file.readString();
              file.close();
              try {
                tizen.filesystem.deleteFile(path);
              } catch {
                // Temporary folder; left for the system to clear.
              }
              resolve(text);
            } catch (err) {
              reject(err);
            }
          }),
        onfailed: (_id: number, err: { message?: string }) => done(() => reject(new Error(err?.message || 'Download failed'))),
        oncanceled: () => done(() => reject(new Error('Download cancelled'))),
      });
    } catch (err) {
      done(() => reject(err));
    }
  });
}
