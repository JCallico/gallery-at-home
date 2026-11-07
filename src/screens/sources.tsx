import { useNav } from '../nav/router';
import { useSources } from '../sources';
import { getState, removeSource } from '../store/store';
import { Source } from '../store/types';
import { choose, confirm, toast } from '../ui/overlay';
import { Header, NewCard, plural, SourceCard } from './common';

/** What can be added, as shown on the Add source cards. */
export const NEW_SOURCE_KINDS = __GOOGLE_PHOTOS__ ? 'Google Photos, NAS, web links' : 'NAS, web links';

/**
 * The "Add a photo source" popup. `collectionId`: opened from a collection's
 * Add photos. `newCollection`: opened from New collection, so the source
 * becomes a collection named after it.
 */
export async function chooseNewSource(nav: ReturnType<typeof useNav>, collectionId?: string, newCollection = false): Promise<boolean> {
  const kind = await choose({
    title: 'Add a photo source',
    message: 'USB drives appear by themselves when plugged into the TV.',
    options: [
      ...(__GOOGLE_PHOTOS__ ? [{ value: 'gphotos' as const, label: 'Google Photos shared album', hint: 'Type the album’s share link; stays in sync' }] : []),
      { value: 'network' as const, label: 'NAS or network share', hint: 'WebDAV or a web folder on your network' },
      { value: 'web' as const, label: 'Web links', hint: 'Photo links, or pages and lists of photos' },
    ],
  });
  if (kind === 'gphotos') nav.push({ name: 'add-gphotos', collectionId });
  if (kind === 'network') nav.push({ name: 'add-network', newCollection });
  if (kind === 'web') nav.push({ name: 'add-web', newCollection });
  return !!kind;
}

async function manageSource(nav: ReturnType<typeof useNav>, source: Source): Promise<void> {
  if (source.kind === 'usb') {
    toast('Photos on this drive can be added from any collection.');
    return;
  }
  if (source.kind === 'samples') {
    toast('These photos come with the app and can be added to any collection.');
    return;
  }
  const used = getState().collections.reduce((n, c) => n + c.photos.filter((p) => p.sourceId === source.id).length, 0);
  const action = await choose({
    title: source.name,
    options: [
      ...(source.kind !== 'gphotos' ? [{ value: 'edit' as const, label: 'Edit' }] : []),
      { value: 'remove' as const, label: 'Remove source', hint: used ? `${plural(used, 'photo')} in collections use it` : undefined },
    ],
  });
  if (action === 'edit') nav.push({ name: source.kind === 'network' ? 'add-network' : 'add-web', sourceId: source.id });
  if (action === 'remove') {
    const ok = await confirm({
      title: `Remove ${source.name}?`,
      message: used ? 'Photos from it stay in your collections but won’t load until you add the source again.' : undefined,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (ok) removeSource(source.id);
  }
}

export function SourcesScreen() {
  const nav = useNav();
  const sources = useSources();
  return (
    <div class="screen page">
      <Header title="Sources" sub="Where your photos come from" />
      <div class="screen-body">
        <div class="scroll">
          <div class="grid tiles">
            {sources.map((s, i) => (
              <SourceCard key={s.id} source={s} navId={`src-${s.id}`} autofocus={i === 0} onClick={() => manageSource(nav, s)} />
            ))}
            <NewCard label="Add source" sub={NEW_SOURCE_KINDS} navId="new-source" onClick={() => chooseNewSource(nav)} />
          </div>
          {!sources.some((s) => s.kind === 'usb') && (
            <div class="page-note">No USB drive detected. Plug one into the TV and it shows up here.</div>
          )}
        </div>
      </div>
    </div>
  );
}
