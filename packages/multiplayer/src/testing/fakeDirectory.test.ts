import { describe, expect, it } from 'vitest';
import { isDirectoryError, LEASE_MS, type RoomTicket } from '../directory.ts';
import { FakeDirectory, type FakeCredentialValue } from './fakeDirectory.ts';
import { seededRandom } from './random.ts';

/** A directory on a clock the test moves by hand. */
function setup() {
  const clock = { t: 0, now: () => clock.t };
  const directory = new FakeDirectory({
    clock,
    random: seededRandom(5),
    credentialTtlMs: 60 * 60_000,
  });
  return { clock, directory };
}

/** Unwraps a successful directory result. */
function ok<T extends object>(result: T): Exclude<T, { error: string }> {
  if (isDirectoryError(result)) throw new Error(`Unexpected ${result.error}`);
  return result as Exclude<T, { error: string }>;
}

describe('FakeDirectory', () => {
  it('creates a room on a random channel and lets others join it', async () => {
    const { directory } = setup();
    const created = ok(await directory.create('pizza', 'host'));
    const joined = ok(await directory.join('pizza', 'guest'));
    expect(joined.channel).toBe(created.channel);
    expect(joined.roomKey).toBe(created.roomKey);
    expect(created.channel).not.toContain('pizza');
    expect((joined.credential.value as FakeCredentialValue).self).toBe('guest');
  });

  it('refuses a name that is in use, missing or not canonical', async () => {
    const { directory } = setup();
    await directory.create('pizza', 'a');
    expect(await directory.create('pizza', 'b')).toEqual({ error: 'taken' });
    expect(await directory.join('pasta', 'b')).toEqual({ error: 'not-found' });
    expect(await directory.create('Pizza Party', 'b')).toEqual({ error: 'invalid' });
    expect(await directory.join('no', 'b')).toEqual({ error: 'invalid' });
  });

  it('reports unavailable for every call while down', async () => {
    const { directory } = setup();
    const ticket = ok(await directory.create('pizza', 'a'));
    directory.available = false;
    expect(await directory.create('pasta', 'a')).toEqual({ error: 'unavailable' });
    expect(await directory.join('pizza', 'a')).toEqual({ error: 'unavailable' });
    expect(await directory.keepAlive(ticket)).toBe('unavailable');
    expect(await directory.refreshCredential(ticket, 'a')).toEqual({ error: 'unavailable' });
  });

  it('frees a name once its lease runs out', async () => {
    const { clock, directory } = setup();
    const first = ok(await directory.create('pizza', 'a'));
    clock.t = LEASE_MS - 1;
    expect(await directory.join('pizza', 'b')).toMatchObject({ channel: first.channel });
    clock.t = LEASE_MS;
    expect(await directory.join('pizza', 'b')).toEqual({ error: 'not-found' });
    const second = ok(await directory.create('pizza', 'c'));
    expect(second.channel).not.toBe(first.channel);
  });

  it('extends the lease on keepAlive', async () => {
    const { clock, directory } = setup();
    const ticket = ok(await directory.create('pizza', 'a'));
    clock.t = 4 * 60_000;
    expect(await directory.keepAlive(ticket)).toBe('ok');
    expect(directory.leaseExpiresAt('pizza')).toBe(4 * 60_000 + LEASE_MS);
  });

  it('re-claims a lapsed name for the same channel if nobody took it', async () => {
    const { clock, directory } = setup();
    const ticket = ok(await directory.create('pizza', 'a'));
    clock.t = LEASE_MS + 60_000;
    expect(await directory.keepAlive(ticket)).toBe('ok');
    expect(ok(await directory.join('pizza', 'b')).channel).toBe(ticket.channel);
  });

  it('reports lost if another room took the name', async () => {
    const { clock, directory } = setup();
    const ticket = ok(await directory.create('pizza', 'a'));
    clock.t = LEASE_MS;
    ok(await directory.create('pizza', 'z'));
    expect(await directory.keepAlive(ticket)).toBe('lost');
  });

  it('rejects keepAlive and refreshCredential without the room key', async () => {
    const { directory } = setup();
    const ticket = ok(await directory.create('pizza', 'a'));
    const forged: RoomTicket = { ...ticket, roomKey: 'guess' };
    expect(await directory.keepAlive(forged)).toBe('lost');
    expect(await directory.refreshCredential(forged, 'a')).toEqual({ error: 'not-found' });
  });

  it('refreshes a credential without touching the lease', async () => {
    const { clock, directory } = setup();
    const ticket = ok(await directory.create('pizza', 'a'));
    clock.t = 58 * 60_000;
    const credential = ok(await directory.refreshCredential(ticket, 'a'));
    expect(credential.expiresInMs).toBe(60 * 60_000);
    expect(credential.value).toEqual({
      channel: ticket.channel,
      self: 'a',
      expiresAt: 118 * 60_000,
    });
    expect(directory.leaseExpiresAt('pizza')).toBeNull();
  });
});
