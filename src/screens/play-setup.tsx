import { useEffect, useState } from 'preact/hooks';
import { useNav } from '../nav/router';
import { MatLabel } from '../player/frame';
import { effectiveFrame, FRAME_OPTIONS } from '../player/frames';
import { MosaicStill } from '../player/mosaic';
import { prepare, Prepared } from '../player/prepare';
import { StillSlide } from '../player/slides';
import { setPlaySettings, useStore } from '../store/store';
import { PlayMode, PlaySettings } from '../store/types';
import { Icon } from '../ui/icons';
import { ChoiceRow, Spinner, ToggleRow } from '../ui/widgets';
import { coverOf, MODES, timeLabel, useClock } from './common';

// Style: a live preview of the collection's own photos on the left, a short
// list of choices on the right. Every change shows up in the preview at once.

const INTERVALS = [5, 8, 10, 15, 20, 30, 60, 120, 300, 600].map((s) => ({
  value: s,
  label: s < 60 ? `${s} seconds` : `${s / 60} min`,
}));
const ORDERS = [
  { value: 'added', label: 'As added' },
  { value: 'shuffle', label: 'Shuffle' },
  { value: 'date', label: 'Date taken' },
  { value: 'name', label: 'File name' },
] as const;
const TRANSITIONS = [
  { value: 'fade', label: 'Crossfade' },
  { value: 'slide', label: 'Slide' },
  { value: 'zoom', label: 'Zoom' },
  { value: 'none', label: 'Cut' },
] as const;
const FITS = [
  { value: 'fit', label: 'Whole photo' },
  { value: 'fill', label: 'Fill the screen' },
] as const;
const FRAMED_FITS = [
  { value: 'fill', label: 'Fill the frame' },
  { value: 'fit', label: 'Whole photo' },
] as const;
const SLEEP = [0, 15, 30, 60, 120, 240].map((m) => ({ value: m, label: m === 0 ? 'Never' : m < 60 ? `After ${m} min` : `After ${m / 60} h` }));

/** Sensible defaults when switching mode. */
function adaptToMode(play: PlaySettings, mode: PlayMode): PlaySettings {
  const next = { ...play, mode };
  if (mode === 'ambient') {
    if (play.intervalSec < 30) next.intervalSec = 60;
    next.showClock = true;
  }
  if (mode === 'kenburns' && play.intervalSec < 8) next.intervalSec = 10;
  if (mode === 'memories') next.order = 'date';
  return next;
}

/** Loads a handful of the collection's photos (cover first) for the preview. */
function usePreviewPhotos(id: string): Prepared[] | null {
  const collection = useStore((s) => s.collections.find((c) => c.id === id));
  const [photos, setPhotos] = useState<Prepared[] | null>(null);
  useEffect(() => {
    if (!collection) return;
    const cover = coverOf(collection);
    const refs = cover ? [cover, ...collection.photos.filter((p) => p !== cover)].slice(0, 10) : [];
    let live = true;
    Promise.all(refs.map((r) => prepare(r).catch(() => null))).then((list) => {
      if (live) setPhotos(list.filter((p): p is Prepared => !!p));
    });
    return () => {
      live = false;
    };
  }, [id, collection?.photos.length]);
  return photos;
}

function Preview({ photos, play }: { photos: Prepared[] | null; play: PlaySettings }) {
  const now = useClock();
  if (!photos) {
    return <div class="preview-empty"><Spinner /></div>;
  }
  if (!photos.length) {
    return <div class="preview-empty"><Icon name="image" /><span>Add photos to see a preview</span></div>;
  }
  // Duo shows its pairing only when there are two portraits to pair.
  const portraits = photos.filter((p) => p.portrait);
  const forDuo = portraits.length >= 2 ? portraits : photos;
  const frame = effectiveFrame(play);
  const framed = frame !== 'none';
  const lead = play.mode === 'duo' ? forDuo[0] : photos[0];
  const taken = lead.takenAt ?? lead.ref.takenAt;
  // Same caption as the player: the photo's title, else when it was taken.
  const caption = lead.ref.caption ?? (taken ? new Date(taken).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : null);
  const showClock = play.showClock || play.mode === 'ambient';
  const dateLabel = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  return (
    <div class="preview-stage">
      <div class={`player player-${play.mode} ${framed ? 'player-framed' : ''}`}>
        {play.mode === 'mosaic' ? <MosaicStill photos={photos} /> : <StillSlide photos={play.mode === 'duo' ? forDuo : photos} settings={play} />}
        {frame !== 'none' ? (
          <MatLabel
            style={frame}
            caption={play.showCaption ? caption : null}
            sub={lead.ref.caption ? lead.ref.credit : undefined}
            clock={showClock ? `${timeLabel(now)} · ${dateLabel}` : null}
          />
        ) : (
          <>
            {showClock && (
              <div class={`clock ${play.mode === 'ambient' ? 'clock-ambient' : ''}`}>
                <div class="clock-time">{timeLabel(now)}</div>
                <div class="clock-date">{dateLabel}</div>
              </div>
            )}
            {play.showCaption && play.mode !== 'mosaic' && caption && <div class="caption">{caption}</div>}
          </>
        )}
      </div>
    </div>
  );
}

