import { describe, expect, it } from 'vitest';
import { isDirectoryError, roomChannel } from '../directory.ts';
import { FakeDirectory, type FakeCredentialValue } from './fakeDirectory.ts';

/** A directory on a clock the test moves by hand, with presence the test sets. */
function setup() {
  const clock = { t: 0, now: () => clock.t };
  const present = new Set<string>();
  const directory = new FakeDirectory({
    clock,
    credentialTtlMs: 60 * 60_000,
    occupied: (channel) => present.has(channel),
  });
  return { clock, present, directory };
}

/** Unwraps a successful directory result. */
function ok<T extends object>(result: T): Exclude<T, { error: string }> {
  if (isDirectoryError(result)) throw new Error(`Unexpected ${result.error}`);
  return result as Exclude<T, { error: string }>;
}

describe('FakeDirectory', () => {
  it('names the channel after the room, and gives each player their own credential', async () => {
    const { directory, present } = setup();
    const created = ok(await directory.create('pizza', 'host'));
    expect(created.channel).toBe(roomChannel('pizza'));
    present.add(created.channel);
    const joined = ok(await directory.join('pizza', 'guest'));
    expect(joined.channel).toBe(created.channel);
    expect((joined.credential.value as FakeCredentialValue).self).toBe('guest');
  });

  it('refuses to create an occupied room or join an empty one', async () => {
    const { directory, present } = setup();
    present.add(roomChannel('pizza'));
    expect(await directory.create('pizza', 'b')).toEqual({ error: 'taken' });
    expect(await directory.join('pasta', 'b')).toEqual({ error: 'not-found' });
  });

  it('frees a name as soon as its room is empty', async () => {
    const { directory, present } = setup();
    present.add(roomChannel('pizza'));
    present.clear();
    expect(isDirectoryError(await directory.create('pizza', 'c'))).toBe(false);
  });

  it('rejoins whether or not anyone is there', async () => {
    const { directory, present } = setup();
    expect(ok(await directory.rejoin('pizza', 'a')).channel).toBe(roomChannel('pizza'));
    present.add(roomChannel('pizza'));
    expect(ok(await directory.rejoin('pizza', 'a')).channel).toBe(roomChannel('pizza'));
  });

  it('rejects invalid names', async () => {
    const { directory } = setup();
    expect(await directory.create('Pizza Party', 'b')).toEqual({ error: 'invalid' });
    expect(await directory.join('no', 'b')).toEqual({ error: 'invalid' });
    expect(await directory.rejoin('no', 'b')).toEqual({ error: 'invalid' });
  });

  it('reports unavailable while switched off', async () => {
    const { directory } = setup();
    const ticket = ok(await directory.create('pizza', 'a'));
    directory.available = false;
    expect(await directory.create('pasta', 'a')).toEqual({ error: 'unavailable' });
    expect(await directory.join('pizza', 'a')).toEqual({ error: 'unavailable' });
    expect(await directory.rejoin('pizza', 'a')).toEqual({ error: 'unavailable' });
    expect(await directory.refreshCredential(ticket, 'a')).toEqual({ error: 'unavailable' });
  });

  it('refreshes a credential for the same channel and player', async () => {
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
  });
});
