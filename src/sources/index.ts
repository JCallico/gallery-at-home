import { useEffect, useState } from 'preact/hooks';
import { filesystem } from '../platform/fs';
import { getState, useStore } from '../store/store';
import { PhotoRef, Source, UsbSource } from '../store/types';
import { samplesAdapter, samplesSource, SAMPLES_ID } from '../samples';
import { readExif } from './exif';
import { smallThumb } from './thumbs';
import { networkAdapter } from './network';
import { oneDriveAdapter } from './onedrive';
import { SourceAdapter } from './types';
import { usbAdapter } from './usb';
import { webAdapter } from './web';

// --- USB drives (detected, not configured) ----------------------------------

let drives: UsbSource[] = [];
const driveListeners = new Set<() => void>();

export async function refreshDrives(): Promise<void> {
  try {
    const found = await filesystem.drives();
    drives = found.map((d) => ({ id: d.label, kind: 'usb', name: d.name }));
  } catch (err) {
    console.warn('Could not list USB drives', err);
    drives = [];
  }
  driveListeners.forEach((fn) => fn());
}

filesystem.onDrivesChanged(() => void refreshDrives());

/** USB drives first, then configured sources, then the included photos. */
export function useSources(): Source[] {
  const configured = useStore((s) => s.sources);
  const [usb, setUsb] = useState(drives);
  useEffect(() => {
    const update = () => setUsb(drives);
    driveListeners.add(update);
    void refreshDrives();
    return () => {
      driveListeners.delete(update);
    };
  }, []);
  return [...usb, ...configured, samplesSource];
}

// --- Adapters ---------------------------------------------------------------

const adapters = new Map<string, { source: Source; adapter: SourceAdapter }>();

function findSource(sourceId: string): Source | undefined {
  if (sourceId === SAMPLES_ID) return samplesSource;
  return getState().sources.find((s) => s.id === sourceId) ?? drives.find((d) => d.id === sourceId)
    // A drive label also identifies photos added from it while unplugged.
    ?? (sourceId.startsWith('removable') ? { id: sourceId, kind: 'usb', name: 'USB drive' } : undefined);
}

export function adapterFor(sourceId: string): SourceAdapter {
  const source = findSource(sourceId);
  if (!source) throw new Error('This photo’s source has been removed.');
  const cached = adapters.get(sourceId);
  if (cached && cached.source === source) return cached.adapter;
  let adapter: SourceAdapter;
  switch (source.kind) {
    case 'usb': adapter = usbAdapter(source); break;
    case 'samples': adapter = samplesAdapter(); break;
    case 'network': adapter = networkAdapter(source); break;
    case 'web': adapter = webAdapter(source); break;
    case 'onedrive': adapter = oneDriveAdapter(source, getState().settings.oneDriveClientId); break;
  }
  adapters.set(sourceId, { source, adapter });
  return adapter;
}

export function sourceLabel(sourceId: string): string {
  return findSource(sourceId)?.name ?? 'Missing source';
}

// --- Loading photos ---------------------------------------------------------

export interface LoadedPhoto {
  url: string;
  orientation: number;
  takenAt?: number;
}

function withExif(ref: PhotoRef, adapter: SourceAdapter, url: Promise<string>): Promise<LoadedPhoto> {
  const exif = adapter.readHead
    ? readExif(ref.id, () => adapter.readHead!(ref))
    : Promise.resolve({ orientation: 1, takenAt: undefined });
  return Promise.all([url, exif]).then(([u, e]) => ({ url: u, orientation: e.orientation, takenAt: e.takenAt ?? ref.takenAt }));
}

export function loadThumb(ref: PhotoRef): Promise<LoadedPhoto> {
  const adapter = adapterFor(ref.sourceId);
  const loaded = withExif(ref, adapter, adapter.thumbUrl(ref));
  // Sources with real thumbnails (OneDrive) serve them directly; for raw
  // originals (they're the ones with EXIF to read) make a small copy.
  if (!adapter.readHead) return loaded;
  return loaded.then((p) => smallThumb(ref.id, p.url, p.orientation).then((t) => ({ ...p, ...t })));
}

export function loadImage(ref: PhotoRef): Promise<LoadedPhoto> {
  const adapter = adapterFor(ref.sourceId);
  return withExif(ref, adapter, adapter.imageUrl(ref));
}

/** Capture date from EXIF where the source can provide it, else the stored hint. */
export async function captureDate(ref: PhotoRef): Promise<number | undefined> {
  try {
    const adapter = adapterFor(ref.sourceId);
    if (!adapter.readHead) return ref.takenAt;
    const exif = await readExif(ref.id, () => adapter.readHead!(ref));
    return exif.takenAt ?? ref.takenAt;
  } catch {
    return ref.takenAt;
  }
}
