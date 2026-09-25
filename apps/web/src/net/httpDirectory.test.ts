import type { RoomTicket } from '@cranny/multiplayer';
import { describe, expect, it, vi } from 'vitest';
import { HttpDirectory } from './httpDirectory.ts';

const SELF = 'a'.repeat(22);
const credential = { value: 'header.payload.signature', expiresInMs: 3_600_000 };
const ticket: RoomTicket = { room: 'pizza', channel: 'room:pizza', credential };

/** A directory whose API always answers `body` with `status`, recording the requests. */
function answering(status: number, body: unknown) {
  const doFetch = vi.fn<typeof fetch>(async () => Response.json(body, { status }));
  return { directory: new HttpDirectory({ fetch: doFetch }), doFetch };
}

describe('HttpDirectory', () => {
  it('posts the room and player to the route, and returns the ticket', async () => {
    const { directory, doFetch } = answering(200, ticket);
    expect(await directory.create('pizza', SELF)).toEqual(ticket);
    const [url, init] = doFetch.mock.calls[0]!;
    expect(url).toBe('/api/rooms/create');
    expect(init).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ room: 'pizza', self: SELF }),
    });
  });

  it('uses the refresh route for a credential', async () => {
    const { directory, doFetch } = answering(200, credential);
    expect(await directory.refreshCredential(ticket, SELF)).toEqual(credential);
    expect(doFetch.mock.calls[0]![0]).toBe('/api/rooms/refresh');
  });

  it('passes on the errors each call can have', async () => {
    expect(await answering(409, { error: 'taken' }).directory.create('pizza', SELF)).toEqual({
      error: 'taken',
    });
    expect(await answering(404, { error: 'not-found' }).directory.join('pizza', SELF)).toEqual({
      error: 'not-found',
    });
    expect(await answering(400, { error: 'invalid' }).directory.rejoin('pizza', SELF)).toEqual({
      error: 'invalid',
    });
  });

  it('treats anything unexpected as unavailable', async () => {
    const unavailable = { error: 'unavailable' };
    // An error the call can't have, a ticket for another room, a malformed credential.
    expect(await answering(409, { error: 'taken' }).directory.join('pizza', SELF)).toEqual(
      unavailable,
    );
    expect(
      await answering(200, { ...ticket, room: 'pasta' }).directory.join('pizza', SELF),
    ).toEqual(unavailable);
    expect(
      await answering(200, { ...ticket, credential: { value: 1, expiresInMs: 5 } }).directory.join(
        'pizza',
        SELF,
      ),
    ).toEqual(unavailable);
    expect(await answering(200, { value: 'x' }).directory.refreshCredential(ticket, SELF)).toEqual(
      unavailable,
    );
    // A network failure, and a body that isn't JSON (e.g. a CloudFront error page).
    const offline = new HttpDirectory({
      fetch: vi.fn().mockRejectedValue(new TypeError('offline')),
    });
    expect(await offline.create('pizza', SELF)).toEqual(unavailable);
    const html = new HttpDirectory({
      fetch: vi.fn(async () => new Response('<html>502</html>', { status: 502 })),
    });
    expect(await html.join('pizza', SELF)).toEqual(unavailable);
  });
});
