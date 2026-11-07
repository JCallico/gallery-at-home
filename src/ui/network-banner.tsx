import { useEffect, useState } from 'preact/hooks';

/** How long the message stays over photos playing as a picture frame. */
export const OVER_PHOTOS_MS = 10000;

function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine !== false);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

/**
 * Says when the TV has no network, until it's back. It takes no focus, so the
 * remote keeps working. Over playing photos it goes away after a moment: a
 * frame showing USB photos may never have a network, and must stay a picture.
 */
export function NetworkBanner({ playing }: { playing: boolean }) {
  const online = useOnline();
  const [quiet, setQuiet] = useState(false);
  useEffect(() => {
    setQuiet(false);
    if (online || !playing) return;
    const timer = setTimeout(() => setQuiet(true), OVER_PHOTOS_MS);
    return () => clearTimeout(timer);
  }, [online, playing]);
  if (online || quiet) return null;
  return (
    <div class="network-banner" role="status">
      No network connection. USB and included photos still work.
    </div>
  );
}
