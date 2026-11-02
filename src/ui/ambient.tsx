import { useEffect, useRef, useState } from 'preact/hooks';
import { loadThumb } from '../sources';
import { PhotoRef } from '../store/types';

// The "living" background behind the menus: the focused collection's photo,
// stretched from a tiny canvas into a soft colour field, crossfading as the
// focus moves. A tiny canvas scaled up is far cheaper on the TV's GPU than a
// CSS blur, and it hides the source's resolution entirely.

const W = 48;
const H = 27;

function BlurLayer({ photo, onReady }: { photo: PhotoRef; onReady: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    loadThumb(photo).then((loaded) => {
      const img = new Image();
      img.onload = () => {
        const ctx = live && canvas.current?.getContext('2d');
        if (!ctx) return;
        ctx.save();
        if (loaded.orientation >= 5) {
          // Sideways originals: rotate so the colours land where they show.
          ctx.translate(W / 2, H / 2);
          ctx.rotate(Math.PI / 2);
          ctx.drawImage(img, -H / 2, -W / 2, H, W);
        } else {
          ctx.drawImage(img, 0, 0, W, H);
        }
        ctx.restore();
        setReady(true);
        onReady();
      };
      img.src = loaded.url;
    }, () => undefined);
    return () => {
      live = false;
    };
  }, [photo.id]);
  return <canvas ref={canvas} class={`ambient-layer ${ready ? 'ready' : ''}`} width={W} height={H} />;
}

/** Full-screen soft background from a photo; null shows the plain wall. */
export function AmbientBackdrop({ photo }: { photo: PhotoRef | null | undefined }) {
  const [layers, setLayers] = useState<{ photo: PhotoRef; key: number }[]>([]);
  const nextKey = useRef(0);
  useEffect(() => {
    if (!photo) {
      setLayers([]);
      return;
    }
    setLayers((list) => (list[list.length - 1]?.photo.id === photo.id ? list : [...list, { photo, key: ++nextKey.current }]));
  }, [photo?.id]);
  // Once the newest layer has faded in, older ones can go.
  const settle = (key: number) =>
    setTimeout(() => setLayers((list) => (list.length > 1 && list[list.length - 1].key === key ? list.slice(-1) : list)), 900);
  return (
    <div class="ambient-bg" aria-hidden="true">
      {layers.map((l) => (
        <BlurLayer key={l.key} photo={l.photo} onReady={() => settle(l.key)} />
      ))}
      <div class="ambient-shade" />
    </div>
  );
}
