import { createHmac } from 'node:crypto';
import type { DirectoryBackend, PlayerId, RoomCredential } from '@cranny/multiplayer';

// The directory's Ably backend (specs/2026-09-25-multiplayer/SPEC.md §7, §13; ABLY.md §1, §3):
// presence from Ably's REST channel metadata, and JWTs signed here with the key, so there is no
// call to Ably when issuing a credential and no Ably SDK.

/** Ably's REST host (ABLY.md §7). */
export const ABLY_REST_HOST = 'https://main.realtime.ably.net';
/** Token lifetime: the most Ably allows for a key with revocation enabled (ABLY.md §1). */
export const TOKEN_TTL_MS = 60 * 60_000;
/** How long to wait for Ably before the call counts as unavailable. */
export const ABLY_TIMEOUT_MS = 3_000;

/** What a room credential lets a player do on its channel, and nothing else (SPEC §7). */
export const ROOM_OPERATIONS = ['publish', 'subscribe', 'presence'] as const;

export type AblyBackendOptions = {
  /** The API key, `appId.keyId:secret`. */
  key: string;
  fetch?: typeof fetch;
  now?: () => number;
};

/** Splits an Ably API key into its name (`appId.keyId`) and secret. */
export function parseKey(key: string): { name: string; secret: string } {
  const colon = key.indexOf(':');
  if (colon <= 0 || colon === key.length - 1) throw new Error('Malformed Ably key');
  return { name: key.slice(0, colon), secret: key.slice(colon + 1) };
}

/** Base64url without padding, as JWTs use. */
const base64url = (data: string | Buffer) => Buffer.from(data).toString('base64url');

/**
 * An Ably JWT for one player on one channel: publish, subscribe and presence there only, with the
 * player's id bound as its `clientId`.
 *
 * @param nowMs - Issue time; `iat` and `exp` are whole seconds.
 */
export function signRoomToken(key: string, channel: string, self: PlayerId, nowMs: number): string {
  const { name, secret } = parseKey(key);
  const iat = Math.floor(nowMs / 1000);
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT', kid: name }));
  const payload = base64url(
    JSON.stringify({
      iat,
      exp: iat + TOKEN_TTL_MS / 1000,
      'x-ably-capability': JSON.stringify({ [channel]: ROOM_OPERATIONS }),
      'x-ably-clientId': self,
    }),
  );
  const signature = base64url(createHmac('sha256', secret).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${signature}`;
}

/**
 * Reads how many members are present on a channel from Ably's channel metadata.
 *
 * @throws If Ably doesn't answer in time or answers with an error or an unexpected shape.
 */
async function presenceMembers(
  key: string,
  channel: string,
  doFetch: typeof fetch,
): Promise<number> {
  const response = await doFetch(`${ABLY_REST_HOST}/channels/${encodeURIComponent(channel)}`, {
    headers: { authorization: `Basic ${Buffer.from(key).toString('base64')}` },
    signal: AbortSignal.timeout(ABLY_TIMEOUT_MS),
  });
  if (response.status === 404) return 0;
  if (!response.ok) throw new Error(`Ably channel metadata: HTTP ${response.status}`);
  const body: unknown = await response.json();
  const members = (body as { status?: { occupancy?: { metrics?: { presenceMembers?: unknown } } } })
    ?.status?.occupancy?.metrics?.presenceMembers;
  if (typeof members !== 'number') throw new Error('Ably channel metadata: unexpected shape');
  return members;
}

/** The {@link DirectoryBackend} for Ably. */
export function ablyBackend({
  key,
  fetch: doFetch = fetch,
  now = Date.now,
}: AblyBackendOptions): DirectoryBackend {
  parseKey(key);
  return {
    occupied: async (channel) => (await presenceMembers(key, channel, doFetch)) > 0,
    credential: async (channel, self): Promise<RoomCredential> => ({
      value: signRoomToken(key, channel, self, now()),
      expiresInMs: TOKEN_TTL_MS,
    }),
  };
}
