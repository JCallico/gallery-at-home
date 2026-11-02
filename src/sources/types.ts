import { PhotoRef, Source } from '../store/types';

export interface FolderEntry {
  type: 'folder';
  key: string;
  name: string;
}

export interface PhotoEntry {
  type: 'photo';
  ref: PhotoRef;
}

export type Entry = FolderEntry | PhotoEntry;

export interface Listing {
  /** Folder key of this listing; null for the source's root. */
  key: string | null;
  title: string;
  entries: Entry[];
}

export interface SourceAdapter {
  readonly source: Source;
  list(folderKey: string | null): Promise<Listing>;
  /** Small image for grids. */
  thumbUrl(ref: PhotoRef): Promise<string>;
  /** Screen-sized image for playback. */
  imageUrl(ref: PhotoRef): Promise<string>;
  /**
   * Bytes from the start of the original file, for EXIF. Omitted when the
   * source already serves upright images and knows the capture date.
   */
  readHead?(ref: PhotoRef): Promise<ArrayBuffer>;
}

export function photoRef(sourceId: string, key: string, name: string, extra: Partial<PhotoRef> = {}): PhotoRef {
  return { id: `${sourceId}|${key}`, sourceId, key, name, ...extra };
}

export function sortEntries(entries: Entry[]): Entry[] {
  const name = (e: Entry) => (e.type === 'folder' ? e.name : e.ref.name);
  return entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return name(a).localeCompare(name(b), undefined, { numeric: true, sensitivity: 'base' });
  });
}
