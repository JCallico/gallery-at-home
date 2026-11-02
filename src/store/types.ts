export type SourceKind = 'usb' | 'network' | 'web' | 'samples';

/** A photo as stored in a collection: enough to find it again, never the bytes. */
export interface PhotoRef {
  /** `${sourceId}|${key}`, unique across sources. */
  id: string;
  sourceId: string;
  /** Source-specific locator: file path or URL. */
  key: string;
  name: string;
  /** Capture time (ms since epoch) when the source knows it. */
  takenAt?: number;
  width?: number;
  height?: number;
  /** A title shown under the photo instead of its date (the included photos). */
  caption?: string;
  /** Who made it, and its licence: the line under the caption. */
  credit?: string;
}

export type PlayMode = 'slideshow' | 'kenburns' | 'mosaic' | 'duo' | 'memories';
export type PlayOrder = 'added' | 'shuffle' | 'date' | 'name';
export type Transition = 'fade' | 'slide' | 'zoom' | 'none';
export type Fit = 'fit' | 'fill';
/** Picture-frame look around the photo; 'none' shows it edge to edge. */
export type FrameStyle = 'none' | 'gallery' | 'black' | 'oak' | 'walnut' | 'gold' | 'floating';

export interface PlaySettings {
  mode: PlayMode;
  order: PlayOrder;
  intervalSec: number;
  transition: Transition;
  fit: Fit;
  /** Inside a frame: fill the opening (cropping a little) or show the whole photo. */
  frameFit: Fit;
  frame: FrameStyle;
  showClock: boolean;
  showCaption: boolean;
  /** Minutes until playback stops by itself; 0 = never. */
  sleepMin: number;
}

export interface Collection {
  id: string;
  name: string;
  photos: PhotoRef[];
  coverId?: string;
  createdAt: number;
  updatedAt: number;
  play: PlaySettings;
}

interface SourceBase {
  id: string;
  kind: SourceKind;
  name: string;
}

/** USB drives are detected, not configured; the id is the storage label. */
export interface UsbSource extends SourceBase {
  kind: 'usb';
}

/** The photos that come with the app. Always present, never configured. */
export interface SamplesSource extends SourceBase {
  kind: 'samples';
}

export interface NetworkSource extends SourceBase {
  kind: 'network';
  /** Base URL of a WebDAV share or a web server directory listing. */
  url: string;
  username?: string;
  password?: string;
}

export interface WebSource extends SourceBase {
  kind: 'web';
  /** Individual image URLs and/or pages/lists that contain image URLs. */
  urls: string[];
}

export type Source = UsbSource | SamplesSource | NetworkSource | WebSource;
export type ConfiguredSource = NetworkSource | WebSource;

export interface AppSettings {
  defaultPlay: PlaySettings;
  /** Minutes of no remote input in the menus before "now showing" returns; 0 = never. */
  idleMin: number;
}

/**
 * What the TV shows when the app opens or sits idle: the last thing played,
 * a whole collection or one photo from it, until something else is played.
 */
export interface NowShowing {
  collectionId: string;
  /** Set when a single photo is pinned rather than the whole collection. */
  photoId?: string;
  since: number;
}

export const DEFAULT_PLAY: PlaySettings = {
  mode: 'slideshow',
  order: 'added',
  intervalSec: 10,
  transition: 'fade',
  fit: 'fit',
  frameFit: 'fill',
  frame: 'none',
  showClock: false,
  showCaption: true,
  sleepMin: 0,
};