export function PlaySetup({ id }: { id: string }) {
  const nav = useNav();
  const collection = useStore((s) => s.collections.find((c) => c.id === id));
  const photos = usePreviewPhotos(id);
  if (!collection) return null;
  const play = collection.play;
  const set = (change: Partial<PlaySettings>) => setPlaySettings(id, { ...play, ...change });

  // Only the choices that matter for the chosen style are offered.
  const usesFrame = play.mode === 'slideshow' || play.mode === 'memories' || play.mode === 'ambient';
  const framed = effectiveFrame(play) !== 'none';
  const usesTransition = !framed && (play.mode === 'slideshow' || play.mode === 'duo' || play.mode === 'memories');
  const usesFit = play.mode === 'slideshow' || play.mode === 'memories' || framed;
  const usesOrder = play.mode !== 'memories';
  const mode = MODES.find((m) => m.value === play.mode)!;

  return (
    <div class="screen style-screen">
      <div class="style-preview">
        <Preview photos={photos} play={play} />
        <div class="preview-label">
          <span class="preview-live">Preview</span>
          {collection.name}
        </div>
      </div>
      <div class="style-panel">
        <div class="crumbs">{collection.name}</div>
        <h1 class="panel-title">Style</h1>
        <div class="style-rows scroll">
          <ChoiceRow
            label="Look"
            hint={mode.desc}
            value={play.mode}
            options={MODES.map((m) => ({ value: m.value as PlayMode, label: m.label }))}
            onChange={(v) => setPlaySettings(id, adaptToMode(play, v))}
          />
          {usesFrame && (
            <ChoiceRow
              label="Frame"
              value={effectiveFrame(play)}
              options={play.mode === 'ambient' ? FRAME_OPTIONS.filter((f) => f.value !== 'none') : FRAME_OPTIONS}
              onChange={(v) => set({ frame: v })}
            />
          )}
          {usesFit && (framed ? (
            <ChoiceRow label="Fit" value={play.frameFit} options={[...FRAMED_FITS]} onChange={(v) => set({ frameFit: v })} />
          ) : (
            <ChoiceRow label="Fit" value={play.fit} options={[...FITS]} onChange={(v) => set({ fit: v })} />
          ))}
          <ChoiceRow
            label={play.mode === 'mosaic' ? 'Change a tile every' : 'Change photo every'}
            value={play.intervalSec}
            options={INTERVALS}
            onChange={(v) => set({ intervalSec: v })}
          />
          {usesOrder && <ChoiceRow label="Order" value={play.order} options={[...ORDERS]} onChange={(v) => set({ order: v })} />}
          {usesTransition && <ChoiceRow label="Transition" value={play.transition} options={[...TRANSITIONS]} onChange={(v) => set({ transition: v })} />}
          {play.mode !== 'ambient' && <ToggleRow label="Clock" value={play.showClock} onChange={(v) => set({ showClock: v })} />}
          <ToggleRow label="Caption" hint="Title and credit, or the date taken" value={play.showCaption} onChange={(v) => set({ showCaption: v })} />
          <ChoiceRow label="Turn off" hint="Then the TV’s screensaver takes over" value={play.sleepMin} options={SLEEP} onChange={(v) => set({ sleepMin: v })} />
        </div>
        <button class="play-cta" data-nav data-nav-id="start" onClick={() => nav.replace({ name: 'player', id })}>
          <Icon name="play" />
          <span>Play on the TV</span>
        </button>
      </div>
    </div>
  );
}
