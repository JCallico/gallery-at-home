import { useEffect, useState } from 'preact/hooks';
import { useNav } from '../nav/router';
import { completeDeviceLogin, DeviceLogin, startDeviceLogin } from '../sources/onedrive';
import { saveSource, updateSettings, useStore } from '../store/store';
import { errorMessage, toast } from '../ui/overlay';
import { Button, Spinner, TextRow } from '../ui/widgets';
import { Header } from './common';

export function AddOneDrive() {
  const nav = useNav();
  const savedId = useStore((s) => s.settings.oneDriveClientId);
  const [clientId, setClientId] = useState(savedId);
  const [login, setLogin] = useState<DeviceLogin | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  // Poll for completion while the code is on screen; stop if the user leaves.
  useEffect(() => {
    if (!login) return;
    let cancelled = false;
    completeDeviceLogin(savedId, login, () => cancelled).then(
      (source) => {
        if (!source || cancelled) return;
        saveSource(source);
        toast(`Signed in as ${source.account}`);
        nav.pop();
      },
      (err) => {
        if (cancelled) return;
        setLogin(null);
        setError(errorMessage(err));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [login]);

  const start = async () => {
    const id = clientId.trim();
    if (!/^[0-9a-f-]{36}$/i.test(id)) return setError('The app ID is a 36-character code like 1a2b3c4d-…');
    if (id !== savedId) updateSettings({ oneDriveClientId: id });
    setError(null);
    setStarting(true);
    try {
      setLogin(await startDeviceLogin(id));
    } catch (err) {
      setError(`Microsoft refused the sign-in request: ${errorMessage(err)}`);
    } finally {
      setStarting(false);
    }
  };

  if (login) {
    return (
      <div class="screen">
        <Header title="Sign in to OneDrive" />
        <div class="form">
          <div class="code-box">
            <div class="code-steps">
              1. On your phone or computer, go to <b>{login.verificationUri.replace(/^https?:\/\//, '')}</b>
              <br />
              2. Enter this code and sign in
              <br />
              3. This screen continues by itself
            </div>
            <div class="user-code">{login.userCode}</div>
          </div>
          <div class="form-actions" style={{ alignItems: 'center' }}>
            <Spinner />
            <Button label="Cancel" navId="cancel" autofocus onClick={() => setLogin(null)} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div class="screen">
      <Header title="Add OneDrive" sub="Read-only access to your photos" />
      <div class="screen-body">
        <div class="scroll">
          <div class="form">
            {!savedId && (
              <div class="form-note">
                OneDrive needs a free app ID, made once: in portal.azure.com → App registrations → New registration, pick
                “personal Microsoft accounts”, then under Authentication turn on “Allow public client flows”. Copy the
                Application (client) ID here.
              </div>
            )}
            <TextRow label="App ID" value={clientId} placeholder="Application (client) ID" onChange={setClientId} autofocus={!savedId} />
            {error && <div class="form-error">{error}</div>}
            <div class="form-actions">
              <Button label={starting ? 'Contacting Microsoft…' : 'Sign in'} kind="primary" navId="signin" autofocus={!!savedId} onClick={start} />
              <Button label="Cancel" navId="cancel" onClick={() => nav.pop()} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
