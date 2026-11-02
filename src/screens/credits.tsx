import { SAMPLE_COLLECTIONS } from '../samples';
import { Row } from '../ui/widgets';
import { Header } from './common';

// Who made the included photos and under which licence. Some licences
// (CC BY, CC BY-SA) require this; the rest is simply courtesy. Each row is
// focusable so the remote can scroll the list.

function sourceName(url: string): string {
  if (/wikimedia\.org|wikipedia\.org/.test(url)) return 'Wikimedia Commons';
  if (/metmuseum\.org/.test(url)) return 'The Met';
  if (/artic\.edu/.test(url)) return 'Art Institute of Chicago';
  if (/nasa\.gov/.test(url)) return 'NASA';
  return url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
}

export function CreditsScreen() {
  return (
    <div class="screen page">
      <Header title="Photo credits" sub="The included collections. Photos were resized for the TV." />
      <div class="screen-body">
        <div class="scroll">
          <div class="form">
            {SAMPLE_COLLECTIONS.map((c) => (
              <div key={c.id} class="credits-group">
                <div class="credits-heading">{c.name}</div>
                {c.photos.map((p) => (
                  <Row
                    key={p.file}
                    navId={`${c.id}/${p.file}`}
                    label={p.title}
                    hint={`${p.by} · ${p.license}`}
                    onClick={() => undefined}
                  >
                    <span class="row-value">{sourceName(p.source)}</span>
                  </Row>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
