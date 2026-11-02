import { useState } from 'preact/hooks';
import { useNav } from '../nav/router';
import { testNetworkSource } from '../sources/network';
import { getState, newId, saveSource } from '../store/store';
import { NetworkSource } from '../store/types';
import { errorMessage, toast } from '../ui/overlay';
import { Button, TextRow } from '../ui/widgets';
import { Header, plural } from './common';

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

export function AddNetwork({ sourceId }: { sourceId?: string }) {
  const nav = useNav();
  const existing = getState().sources.find((s): s is NetworkSource => s.id === sourceId && s.kind === 'network');
  const [name, setName] = useState(existing?.name ?? '');
  const [url, setUrl] = useState(existing?.url ?? '');
  const [username, setUsername] = useState(existing?.username ?? '');
  const [password, setPassword] = useState(existing?.password ?? '');
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const save = async () => {
    if (!url.trim()) return setError('Enter the address of the share.');
    let address: string;
    try {
      address = new URL(normalizeUrl(url)).href;
    } catch {
      return setError('That address doesn’t look right. Example: http://192.168.2.20:5005/photo');
    }
    const source: NetworkSource = {
      id: existing?.id ?? `net-${newId()}`,
      kind: 'network',
      name: name.trim() || new URL(address).host,
      url: address,
      username: username.trim() || undefined,
      password: password || undefined,
    };
    setTesting(true);
    setError(null);
    try {
      const n = await testNetworkSource(source);
      saveSource(source);
      toast(`Connected · ${plural(n, 'item')} at the top level`);
      nav.pop();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setTesting(false);
    }
  };

  return (
    <div class="screen">
      <Header title={existing ? 'Edit network share' : 'Add a network share'} sub="A WebDAV share or web folder on your NAS or PC" />
      <div class="screen-body">
        <div class="scroll">
          <div class="form">
            <TextRow label="Address" value={url} type="url" placeholder="http://192.168.2.20:5005/photo" onChange={setUrl} autofocus />
            <TextRow label="Name" value={name} placeholder="e.g. Synology photos" onChange={setName} />
            <TextRow label="User name" value={username} placeholder="Optional" onChange={setUsername} />
            <TextRow label="Password" value={password} type="password" placeholder="Optional" onChange={setPassword} />
            {error && <div class="form-error">{error}</div>}
            <div class="form-note">
              Synology: enable WebDAV Server in Package Center (port 5005). Nextcloud: use …/remote.php/dav/files/USER/.
              Any web server with directory listings also works.
            </div>
            <div class="form-actions">
              <Button label={testing ? 'Connecting…' : 'Connect & save'} kind="primary" navId="save" onClick={save} />
              <Button label="Cancel" navId="cancel" onClick={() => nav.pop()} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
