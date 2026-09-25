import { roomChannel } from '@cranny/multiplayer';
import { FakeDirectory } from '@cranny/multiplayer/testing';
import { describe, expect, it } from 'vitest';
import { handleRequest, MAX_BODY_BYTES } from './api.ts';

const SELF = 'a'.repeat(22);

/** A directory where only `room:busy` has anyone in it. */
function setup() {
  const directory = new FakeDirectory({ occupied: (channel) => channel === roomChannel('busy') });
  return { directory };
}

const body = (room: unknown, self: unknown = SELF) => JSON.stringify({ room, self });

describe('handleRequest', () => {
  it('returns a ticket for create, join and rejoin', async () => {
    const { directory } = setup();
    for (const [action, room] of [
      ['create', 'quiet'],
      ['join', 'busy'],
      ['rejoin', 'quiet'],
    ] as const) {
      const response = await handleRequest(action, body(room), directory);
      expect(response).toMatchObject({ status: 200, body: { room, channel: roomChannel(room) } });
    }
  });

  it('returns just the credential for refresh', async () => {
    const { directory } = setup();
    const response = await handleRequest('refresh', body('busy'), directory);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      expiresInMs: 3_600_000,
      value: { channel: roomChannel('busy'), self: SELF },
    });
  });

  it('answers directory errors with 200, and only unavailable with 503', async () => {
    const { directory } = setup();
    expect(await handleRequest('create', body('busy'), directory)).toEqual({
      status: 200,
      body: { error: 'taken' },
    });
    expect(await handleRequest('join', body('quiet'), directory)).toEqual({
      status: 200,
      body: { error: 'not-found' },
    });
    directory.available = false;
    expect(await handleRequest('join', body('busy'), directory)).toEqual({
      status: 503,
      body: { error: 'unavailable' },
    });
  });

  it('rejects anything but a small JSON body with a canonical room name and a player id', async () => {
    const { directory } = setup();
    const invalid = { status: 200, body: { error: 'invalid' } };
    for (const raw of [
      null,
      'not json',
      '[]',
      body('Not Canonical'),
      body('ok-room', 'short'),
      body('ok-room', 42),
      JSON.stringify({ room: 'ok-room', self: SELF, pad: 'x'.repeat(MAX_BODY_BYTES) }),
    ]) {
      expect(await handleRequest('create', raw, directory)).toEqual(invalid);
    }
  });
});
