import { useNav } from '../nav/router';
import { useSources } from '../sources';
import { useStore } from '../store/store';
import { Header, NewCard, SourceCard } from './common';
import { chooseNewSource } from './sources';
import { clearSelection } from './browse';

export function PickSource({ collectionId }: { collectionId: string }) {
  const nav = useNav();
  const sources = useSources();
  const name = useStore((s) => s.collections.find((c) => c.id === collectionId)?.name ?? '');

  const open = (sourceId: string) => {
    clearSelection(collectionId);
    nav.push({ name: 'browse', collectionId, sourceId, folderKey: null, trail: [] });
  };

  return (
    <div class="screen page">
      <Header title="Add photos from…" crumbs={name} />
      <div class="screen-body">
        <div class="scroll">
          <div class="grid tiles">
            {sources.map((s) => (
              <SourceCard key={s.id} source={s} navId={`src-${s.id}`} onClick={() => open(s.id)} />
            ))}
            <NewCard label="Add source" sub="OneDrive, NAS, web links" navId="new-source" onClick={() => chooseNewSource(nav)} />
          </div>
          {!sources.some((s) => s.kind === 'usb') && (
            <div class="page-note">No USB drive detected. Plug one into the TV and it will show up here.</div>
          )}
        </div>
      </div>
    </div>
  );
}
