import { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { FRAMES } from '../player/frames';
import { Collection, PhotoRef, PlaySettings, Source } from '../store/types';
import { Icon, IconName } from '../ui/icons';
import { Thumb } from '../ui/photo';

export function Header(props: { title: string; sub?: string; crumbs?: string; children?: ComponentChildren }) {
  return (
    <div class="header">
      <div>
        {props.crumbs && <div class="crumbs">{props.crumbs}</div>}
        <div class="header-title">{props.title}</div>
        {props.sub && <div class="header-sub">{props.sub}</div>}
      </div>
      {props.children && <div class="header-actions">{props.children}</div>}
    </div>
  );
}

export function plural(n: number, word: string): string {
  return `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;
}

export function coverOf(c: Collection): PhotoRef | undefined {
  return c.photos.find((p) => p.id === c.coverId) ?? c.photos[0];
}

export function useClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export const timeLabel = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/** A collection as a wide poster: cover photo, name over a soft gradient. */
export function Poster(props: {
  collection: Collection;
  navId: string;
  showing: boolean;
  autofocus?: boolean;
  onFocus: () => void;
  onClick: () => void;
}) {
  const c = props.collection;
  const cover = coverOf(c);
  return (
    <button
      class="poster"
      data-nav
      data-nav-id={props.navId}
      data-collection-id={c.id}
      data-nav-autofocus={props.autofocus || undefined}
      onFocus={props.onFocus}
      onClick={props.onClick}
    >
      <div class="poster-art">
        {cover ? <Thumb photo={cover} /> : <div class="poster-empty"><Icon name="image" /></div>}
        <div class="poster-shade" />
        {props.showing && <span class="pill-now">Now showing</span>}
        <div class="poster-label">
          <div class="poster-title">{c.name}</div>
          <div class="poster-sub">{plural(c.photos.length, 'photo')}</div>
        </div>
      </div>
    </button>
  );
}

export const SOURCE_ICON: Record<Source['kind'], IconName> = {
  usb: 'usb',
  samples: 'image',
  onedrive: 'cloud',
  network: 'network',
  web: 'link',
};

export function sourceDetail(s: Source): string {
  switch (s.kind) {
    case 'usb': return 'Plugged into the TV';
    case 'samples': return 'Scenery and art that come with the app';
    case 'onedrive': return s.account;
    case 'network': return s.url.replace(/^https?:\/\//, '');
    case 'web': return plural(s.urls.length, 'link');
  }
}

export function SourceCard(props: { source: Source; navId: string; autofocus?: boolean; onClick: () => void }) {
  const s = props.source;
  return (
    <button class="tile" data-nav data-nav-id={props.navId} data-nav-autofocus={props.autofocus || undefined} onClick={props.onClick}>
      <span class={`tile-icon source-${s.kind}`}>
        <Icon name={SOURCE_ICON[s.kind]} />
      </span>
      <span class="tile-text">
        <span class="tile-title">{s.name}</span>
        <span class="tile-sub">{sourceDetail(s)}</span>
      </span>
    </button>
  );
}

export function NewCard(props: { label: string; sub?: string; navId: string; onClick: () => void }) {
  return (
    <button class="tile tile-new" data-nav data-nav-id={props.navId} onClick={props.onClick}>
      <span class="tile-icon">
        <Icon name="plus" />
      </span>
      <span class="tile-text">
        <span class="tile-title">{props.label}</span>
        {props.sub && <span class="tile-sub">{props.sub}</span>}
      </span>
    </button>
  );
}

export const MODES = [
  { value: 'slideshow', label: 'Slideshow', icon: 'slideshow', desc: 'One photo at a time' },
  { value: 'ambient', label: 'Ambient', icon: 'ambient', desc: 'Framed art with a clock' },
  { value: 'kenburns', label: 'Ken Burns', icon: 'kenburns', desc: 'Slow pan and zoom' },
  { value: 'mosaic', label: 'Mosaic', icon: 'mosaic', desc: 'A changing wall of photos' },
  { value: 'duo', label: 'Duo', icon: 'duo', desc: 'Portraits side by side' },
  { value: 'memories', label: 'Memories', icon: 'memories', desc: 'This day in past years' },
] as const;

export function modeLabel(mode: string): string {
  return MODES.find((m) => m.value === mode)?.label ?? mode;
}

export function intervalLabel(sec: number): string {
  return sec < 60 ? `${sec} s` : `${sec / 60} min`;
}

/** One line describing how a collection plays, e.g. "Slideshow · Oak frame · 10 s". */
export function styleSummary(play: PlaySettings): string {
  const parts: string[] = [modeLabel(play.mode)];
  const usesFrame = play.mode === 'slideshow' || play.mode === 'memories' || play.mode === 'ambient';
  const frame = play.mode === 'ambient' && play.frame === 'none' ? 'gallery' : play.frame;
  if (usesFrame && frame !== 'none') parts.push(`${FRAMES[frame].label} frame`);
  if (play.order === 'shuffle') parts.push('Shuffled');
  parts.push(intervalLabel(play.intervalSec));
  return parts.join(' · ');
}
