import type { PlayerId, RoomTicket } from '@cranny/multiplayer';

// Test seams for AblyTransport against the real Ably service. Importing this module replaces the
// global WebSocket, which the Ably SDK captures when it loads, so import it before the SDK. Only
// src/net/ablyTransport.test.ts does.

/** The Ably key for the conformance run, from the repo-root .env via vite.config.ts. */
export const ABLY_KEY: string | undefined = (
  globalThis as { process?: { env: Record<string, string | undefined> } }
).process?.env.ABLY_KEY;

/** Players whose sockets are cut, and who can't open new ones until restored. */
const cut = new Set<PlayerId>();
const sockets = new Set<CuttableWebSocket>();

/** The Ably clientId in a connection URL's token, or null if there's no token. */
function clientIdOf(url: string): PlayerId | null {
  const token = new URL(url).searchParams.get('access_token');
  const payload = token?.split('.')[1];
  if (!payload) return null;
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const id: unknown = (JSON.parse(json) as Record<string, unknown>)['x-ably-clientId'];
    return typeof id === 'string' ? id : null;
  } catch {
    return null;
  }
}

/** A WebSocket that {@link cutPlayer} can close as a lost network would. */
class CuttableWebSocket extends WebSocket {
  readonly player: PlayerId | null;

  /** Opens a socket, or fails it straight away if its player is cut. */
  constructor(url: string | URL, protocols?: string | string[]) {
    super(url, protocols);
    this.player = clientIdOf(String(url));
    sockets.add(this);
    this.addEventListener('close', () => sockets.delete(this));
    if (this.player !== null && cut.has(this.player)) queueMicrotask(() => this.close(4000));
  }
}
globalThis.WebSocket = CuttableWebSocket;

/**
 * Closes a player's sockets without Ably's own goodbye, as a lost network would, and refuses
 * new ones until {@link restorePlayer}. Ably sees an abrupt disconnect.
 */
export function cutPlayer(player: PlayerId): void {
  cut.add(player);
  for (const socket of sockets) if (socket.player === player) socket.close(4000);
}

/** Lets a cut player open sockets again. */
export function restorePlayer(player: PlayerId): void {
  cut.delete(player);
}

/** Base64url of bytes or text, without padding. */
function base64url(data: ArrayBuffer | string): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** An Ably JWT for one player on one channel, signed with `key`, as the rooms API makes them. */
export async function roomToken(key: string, channel: string, self: PlayerId): Promise<string> {
  const colon = key.indexOf(':');
  const [name, secret] = [key.slice(0, colon), key.slice(colon + 1)];
  const iat = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT', kid: name }));
  const payload = base64url(
    JSON.stringify({
      iat,
      exp: iat + 3600,
      'x-ably-capability': JSON.stringify({ [channel]: ['publish', 'subscribe', 'presence'] }),
      'x-ably-clientId': self,
    }),
  );
  const hmac = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    hmac,
    new TextEncoder().encode(`${header}.${payload}`),
  );
  return `${header}.${payload}.${base64url(signature)}`;
}

/** A ticket for `room` in this test run's own namespace, so runs never meet. */
export async function testTicket(
  key: string,
  run: string,
  room: string,
  self: PlayerId,
): Promise<RoomTicket> {
  const channel = `room:conformance-${run}-${room}`;
  return {
    room,
    channel,
    credential: { value: await roomToken(key, channel, self), expiresInMs: 3_600_000 },
  };
}
