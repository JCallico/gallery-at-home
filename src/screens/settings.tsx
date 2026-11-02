import { useState } from 'preact/hooks';
import { useNav } from '../nav/router';
import { SAMPLE_COLLECTIONS } from '../samples';
import { restoreSampleCollections, updateSettings, useStore } from '../store/store';
import { toast } from '../ui/overlay';
import { ChoiceRow, Row, TextRow } from '../ui/widgets';
import { Header, plural } from './common';

const INTERVALS = [5, 10, 15, 30, 60, 300].map((s) => ({ value: s, label: s < 60 ? `${s} seconds` : `${s / 60} min` }));
const IDLE = [0, 1, 2, 5, 10, 15, 30].map((m) => ({ value: m, label: m === 0 ? 'Never' : `${m} min` }));

export function SettingsScreen() {
  const nav = useNav();
  const settings = useStore((s) => s.settings);
  const [clientId, setClientId] = useState(settings.oneDriveClientId);
  return (
    <div class="screen page">
      <Header title="Settings" />
      <div class="screen-body">
        <div class="scroll">
          <div class="form">
            <ChoiceRow
              label="Back to “now showing” after"
              hint="When the menus are left alone"
              value={settings.idleMin}
              options={IDLE}
              onChange={(v) => updateSettings({ idleMin: v })}
            />
            <ChoiceRow
              label="New collections change photos every"
              value={settings.defaultPlay.intervalSec}
              options={INTERVALS}
              onChange={(v) => updateSettings({ defaultPlay: { ...settings.defaultPlay, intervalSec: v } })}
            />
            <TextRow
              label="OneDrive app ID"
              value={clientId}
              placeholder="Application (client) ID from Azure"
              onChange={setClientId}
              onSubmit={() => {
                updateSettings({ oneDriveClientId: clientId.trim() });
                toast('Saved');
              }}
            />
            {SAMPLE_COLLECTIONS.length > 0 && (
              <Row
                label="Included collections"
                hint="Bring back any you deleted"
                onClick={() => {
                  const n = restoreSampleCollections();
                  toast(n ? `Restored ${plural(n, 'collection')}` : 'All included collections are already there');
                }}
              >
                <span class="row-value">Restore</span>
              </Row>
            )}
            {SAMPLE_COLLECTIONS.length > 0 && (
              <Row label="Photo credits" hint="Who took the included photos and their licences" onClick={() => nav.push({ name: 'credits' })}>
                <span class="row-value">View</span>
              </Row>
            )}
            <Row label="Version" onClick={() => undefined}>
              <span class="row-value">{__VERSION__}</span>
            </Row>
          </div>
        </div>
      </div>
    </div>
  );
}
