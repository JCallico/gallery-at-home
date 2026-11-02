import { useState } from 'preact/hooks';
import { useNav } from '../nav/router';
import { getState, newId, saveSource } from '../store/store';
import { WebSource } from '../store/types';
import { toast } from '../ui/overlay';
import { Button, TextRow } from '../ui/widgets';
import { Header } from './common';

export function AddWeb({ sourceId }: { sourceId?: string }) {
  const nav = useNav();
  const existing = getState().sources.find((s): s is WebSource => s.id === sourceId && s.kind === 'web');
  const [name, setName] = useState(existing?.name ?? 'Web photos');
  const [urls, setUrls] = useState<string[]>(existing?.urls.length ? existing.urls : ['']);
  const [error, setError] = useState<string | null>(null);

  const setUrl = (i: number, v: string) => setUrls((list) => list.map((u, j) => (j === i ? v : u)));

  const save = () => {
    const cleaned = urls.map((u) => u.trim()).filter(Boolean).map((u) => (/^https?:\/\//i.test(u) ? u : `https://${u}`));
    const bad = cleaned.find((u) => {
      try {
        new URL(u);
        return false;
      } catch {
        return true;
      }
    });
    if (!cleaned.length) return setError('Enter at least one link.');
    if (bad) return setError(`Not a valid link: ${bad}`);
    saveSource({ id: existing?.id ?? `web-${newId()}`, kind: 'web', name: name.trim() || 'Web photos', urls: cleaned });
    toast('Saved');
    nav.pop();
  };

  return (
    <div class="screen">
      <Header title={existing ? 'Edit web links' : 'Add web links'} sub="Links to photos, or to pages and lists of photos" />
      <div class="screen-body">
        <div class="scroll">
          <div class="form">
            <TextRow label="Name" value={name} onChange={setName} />
            {urls.map((u, i) => (
              <TextRow key={i} label={`Link ${i + 1}`} value={u} type="url" placeholder="https://…" onChange={(v) => setUrl(i, v)} autofocus={i === urls.length - 1 && !u} />
            ))}
            {error && <div class="form-error">{error}</div>}
            <div class="form-note">
              A link can point straight at a photo, at a web page (its photos are collected), at a text file with one
              photo URL per line, or at a JSON list of URLs.
            </div>
            <div class="form-actions">
              <Button label="Save" kind="primary" navId="save" onClick={save} />
              <Button icon="plus" label="Another link" navId="more" onClick={() => setUrls((l) => [...l, ''])} />
              <Button label="Cancel" navId="cancel" onClick={() => nav.pop()} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
