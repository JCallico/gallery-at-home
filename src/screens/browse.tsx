import { useEffect, useState } from 'preact/hooks';
import { useKeys, useNav } from '../nav/router';
import { adapterFor, sourceLabel } from '../sources';
import { FolderEntry, Listing, PhotoEntry } from '../sources/types';
import { addPhotos, getCollection } from '../store/store';
import { PhotoRef } from '../store/types';
import { Icon } from '../ui/icons';
import { errorMessage, toast } from '../ui/overlay';
import { Thumb } from '../ui/photo';
import { Button, Empty, Legend, Spinner } from '../ui/widgets';
import { Header, plural } from './common';

// Selection survives moving between folders, so photos can be gathered from
// several folders before adding them in one go.
const selections = new Map<string, Map<string, PhotoRef>>();

function selectionFor(collectionId: string): Map<string, PhotoRef> {
  let sel = selections.get(collectionId);
  if (!sel) selections.set(collectionId, (sel = new Map()));
  return sel;
}

export function clearSelection(collectionId: string): void {
  selections.delete(collectionId);
}

// Listings are cached for the session so going Back is instant and focus
// can return to the folder you came from.
const listings = new Map<string, Listing>();

const RECURSIVE_LIMIT = 3000;

async function collectRecursive(sourceId: string, folderKey: string | null, onProgress: (n: number) => void): Promise<PhotoRef[]> {
  const adapter = adapterFor(sourceId);
  const found: PhotoRef[] = [];
  const queue: (string | null)[] = [folderKey];
  while (queue.length && found.length < RECURSIVE_LIMIT) {
    const listing = await adapter.list(queue.shift()!);
    for (const e of listing.entries) {
      if (e.type === 'folder') queue.push(e.key);
      else found.push(e.ref);
    }
    onProgress(found.length);
  }
  return found.slice(0, RECURSIVE_LIMIT);
}

interface Props {
  collectionId: string;
  sourceId: string;
  folderKey: string | null;
  trail: string[];
}

