import { filesystem } from '../platform/fs';
import { UsbSource } from '../store/types';
import { isImageName } from './net';
import { Entry, Listing, photoRef, SourceAdapter, sortEntries } from './types';

/** Reads the first bytes of a local file; XHR works for file:// URIs on Tizen. */
function readLocalHead(url: string): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    xhr.responseType = 'arraybuffer';
    xhr.setRequestHeader('Range', 'bytes=0-131071');
    xhr.onload = () => (xhr.response ? resolve(xhr.response) : reject(new Error('empty')));
    xhr.onerror = () => reject(new Error(`Could not read ${url}`));
    xhr.send();
  });
}

export function usbAdapter(source: UsbSource): SourceAdapter {
  const root = source.id;
  return {
    source,
    async list(folderKey): Promise<Listing> {
      const path = folderKey ?? root;
      const files = await filesystem.list(path);
      const entries: Entry[] = [];
      for (const f of files) {
        if (f.name.startsWith('.')) continue; // .Trashes, .Spotlight-V100 and the like
        if (f.isDir) entries.push({ type: 'folder', key: f.path, name: f.name });
        else if (isImageName(f.name)) {
          entries.push({ type: 'photo', ref: photoRef(source.id, f.path, f.name, { takenAt: f.modified }) });
        }
      }
      return {
        key: folderKey,
        title: folderKey ? path.slice(path.lastIndexOf('/') + 1) : source.name,
        entries: sortEntries(entries),
      };
    },
    // USB photos are full-size originals; the grid lazy-loads them.
    thumbUrl: (ref) => filesystem.fileUrl(ref.key),
    imageUrl: (ref) => filesystem.fileUrl(ref.key),
    readHead: async (ref) => readLocalHead(await filesystem.fileUrl(ref.key)),
  };
}
