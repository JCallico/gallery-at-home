import { useState } from 'preact/hooks';
import { useNav } from '../nav/router';
import { albumRefs, fetchAlbum, normalizeLink, SHORT_LINK_PREFIX } from '../sources/gphotos';
import { addPhotos, createAlbumCollection, getCollection, getState, newId, saveSource } from '../store/store';
import { GooglePhotosSource } from '../store/types';
import { choose, errorMessage, toast } from '../ui/overlay';
import { Button, Spinner, TextRow } from '../ui/widgets';
import { Header, plural } from './common';

// Add a Google Photos shared album by its link. The link box starts with
// the short-link prefix the Photos app uses, so only the code is typed.
// The album becomes a collection that keeps itself up to date; from a
// collection's "Add photos" it can instead add a one-off copy of the photos.

export function AddGooglePhotos({ collectionId }: { collectionId?: string }) {
  const nav = useNav();
  const [link, setLink] = useState(SHORT_LINK_PREFIX);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    setError(null);
    const url = normalizeLink(link);
    if (!url || url === SHORT_LINK_PREFIX) return setError('Type the code at the end of the album’s link, e.g. photos.app.goo.gl/AbC123xyz');
    setBusy('Reading the album…');
    try {
      const album = await fetchAlbum(url);
      if (!album.photos.length) throw new Error('This album has no photos (videos aren’t shown).');
      // One source per album: adding the same album again reuses it.
      const existing = getState().sources.find((s): s is GooglePhotosSource => s.kind === 'gphotos' && s.url === album.url);
      const source: GooglePhotosSource = existing ?? { id: `gphotos-${newId()}`, kind: 'gphotos', name: album.title, url: album.url };
      saveSource({ ...source, name: album.title });
      const refs = albumRefs(source, album);
      setBusy(null);

      const target = collectionId ? getCollection(collectionId) : undefined;
      const how = target
        ? await choose({
            title: album.title,
            message: `${plural(refs.length, 'photo')} found.`,
            options: [
              { value: 'new', label: 'Make it a new collection', hint: 'Stays in sync: photos added to the album appear on the TV' },
              { value: 'add', label: `Add the photos to “${target.name}”`, hint: 'A one-off copy of what’s in the album now' },
            ] as const,
          })
        : 'new';
      if (!how) return;
      if (how === 'add' && target) {
        const n = addPhotos(target.id, refs);
        toast(n ? `Added ${plural(n, 'photo')}` : 'Those photos are already in this collection');
        nav.popTo('collection');
        return;
      }
      const c = createAlbumCollection(album.title, source.id, refs);
      toast(`${plural(refs.length, 'photo')} added from Google Photos`);
      nav.replace({ name: 'collection', id: c.id });
    } catch (err) {
      setBusy(null);
      setError(errorMessage(err));
    }
  };

  return (
    <div class="screen">
      <Header title="Add a Google Photos album" sub="Share an album from the Google Photos app, then type its link here" />
      <div class="screen-body">
        <div class="scroll">
          <div class="form">
            <TextRow label="Album link" value={link} type="text" autofocus onChange={setLink} onSubmit={add} />
            {busy && (
              <div class="form-note">
                <Spinner /> {busy}
              </div>
            )}
            {error && <div class="form-error">{error}</div>}
            <div class="form-note">
              On your phone, open the album in Google Photos, tap <b>Share</b>, then <b>Create link</b>. The link looks like{' '}
              <b>photos.app.goo.gl/AbC123xyz</b>; type the part after the slash. Videos in the album are skipped, and
              new photos added to it appear on the TV by themselves.
            </div>
            <div class="form-actions">
              <Button label={busy ? 'Reading…' : 'Add album'} kind="primary" navId="save" onClick={() => !busy && void add()} />
              <Button label="Cancel" navId="cancel" onClick={() => nav.pop()} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