export function Browse({ collectionId, sourceId, folderKey, trail }: Props) {
  const nav = useNav();
  const cacheKey = `${sourceId}|${folderKey ?? ''}`;
  const [listing, setListing] = useState<Listing | null>(() => listings.get(cacheKey) ?? null);
  const [error, setError] = useState<string | null>(null);
  const [, setVersion] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const selection = selectionFor(collectionId);
  const refresh = () => setVersion((v) => v + 1);
  const existing = new Set(getCollection(collectionId)?.photos.map((p) => p.id));

  useEffect(() => {
    if (listings.has(cacheKey)) return;
    let live = true;
    adapterFor(sourceId)
      .list(folderKey)
      .then(
        (l) => {
          if (!live) return;
          listings.set(cacheKey, l);
          setListing(l);
          nav.settleFocus();
        },
        (err) => live && setError(errorMessage(err)),
      );
    return () => {
      live = false;
    };
  }, [cacheKey]);

  // (No flatMap: 2019 TVs run Chromium 63, which predates it.)
  const entries = listing?.entries ?? [];
  const photos = entries.filter((e): e is PhotoEntry => e.type === 'photo').map((e) => e.ref);
  const folders = entries.filter((e): e is FolderEntry => e.type === 'folder');
  const selectable = photos.filter((p) => !existing.has(p.id));
  const allHereSelected = selectable.length > 0 && selectable.every((p) => selection.has(p.id));

  const toggle = (p: PhotoRef) => {
    if (existing.has(p.id)) return toast('Already in this collection');
    if (selection.has(p.id)) selection.delete(p.id);
    else selection.set(p.id, p);
    refresh();
  };

  const toggleAll = () => {
    if (allHereSelected) selectable.forEach((p) => selection.delete(p.id));
    else selectable.forEach((p) => selection.set(p.id, p));
    refresh();
  };

  const commit = (refs: PhotoRef[]) => {
    const added = addPhotos(collectionId, refs);
    clearSelection(collectionId);
    toast(added ? `Added ${plural(added, 'photo')}` : 'Those photos were already in the collection');
    nav.popTo('collection');
  };

  const addSelected = () => {
    if (!selection.size) return toast('Select photos first, or add the whole folder.');
    commit(Array.from(selection.values()));
  };

  const addFolder = async () => {
    setBusy('Finding photos…');
    try {
      const refs = await collectRecursive(sourceId, folderKey, (n) => setBusy(`Finding photos… ${n.toLocaleString()}`));
      if (!refs.length) {
        toast('No photos in this folder or its subfolders.');
        return;
      }
      commit([...Array.from(selection.values()), ...refs]);
    } catch (err) {
      toast(errorMessage(err), true);
    } finally {
      setBusy(null);
    }
  };

  useKeys((action) => {
    if (action === 'green') {
      addSelected();
      return true;
    }
    if (action === 'yellow') {
      toggleAll();
      return true;
    }
    return false;
  });

  const crumbs = [sourceLabel(sourceId), ...trail].join('  ›  ');
  // A source's top level: "All folders", or "All photos" when it has no
  // folders (web links).
  const rootTitle = listing?.entries.some((e) => e.type === 'folder') ? 'All folders' : 'All photos';
  const title = folderKey === null ? rootTitle : listing?.title ?? '…';

  return (
    <div class="screen">
      <Header
        title={busy ?? title}
        crumbs={crumbs}
        sub={listing ? [folders.length && plural(folders.length, 'folder'), photos.length && plural(photos.length, 'photo')].filter(Boolean).join(' · ') : undefined}
      >
        <Button icon="check" label={selection.size ? `Add ${selection.size}` : 'Add selected'} kind="primary" navId="add-selected" onClick={addSelected} />
        {selectable.length > 0 && (
          <Button icon="selectAll" label={allHereSelected ? 'Clear' : 'Select all'} navId="select-all" onClick={toggleAll} />
        )}
        {folderKey !== null && <Button icon="folder" label="Add folder" navId="add-folder" onClick={addFolder} />}
      </Header>
      <div class="screen-body">
        {error && (
          <Empty icon="sources" title="Couldn’t open this folder">
            <p>{error}</p>
          </Empty>
        )}
        {!listing && !error && (
          <div class="empty">
            <Spinner />
          </div>
        )}
        {listing && !listing.entries.length && <Empty icon="folder" title="This folder is empty" />}
        {listing && listing.entries.length > 0 && (
          <div class="scroll">
            <div class="grid photos">
              {folders.map((f, i) => (
                <button
                  key={f.key}
                  class="card"
                  data-nav
                  data-nav-id={`f-${f.key}`}
                  data-nav-autofocus={i === 0 || undefined}
                  onClick={() => nav.push({ name: 'browse', collectionId, sourceId, folderKey: f.key, trail: folderKey === null ? [] : [...trail, title] })}
                >
                  <div class="card-art">
                    <div class="folder-art">
                      <Icon name="folder" />
                    </div>
                  </div>
                  <div class="card-title">{f.name}</div>
                </button>
              ))}
              {photos.map((p, i) => {
                const inCollection = existing.has(p.id);
                const on = inCollection || selection.has(p.id);
                return (
                  <button
                    key={p.id}
                    class="card"
                    data-nav
                    data-nav-id={p.id}
                    data-nav-autofocus={(!folders.length && i === 0) || undefined}
                    onClick={() => toggle(p)}
                  >
                    <div class="card-art">
                      <Thumb photo={p} />
                      {on && <div class="dim-overlay" />}
                      <span class={`check ${on ? 'on' : ''}`} style={inCollection ? { opacity: 0.5 } : undefined}>
                        {on && <Icon name="check" />}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <Legend items={[{ key: 'green', label: 'Add selected' }, { key: 'yellow', label: 'Select all' }]} />
      </div>
    </div>
  );
}
