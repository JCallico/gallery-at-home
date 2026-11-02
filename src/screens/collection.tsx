import { useEffect } from 'preact/hooks';
import { useKeys, useNav } from '../nav/router';
import { captureDate, sourceLabel } from '../sources';
import { refreshAlbum } from '../sources/albums';
import {
  clearNowShowing, deleteCollection, getNowShowing, removePhoto, renameCollection, setCover, useStore,
} from '../store/store';
import { PhotoRef } from '../store/types';
import { AmbientBackdrop } from '../ui/ambient';
import { Icon, IconName } from '../ui/icons';
import { choose, confirm, prompt, toast } from '../ui/overlay';
import { Thumb } from '../ui/photo';
import { coverOf, plural, styleSummary } from './common';

// A collection: who it is on the left (name, how it plays, a few actions),
// its photos on the right, all over a soft backdrop of its cover.

function SideAction(props: {
  icon: IconName;
  label: string;
  sub?: string;
  primary?: boolean;
  navId: string;
  autofocus?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      class={`side-action ${props.primary ? 'primary' : ''}`}
      data-nav
      data-nav-id={props.navId}
      data-nav-autofocus={props.autofocus || undefined}
      onClick={props.onClick}
    >
      <Icon name={props.icon} />
      <span class="side-action-text">
        <span class="side-action-label">{props.label}</span>
        {props.sub && <span class="side-action-sub">{props.sub}</span>}
      </span>
    </button>
  );
}

const longDate = (t: number) => new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

export function CollectionScreen({ id }: { id: string }) {
  const nav = useNav();
  const collection = useStore((s) => s.collections.find((c) => c.id === id));
  useStore((s) => s.nowShowing);
  const showing = getNowShowing();
  const pinnedHere = showing?.collectionId === id;

  // Album collections pick up new photos when opened (if not read recently).
  useEffect(() => {
    void refreshAlbum(id);
  }, [id]);

  const play = (startPhotoId?: string) => {
    if (!collection?.photos.length) toast('Add some photos first.');
    else nav.push({ name: 'player', id, startPhotoId });
  };
  const show = (photoId: string) => nav.push({ name: 'player', id, startPhotoId: photoId, single: true });

  useKeys((action) => {
    const photoId = (document.activeElement as HTMLElement | null)?.getAttribute('data-photo-id') ?? undefined;
    if (action === 'green' || action === 'play' || action === 'playpause') {
      play(photoId);
      return true;
    }
    if (action === 'red' && photoId) {
      show(photoId);
      return true;
    }
    return false;
  });

  if (!collection) {
    return (
      <div class="screen">
        <div class="empty"><h2>This collection no longer exists</h2></div>
      </div>
    );
  }

  const more = async () => {
    const action = await choose({
      title: collection.name,
      options: [
        { value: 'rename' as const, label: 'Rename' },
        ...(pinnedHere ? [{ value: 'stop' as const, label: 'Stop showing on the TV', hint: 'The app opens to the menu again' }] : []),
        { value: 'delete' as const, label: 'Delete collection', hint: 'Your photos stay where they are' },
      ],
    });
    if (action === 'rename') {
      const name = await prompt({ title: 'Rename collection', label: 'Name', value: collection.name, confirmLabel: 'Save' });
      if (name) renameCollection(id, name);
    }
    if (action === 'stop') clearNowShowing();
    if (action === 'delete') {
      const ok = await confirm({ title: `Delete “${collection.name}”?`, message: 'Only the collection is deleted. Your photos stay where they are.', confirmLabel: 'Delete', danger: true });
      if (ok) {
        deleteCollection(id);
        nav.pop();
      }
    }
  };

  const photoMenu = async (photo: PhotoRef) => {
    // The stored date may only be the file's modified time; prefer EXIF.
    const taken = await captureDate(photo);
    const action = await choose({
      art: <Thumb photo={photo} />,
      title: taken ? longDate(taken) : photo.name,
      message: `${taken ? `${photo.name} · ` : ''}${sourceLabel(photo.sourceId)}`,
      options: [
        { value: 'show', label: 'Show this photo', hint: 'Stays on the TV until you play something else' },
        { value: 'play', label: 'Play from here', hint: 'Then rotates through the collection' },
        { value: 'cover', label: 'Use as cover' },
        { value: 'remove', label: 'Remove from collection' },
      ] as const,
    });
    if (action === 'show') show(photo.id);
    if (action === 'play') play(photo.id);
    if (action === 'cover') {
      setCover(id, photo.id);
      toast('Cover updated');
    }
    if (action === 'remove') removePhoto(id, photo.id);
  };

  const count = collection.photos.length;
  return (
    <div class="screen detail">
      <AmbientBackdrop photo={coverOf(collection)} />
      <aside class="detail-side">
        {pinnedHere && (
          <div class="hero-kicker now">
            <span class="dot" /> Now showing{showing!.photoId ? ' · one photo' : ''}
          </div>
        )}
        <h1 class="detail-title">{collection.name}</h1>
        <div class="detail-meta">
          {count ? plural(count, 'photo') : 'No photos yet'}
          {collection.albumSourceId && ' · Google Photos album, kept in sync'}
        </div>
        <div class="side-actions">
          {count > 0 && (
            <SideAction icon="play" label={pinnedHere && !showing!.photoId ? 'Resume' : 'Play'} primary navId="play" autofocus onClick={() => play()} />
          )}
          <SideAction icon="palette" label="Style" sub={styleSummary(collection.play)} navId="options" onClick={() => nav.push({ name: 'play-setup', id })} />
          <SideAction icon="plus" label="Add photos" navId="add" autofocus={count === 0} onClick={() => nav.push({ name: 'pick-source', collectionId: id })} />
          <SideAction icon="more" label="More" navId="more" onClick={more} />
        </div>
        {count > 0 && (
          <div class="key-hints">
            <span><i class="key-dot key-red" />Show photo</span>
            <span><i class="key-dot key-green" />Play from photo</span>
          </div>
        )}
      </aside>
      <main class="detail-main">
        {count === 0 ? (
          <div class="detail-empty">
            <Icon name="image" />
            <p>Add photos from a USB drive, a network share or the web.</p>
          </div>
        ) : (
          <div class="scroll">
            <div class="photo-grid">
              {collection.photos.map((p) => (
                <button
                  key={p.id}
                  class={`photo-tile ${showing?.photoId === p.id ? 'is-showing' : ''}`}
                  data-nav
                  data-nav-id={p.id}
                  data-photo-id={p.id}
                  onClick={() => photoMenu(p)}
                >
                  <Thumb photo={p} />
                  {showing?.photoId === p.id && <span class="pill-now">Showing</span>}
                </button>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
