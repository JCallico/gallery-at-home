// Access to removable storage (USB drives plugged into the TV).
//
// On Tizen this uses tizen.filesystem; in the desktop browser the dev
// server exposes dev/sample-usb as a fake drive with the same shape.

import { isTizen, requestPrivilege } from './tizen';

export interface Drive {
  /** Tizen virtual root, e.g. "removable_sda1". */
  label: string;
  name: string;
}

export interface FsEntry {
  name: string;
  /** Virtual path, e.g. "removable_sda1/DCIM/100CANON". */
  path: string;
  isDir: boolean;
  modified?: number;
}

export interface Filesystem {
  drives(): Promise<Drive[]>;
  list(path: string): Promise<FsEntry[]>;
  fileUrl(path: string): Promise<string>;
  onDrivesChanged(fn: () => void): void;
}

let granted: Promise<boolean> | null = null;
function ensureAccess(): Promise<boolean> {
  if (!granted) {
    granted = requestPrivilege('http://tizen.org/privilege/externalstorage').then((ok) => {
      if (!ok) granted = null; // ask again next time
      return ok;
    });
  }
  return granted;
}

function driveName(index: number): string {
  return index === 0 ? 'USB drive' : `USB drive ${index + 1}`;
}

const tizenFs: Filesystem = {
  async drives() {
    await ensureAccess();
    const fs = window.tizen.filesystem;
    return new Promise((resolve, reject) => {
      fs.listStorages(
        (storages: any[]) =>
          resolve(
            storages
              .filter((s) => s.type === 'EXTERNAL' && s.state === 'MOUNTED')
              .map((s, i) => ({ label: s.label, name: driveName(i) })),
          ),
        reject,
      );
    });
  },

  list(path) {
    const fs = window.tizen.filesystem;
    return new Promise((resolve, reject) => {
      fs.resolve(
        path,
        (dir: any) =>
          dir.listFiles(
            (files: any[]) =>
              resolve(
                files
                  .filter((f) => !f.name.startsWith('.'))
                  .map((f) => ({
                    name: f.name,
                    path: `${path}/${f.name}`,
                    isDir: f.isDirectory,
                    modified: f.modified ? f.modified.getTime() : undefined,
                  })),
              ),
            reject,
          ),
        reject,
        'r',
      );
    });
  },

  fileUrl(path) {
    const fs = window.tizen.filesystem;
    if (typeof fs.toURI === 'function') return Promise.resolve(fs.toURI(path));
    return new Promise((resolve, reject) => fs.resolve(path, (f: any) => resolve(f.toURI()), reject, 'r'));
  },

  onDrivesChanged(fn) {
    try {
      window.tizen.filesystem.addStorageStateChangeListener(fn);
    } catch (err) {
      console.warn('Storage change listener unavailable', err);
    }
  },
};

const devFs: Filesystem = {
  async drives() {
    const res = await fetch('/__dev/fs/drives');
    return res.json();
  },
  async list(path) {
    const res = await fetch(`/__dev/fs/list?path=${encodeURIComponent(path)}`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  fileUrl(path) {
    return Promise.resolve(`/__dev/fs/file?path=${encodeURIComponent(path)}`);
  },
  onDrivesChanged() {
    // The fake drive never changes.
  },
};

export const filesystem: Filesystem = isTizen ? tizenFs : devFs;
