import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { ABLY_REST_HOST, ablyBackend, parseKey, signRoomToken, TOKEN_TTL_MS } from './ably.ts';

const KEY = 'appId.keyId:s3cret';
const SELF = 'a'.repeat(22);

/** The header and payload of a JWT, after checking its HS256 signature against the key. */
function verify(token: string) {
  const [header, payload, signature] = token.split('.') as [string, string, string];
  const expected = createHmac('sha256', 's3cret')
    .update(`${header}.${payload}`)
    .digest('base64url');
  expect(signature).toBe(expected);
  const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
  return { header: decode(header), payload: decode(payload) };
}

/** A fetch that answers every request with `body` and `status`, recording what was asked. */
function fakeFetch(status: number, body: unknown) {
  return vi.fn<typeof fetch>(async () => Response.json(body, { status }));
}

const metadata = (presenceMembers: number) => ({
  channelId: 'room:pizza',
  status: { isActive: true, occupancy: { metrics: { connections: 1, presenceMembers } } },
});

describe('signRoomToken', () => {
  it('signs a one-hour token for one channel and one player, with the key name as kid', () => {
    const token = signRoomToken(KEY, 'room:pizza', SELF, 1_700_000_000_500);
    const { header, payload } = verify(token);
    expect(header).toEqual({ alg: 'HS256', typ: 'JWT', kid: 'appId.keyId' });
    expect(payload).toEqual({
      iat: 1_700_000_000,
      exp: 1_700_000_000 + TOKEN_TTL_MS / 1000,
      'x-ably-capability': JSON.stringify({ 'room:pizza': ['publish', 'subscribe', 'presence'] }),
      'x-ably-clientId': SELF,
    });
  });
});

describe('parseKey', () => {
  it('splits the key and rejects malformed ones', () => {
    expect(parseKey('app.key:a:b')).toEqual({ name: 'app.key', secret: 'a:b' });
    for (const bad of ['', 'nocolon', ':secret', 'name:']) expect(() => parseKey(bad)).toThrow();
  });
});

describe('ablyBackend', () => {
  it('reads presence members from the channel metadata, with the key as Basic auth', async () => {
    const doFetch = fakeFetch(200, metadata(2));
    const backend = ablyBackend({ key: KEY, fetch: doFetch });
    expect(await backend.occupied('room:pizza')).toBe(true);
    const [url, init] = doFetch.mock.calls[0]!;
    expect(url).toBe(`${ABLY_REST_HOST}/channels/room%3Apizza`);
    expect(new Headers(init!.headers).get('authorization')).toBe(
      `Basic ${Buffer.from(KEY).toString('base64')}`,
    );
  });

  it('counts a channel with no members, or none at all, as empty', async () => {
    expect(await ablyBackend({ key: KEY, fetch: fakeFetch(200, metadata(0)) }).occupied('c')).toBe(
      false,
    );
    expect(await ablyBackend({ key: KEY, fetch: fakeFetch(404, {}) }).occupied('c')).toBe(false);
  });

  it('throws on an Ably error or an unexpected answer, so the call is unavailable', async () => {
    await expect(
      ablyBackend({ key: KEY, fetch: fakeFetch(500, {}) }).occupied('c'),
    ).rejects.toThrow();
    await expect(
      ablyBackend({ key: KEY, fetch: fakeFetch(200, { status: {} }) }).occupied('c'),
    ).rejects.toThrow();
  });

  it('issues credentials without calling Ably', async () => {
    const doFetch = fakeFetch(200, {});
    const backend = ablyBackend({ key: KEY, fetch: doFetch, now: () => 1_000_000 });
    const credential = await backend.credential('room:pizza', SELF);
    expect(credential.expiresInMs).toBe(TOKEN_TTL_MS);
    expect(verify(credential.value as string).payload['x-ably-clientId']).toBe(SELF);
    expect(doFetch).not.toHaveBeenCalled();
  });
});
