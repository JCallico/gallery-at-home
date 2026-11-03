// Starting a collection from a source just added: the name box comes
// prefilled with the source's name, so nothing is typed twice with the
// remote. Used by the add-source screens when opened from "New collection".

import { useNav } from '../nav/router';
import { createCollection } from '../store/store';
import { ConfiguredSource } from '../store/types';
import { prompt } from '../ui/overlay';

export function askCollectionName(suggested: string): Promise<string | null> {
  return prompt({ title: 'New collection', label: 'Name', value: suggested, confirmLabel: 'Create' }).then((n) => n?.trim() || null);
}

/**
 * After a source is saved: name the new collection (prefilled with the
 * source's name), then open the source to pick photos for it. Cancelling
 * keeps the source but makes no collection.
 */
export async function collectionFromSource(nav: ReturnType<typeof useNav>, source: ConfiguredSource): Promise<void> {
  const name = await askCollectionName(source.name);
  if (!name) {
    nav.pop();
    return;
  }
  const c = createCollection(name);
  nav.replace({ name: 'collection', id: c.id });
  nav.push({ name: 'browse', collectionId: c.id, sourceId: source.id, folderKey: null, trail: [] });
}
