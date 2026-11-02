// OneDrive through Microsoft Graph, signed in with the OAuth device code
// flow: the TV shows a short code, the user enters it on their phone at
// microsoft.com/link. No keyboard typing of passwords on the TV.

import { saveSource } from '../store/store';
import { OneDriveSource } from '../store/types';
import { HttpError, request } from './net';
import { Entry, Listing, photoRef, SourceAdapter } from './types';

const AUTHORITY = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const GRAPH = 'https://graph.microsoft.com/v1.0';
const SCOPES = 'Files.Read User.Read offline_access';

// --- Sign-in ----------------------------------------------------------------

export interface DeviceLogin {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresAt: number;
  intervalSec: number;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

function form(data: Record<string, string>): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(data).toString(),
  };
}

export async function startDeviceLogin(clientId: string): Promise<DeviceLogin> {
  const res = await request(`${AUTHORITY}/devicecode`, form({ client_id: clientId, scope: SCOPES }));
  const data = await res.json();
  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    expiresAt: Date.now() + data.expires_in * 1000,
    intervalSec: data.interval || 5,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Polls until the user finishes on their phone; resolves with the new source. */
export async function completeDeviceLogin(
  clientId: string,
  login: DeviceLogin,
  isCancelled: () => boolean,
): Promise<OneDriveSource | null> {
  let interval = login.intervalSec;
  while (Date.now() < login.expiresAt) {
    await sleep(interval * 1000);
    if (isCancelled()) return null;
    try {
      const res = await request(
        `${AUTHORITY}/token`,
        form({
          client_id: clientId,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          device_code: login.deviceCode,
        }),
      );
      const tokens: TokenResponse = await res.json();
      const me = await (await request(`${GRAPH}/me`, { headers: { Authorization: `Bearer ${tokens.access_token}` } })).json();
      const account: string = me.userPrincipalName || me.mail || me.displayName || 'OneDrive';
      const source: OneDriveSource = {
        id: `onedrive-${me.id}`,
        kind: 'onedrive',
        name: me.displayName ? `${me.displayName}'s OneDrive` : 'OneDrive',
        account,
        refreshToken: tokens.refresh_token,
      };
      accessTokens.set(source.id, { token: tokens.access_token, expiresAt: Date.now() + (tokens.expires_in - 120) * 1000 });
      return source;
    } catch (err) {
      const code = err instanceof HttpError ? safeJson(err.body)?.error : undefined;
      if (code === 'authorization_pending') continue;
      if (code === 'slow_down') {
        interval += 5;
        continue;
      }
      if (code === 'authorization_declined') throw new Error('Sign-in was declined on the phone.');
      if (code === 'expired_token') break;
      throw err;
    }
  }
  throw new Error('The code expired before sign-in finished. Try again.');
}

function safeJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

// --- Tokens -----------------------------------------------------------------

const accessTokens = new Map<string, { token: string; expiresAt: number }>();
const refreshing = new Map<string, Promise<string>>();

async function accessToken(source: OneDriveSource, clientId: string): Promise<string> {
  const cached = accessTokens.get(source.id);
  if (cached && cached.expiresAt > Date.now()) return cached.token;
  let pending = refreshing.get(source.id);
  if (!pending) {
    pending = (async () => {
      try {
        const res = await request(
          `${AUTHORITY}/token`,
          form({ client_id: clientId, grant_type: 'refresh_token', refresh_token: source.refreshToken, scope: SCOPES }),
        );
        const tokens: TokenResponse = await res.json();
        accessTokens.set(source.id, { token: tokens.access_token, expiresAt: Date.now() + (tokens.expires_in - 120) * 1000 });
        // Microsoft rotates refresh tokens; keep the newest one.
        if (tokens.refresh_token && tokens.refresh_token !== source.refreshToken) {
          source.refreshToken = tokens.refresh_token;
          saveSource({ ...source });
        }
        return tokens.access_token;
      } catch (err) {
        if (err instanceof HttpError && err.status === 400) {
          throw new Error('OneDrive sign-in has expired. Remove this source and sign in again.');
        }
        throw err;
      } finally {
        refreshing.delete(source.id);
      }
    })();
    refreshing.set(source.id, pending);
  }
  return pending;
}

// --- Browsing ---------------------------------------------------------------

const ROOTS: { key: string; name: string }[] = [
  { key: 'special:photos', name: 'Pictures' },
  { key: 'special:cameraroll', name: 'Camera Roll' },
  { key: 'root', name: 'My files' },
];

const THUMB_TTL = 45 * 60 * 1000; // Graph thumbnail URLs expire after ~1h
const MAX_ITEMS = 5000;

export function oneDriveAdapter(source: OneDriveSource, clientId: string): SourceAdapter {
  const thumbs = new Map<string, { url: string; at: number }>();

  const graph = async (pathOrUrl: string) => {
    const url = pathOrUrl.startsWith('https://') ? pathOrUrl : `${GRAPH}${pathOrUrl}`;
    const token = await accessToken(source, clientId);
    return (await request(url, { headers: { Authorization: `Bearer ${token}` } })).json();
  };

  const itemPath = (key: string) => {
    if (key === 'root') return '/me/drive/root';
    if (key.startsWith('special:')) return `/me/drive/special/${key.slice(8)}`;
    return `/me/drive/items/${encodeURIComponent(key)}`;
  };

  const thumbnail = async (id: string, size: string): Promise<string> => {
    const cacheKey = `${id}@${size}`;
    const hit = thumbs.get(cacheKey);
    if (hit && Date.now() - hit.at < THUMB_TTL) return hit.url;
    const data = await graph(`${itemPath(id)}/thumbnails?select=${size}`);
    const url: string | undefined = data.value?.[0]?.[size]?.url;
    if (!url) throw new Error('OneDrive has no preview for this photo');
    thumbs.set(cacheKey, { url, at: Date.now() });
    return url;
  };

  return {
    source,
    async list(folderKey): Promise<Listing> {
      if (!folderKey) {
        return { key: null, title: source.name, entries: ROOTS.map((r) => ({ type: 'folder', key: r.key, name: r.name })) };
      }
      const entries: Entry[] = [];
      let next: string | undefined =
        `${itemPath(folderKey)}/children?$top=200&$expand=thumbnails&$select=id,name,folder,file,image,photo,createdDateTime`;
      let title = ROOTS.find((r) => r.key === folderKey)?.name;
      if (!title) title = (await graph(`${itemPath(folderKey)}?$select=name`)).name as string;
      while (next && entries.length < MAX_ITEMS) {
        const page: any = await graph(next);
        for (const item of page.value) {
          if (item.folder) {
            entries.push({ type: 'folder', key: item.id, name: item.name });
          } else if (item.file?.mimeType?.startsWith('image/')) {
            const large = item.thumbnails?.[0]?.large?.url;
            if (large) thumbs.set(`${item.id}@large`, { url: large, at: Date.now() });
            const taken = Date.parse(item.photo?.takenDateTime ?? item.createdDateTime ?? '');
            entries.push({
              type: 'photo',
              ref: photoRef(source.id, item.id, item.name, {
                takenAt: Number.isNaN(taken) ? undefined : taken,
                width: item.image?.width,
                height: item.image?.height,
              }),
            });
          }
        }
        next = page['@odata.nextLink'];
      }
      return { key: folderKey, title, entries };
    },
    thumbUrl: (ref) => thumbnail(ref.key, 'large'),
    // Graph renders a screen-sized, already-rotated JPEG: no EXIF work needed.
    imageUrl: (ref) => thumbnail(ref.key, 'c1920x1080'),
  };
}
