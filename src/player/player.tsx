import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useKeys, useNav } from '../nav/router';
import { setScreenSaverAllowed } from '../platform/tizen';
import { modeLabel, MODES } from '../screens/common';
import { getCollection, setNowShowing } from '../store/store';
import { PhotoRef, PlayMode, PlaySettings } from '../store/types';
import { Icon } from '../ui/icons';
import { toast } from '../ui/overlay';
import { ALBUM_REFRESH_MS, refreshAlbum } from '../sources/albums';
import { Spinner } from '../ui/widgets';
import { MatLabel } from './frame';
import { effectiveFrame } from './frames';
import { Mosaic } from './mosaic';
import { needsDates, orderPhotos, pickMemories, resolveDates, yearsAgo } from './order';
import { Prepared, Preloader } from './prepare';
import { Command, SlideStage } from './slides';

interface Props {
  id: string;
  startPhotoId?: string;
  /** Show only startPhotoId, held on screen. */
  single?: boolean;
  settings?: PlaySettings;
}

interface Queue {
  id: number;
  photos: PhotoRef[];
  start: number;
  /** Shown briefly at the start (Memories). */
  title?: string;
}

const INFO_MS = 4000;
let queueId = 0;

function formatDate(t: number): string {
  return new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 10000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function Player(props: Props) {
  const nav = useNav();
  const collection = getCollection(props.id);
  const [settings, setSettings] = useState<PlaySettings | null>(() => {
    const base = props.settings ?? collection?.play ?? null;
    // A single pinned photo is held still, with the collection's frame if any.
    if (base && props.single) return { ...base, mode: 'slideshow' };
    return base;
  });
  const [queue, setQueue] = useState<Queue | null>(null);
  const [progress, setProgress] = useState<string>('');
  const [paused, setPaused] = useState(false);
  const [command, setCommand] = useState<Command | null>(null);
  const [shown, setShown] = useState<{ photos: Prepared[]; index: number } | null>(null);
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const [infoUntil, setInfoUntil] = useState(Date.now() + INFO_MS);
  const [banner, setBanner] = useState<string | null>(null);
  const now = useNow();
  const infoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Keep the TV's screensaver away for as long as we're playing, and pin
  // this as "now showing" so the app comes back to it.
  useEffect(() => {
    setScreenSaverAllowed(false);
    if (collection) setNowShowing(collection.id, props.single ? props.startPhotoId : undefined);
    return () => setScreenSaverAllowed(true);
  }, []);

  // Album collections: re-read the Google Photos album now (when stale) and
  // every half hour while playing; new photos rebuild the queue.
  const [albumVersion, setAlbumVersion] = useState(0);
  useEffect(() => {
    if (!collection?.albumSourceId || props.single) return;
    const check = (force: boolean) =>
      void refreshAlbum(collection.id, force).then((changed) => changed && setAlbumVersion((v) => v + 1));
    check(false);
    const t = setInterval(() => check(true), ALBUM_REFRESH_MS);
    return () => clearInterval(t);
  }, []);

  // Build the queue (reading dates first when the order needs them).
  useEffect(() => {
    // Read afresh: an album refresh may have replaced the photos.
    const current = getCollection(props.id);
    if (!current || !settings) return;
    let live = true;
    // A refresh mid-play keeps the current photo up rather than flashing the loading screen.
    if (!albumVersion) setQueue(null);
    (async () => {
      let photos = current.photos;
      if (props.single) {
        const one = photos.find((p) => p.id === props.startPhotoId);
        if (!one) return;
        setQueue({ id: ++queueId, photos: [one], start: 0 });
        return;
      }
      if (needsDates(settings)) {
        photos = await resolveDates(photos, (done, total) => live && setProgress(`Reading photo dates… ${done} of ${total}`));
      }
      if (!live) return;
      let title: string | undefined;
      let ordered: PhotoRef[];
      if (settings.mode === 'memories') {
        const memories = pickMemories(photos);
        ordered = memories.photos;
        title = memories.title;
      } else {
        ordered = orderPhotos(photos, settings);
      }
      // After an album refresh, carry on from the photo on screen.
      const startId = albumVersion ? shownRef.current?.photos[0]?.ref.id : props.startPhotoId;
      let start = 0;
      if (startId) {
        const at = ordered.findIndex((p) => p.id === startId);
        if (at >= 0) start = at;
      }
      setQueue({ id: ++queueId, photos: ordered, start, title });
      if (title) setBanner(title);
    })();
    return () => {
      live = false;
    };
  }, [settings?.mode, settings?.order, albumVersion]);

  // The queue is rebuilt on every mode change, so the mode here is current.
  // A mosaic wall holds 7 photos at once, so it keeps more of them ready.
  const preloader = useMemo(
    () => (queue ? new Preloader(queue.photos, settings?.mode === 'mosaic' ? 12 : 4) : null),
    [queue],
  );

  // Sleep timer: stop and let the TV's own power saving take over.
  useEffect(() => {
    if (!settings?.sleepMin) return;
    const t = setTimeout(() => {
      toast('Sleep timer ended');
      nav.pop();
    }, settings.sleepMin * 60000);
    return () => clearTimeout(t);
  }, [settings?.sleepMin]);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 5000);
    return () => clearTimeout(t);
  }, [banner]);

  const showInfo = () => {
    setInfoUntil(Date.now() + INFO_MS);
    clearTimeout(infoTimer.current);
    infoTimer.current = setTimeout(() => setInfoUntil(0), INFO_MS + 50);
  };
  useEffect(() => {
    infoTimer.current = setTimeout(() => setInfoUntil(0), INFO_MS + 50);
    return () => clearTimeout(infoTimer.current);
  }, []);

  const step = (kind: Command['kind']) => {
    setCommand((c) => ({ kind, seq: (c?.seq ?? 0) + 1 }));
    showInfo();
  };

  const cycleMode = () => {
    if (!settings || props.single) return;
    const i = MODES.findIndex((m) => m.value === settings.mode);
    const mode = MODES[(i + 1) % MODES.length].value as PlayMode;
    setSettings({ ...settings, mode, order: mode === 'memories' ? 'date' : settings.order });
    setShown(null);
    setBanner(modeLabel(mode));
  };

  useKeys((action) => {
    switch (action) {
      case 'left': case 'prev': if (!props.single) step('prev'); else showInfo(); return true;
      case 'right': case 'next': if (!props.single) step('next'); else showInfo(); return true;
      case 'enter': case 'playpause':
        setPaused((p) => !p);
        showInfo();
        return true;
      case 'play': setPaused(false); showInfo(); return true;
      case 'pause': setPaused(true); showInfo(); return true;
      case 'up': case 'down': case 'info': showInfo(); return true;
      case 'blue': cycleMode(); showInfo(); return true;
      case 'stop': nav.pop(); return true;
      default: return false; // Back is handled by the app: leave the player
    }
  });

  if (!collection || !settings) return null;

  const onFail = () => {
    toast('None of these photos could be loaded. Check that their source is available.', true);
    nav.pop();
  };

  const infoVisible = infoUntil > Date.now() || paused;
  const lead = shown?.photos[shown.photos.length - 1];
  const takenAt = lead?.takenAt ?? lead?.ref.takenAt;
  const showClock = settings.showClock;
  const frame = effectiveFrame(settings);
  const time = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const date = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const stageKey = `${settings.mode}-${queue?.id}`;

  // The caption is the photo's title and credit when it has one (the
  // included scenery and paintings: a museum label), else when it was taken.
  let caption: string | null = null;
  let captionSub = collection.name;
  if (settings.showCaption && settings.mode !== 'mosaic' && lead) {
    if (lead.ref.caption) {
      caption = lead.ref.caption;
      captionSub = lead.ref.credit ?? '';
    } else if (takenAt) {
      caption = settings.mode === 'memories' ? `${yearsAgo(takenAt)} · ${formatDate(takenAt)}` : formatDate(takenAt);
    }
  }

  return (
    <div class={`player player-${settings.mode} ${frame !== 'none' ? 'player-framed' : ''}`}>
      {!queue && (
        <div class="player-loading">
          <Spinner />
          <div>{progress || 'Getting photos ready…'}</div>
        </div>
      )}
      {queue && preloader && settings.mode === 'mosaic' && (
        <Mosaic key={stageKey} preloader={preloader} startIndex={queue.start} settings={settings} paused={paused} command={command} onShow={(photos, index) => setShown({ photos, index })} onFail={onFail} />
      )}
      {queue && preloader && settings.mode !== 'mosaic' && (
        <SlideStage key={stageKey} preloader={preloader} startIndex={queue.start} settings={settings} paused={paused} command={command} onShow={(photos, index) => setShown({ photos, index })} onFail={onFail} />
      )}

      {frame !== 'none' ? (
        // Framed: a small label on the mat carries the caption and the time.
        !infoVisible && <MatLabel style={frame} caption={caption} sub={captionSub} clock={showClock ? `${time} · ${date}` : null} />
      ) : (
        <>
          {showClock && (
            <div class="clock">
              <div class="clock-time">{time}</div>
              <div class="clock-date">{date}</div>
            </div>
          )}
          {caption && !infoVisible && (
            <div class="caption">
              {caption}
              {captionSub && <span class="caption-sub">{captionSub}</span>}
            </div>
          )}
        </>
      )}

      {banner && <div class="banner">{banner}</div>}

      {paused && (
        <div class="pause-badge">
          <Icon name="pause" />
        </div>
      )}

      <div class={`info-bar ${infoVisible ? 'visible' : ''}`}>
        <div class="info-main">
          <div class="info-title">{collection.name}</div>
          <div class="info-sub">
            {props.single ? 'Showing one photo' : modeLabel(settings.mode)}
            {queue && shown && !props.single && settings.mode !== 'mosaic' && ` · ${shown.index + 1}${shown.photos.length > 1 ? `–${shown.index + shown.photos.length}` : ''} of ${queue.photos.length}`}
            {caption && ` · ${caption}`}
            {paused && ' · Paused'}
          </div>
        </div>
        <div class="info-keys">
          {!props.single && <span><b>◀ ▶</b> Previous / next</span>}
          {!props.single && <span><b>OK</b> {paused ? 'Resume' : 'Pause'}</span>}
          {!props.single && <span><i class="key-dot key-blue" /> Change mode</span>}
          <span><b>↩</b> Menu</span>
        </div>
      </div>
    </div>
  );
}
