import { useEffect, useRef, useState } from 'preact/hooks';
import { PlaySettings } from '../store/types';
import { Prepared, Preloader } from './prepare';
import { Command, PhotoImg } from './slides';

// A wall of photos on a 4×3 grid. One tile changes at a time; portrait
// photos go to the tall tiles and landscape photos to the others.

interface Tile {
  area: string;
  col: number;
  row: number;
  cols: number;
  rows: number;
  tall: boolean;
}

const TILES: Tile[] = [
  { area: 'a', col: 1, row: 1, cols: 2, rows: 2, tall: false },
  { area: 'b', col: 3, row: 1, cols: 1, rows: 1, tall: false },
  { area: 'c', col: 4, row: 1, cols: 1, rows: 2, tall: true },
  { area: 'd', col: 3, row: 2, cols: 1, rows: 2, tall: true },
  { area: 'e', col: 1, row: 3, cols: 1, rows: 1, tall: false },
  { area: 'f', col: 2, row: 3, cols: 1, rows: 1, tall: false },
  { area: 'g', col: 4, row: 3, cols: 1, rows: 1, tall: false },
];

const GAP = 8;
const CELL_W = (1920 - GAP * 5) / 4;
const CELL_H = (1080 - GAP * 4) / 3;

function tileBox(t: Tile) {
  return { width: CELL_W * t.cols + GAP * (t.cols - 1), height: CELL_H * t.rows + GAP * (t.rows - 1) };
}

interface TileState {
  photo: Prepared;
  key: number;
  /** The photo being replaced, kept underneath while the new one fades in. */
  prev?: Prepared;
}

interface Props {
  preloader: Preloader;
  startIndex: number;
  settings: PlaySettings;
  paused: boolean;
  command: Command | null;
  onShow: (photos: Prepared[], index: number) => void;
  onFail: () => void;
}

let tileKey = 0;

export function Mosaic(props: Props) {
  const { preloader } = props;
  const [tiles, setTiles] = useState<(TileState | null)[]>(() => TILES.map(() => null));
  const cursor = useRef(props.startIndex);
  const lastTile = useRef(-1);
  // Loads can finish after unmount (mode switched); ignore them then.
  const alive = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(props);
  latest.current = props;

  const nextPhoto = async (): Promise<Prepared | null> => {
    const found = await preloader.firstLoadable(cursor.current, 1);
    if (!found) return null;
    cursor.current = found.index + 1;
    void preloader.get(cursor.current).catch(() => undefined);
    return found.photo;
  };

  // Fill the wall, matching shapes where possible, then start swapping.
  useEffect(() => {
    let live = true;
    (async () => {
      const filled: (TileState | null)[] = TILES.map(() => null);
      const count = Math.min(TILES.length, preloader.length);
      // Start every tile's download at once; they're placed in queue order.
      for (let k = 0; k < count; k++) void preloader.get(cursor.current + k).catch(() => undefined);
      for (let k = 0; k < count && live; k++) {
        const photo = await nextPhoto();
        if (!photo) break;
        const free = TILES.map((t, i) => i).filter((i) => !filled[i]);
        const match = free.find((i) => TILES[i].tall === photo.portrait) ?? free[0];
        filled[match] = { photo, key: ++tileKey };
        setTiles(filled.slice());
      }
      if (!live) return;
      if (!filled.some(Boolean)) latest.current.onFail();
      else {
        latest.current.onShow(filled.filter(Boolean).map((t) => t!.photo), props.startIndex);
        schedule();
      }
    })();
    return () => {
      live = false;
      alive.current = false;
      clearTimeout(timer.current);
    };
  }, []);

  const swap = async () => {
    const photo = await nextPhoto();
    if (!photo || !alive.current) return;
    setTiles((current) => {
      // With fewer photos than tiles, empty tiles fill first.
      const empty = current.findIndex((t) => !t);
      let target = empty;
      if (target < 0) {
        const candidates = TILES.map((t, i) => i).filter((i) => i !== lastTile.current);
        const shaped = candidates.filter((i) => TILES[i].tall === photo.portrait);
        const pool = shaped.length ? shaped : candidates;
        target = pool[Math.floor(Math.random() * pool.length)];
      }
      lastTile.current = target;
      const next = current.slice();
      next[target] = { photo, key: ++tileKey, prev: current[target]?.photo };
      return next;
    });
    latest.current.onShow([photo], cursor.current - 1);
    schedule();
  };

  const schedule = () => {
    clearTimeout(timer.current);
    if (!alive.current || latest.current.paused || preloader.length <= 1) return;
    timer.current = setTimeout(() => void swap(), latest.current.settings.intervalSec * 1000);
  };

  useEffect(() => {
    if (props.paused) clearTimeout(timer.current);
    else schedule();
  }, [props.paused]);

  // Only commands issued while the wall is showing (see SlideStage).
  const seenCommand = useRef(props.command?.seq);
  useEffect(() => {
    if (!props.command || props.command.seq === seenCommand.current) return;
    seenCommand.current = props.command.seq;
    void swap();
  }, [props.command?.seq]);

  return (
    <div class="mosaic">
      {TILES.map((t, i) => {
        const tile = tiles[i];
        const box = tileBox(t);
        return (
          <div
            key={t.area}
            class="mosaic-tile"
            style={{
              left: `${GAP + (t.col - 1) * (CELL_W + GAP)}px`,
              top: `${GAP + (t.row - 1) * (CELL_H + GAP)}px`,
              width: `${box.width}px`,
              height: `${box.height}px`,
            }}
          >
            {tile?.prev && (
              <div key={`${tile.key}-prev`} class="mosaic-photo under">
                <PhotoImg photo={tile.prev} box={box} fit="fill" />
              </div>
            )}
            {tile && (
              <div key={tile.key} class="mosaic-photo">
                <PhotoImg photo={tile.photo} box={box} fit="fill" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** The wall filled once, without timing: used by the Style preview. */
export function MosaicStill({ photos }: { photos: Prepared[] }) {
  // Same shape matching as playback: portraits to tall tiles where possible.
  const placed: (Prepared | undefined)[] = TILES.map(() => undefined);
  for (const photo of photos.slice(0, TILES.length)) {
    const free = TILES.map((t, i) => i).filter((i) => !placed[i]);
    placed[free.find((i) => TILES[i].tall === photo.portrait) ?? free[0]] = photo;
  }
  return (
    <div class="mosaic">
      {TILES.map((t, i) => {
        const box = tileBox(t);
        const photo = placed[i];
        return (
          <div
            key={t.area}
            class="mosaic-tile"
            style={{
              left: `${GAP + (t.col - 1) * (CELL_W + GAP)}px`,
              top: `${GAP + (t.row - 1) * (CELL_H + GAP)}px`,
              width: `${box.width}px`,
              height: `${box.height}px`,
            }}
          >
            {photo && <PhotoImg photo={photo} box={box} fit="fill" />}
          </div>
        );
      })}
    </div>
  );
}
