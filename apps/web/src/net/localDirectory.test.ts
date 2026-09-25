import {
  isDirectoryError,
  LEASE_MS,
  type CreateError,
  type JoinError,
  type RefreshError,
  type RoomTicket,
} from '@cranny/multiplayer';
import { seededRandom } from '@cranny/multiplayer/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LOCAL_ROOMS_KEY } from '../storage/storage.ts';
import { isLocalCredentialFor, LocalDirectory, ROOM_KEY_RETENTION_MS } from './localDirectory.ts';

const A = 'a'.repeat(22);
const B = 'b'.repeat(22);

/** The value of a successful directory call, failing the test on an error. */
function ok<T extends object>(result: T): Exclude<T, CreateError | JoinError | RefreshError> {
  if (isDirectoryError(result)) throw new Error(`Unexpected ${result.error}`);
  return result as Exclude<T, CreateError | JoinError | RefreshError>;
}

describe('LocalDirectory', () => {
  let now: number;
  /** A directory as one tab would have it; several share local storage like tabs do. */
  const tab = () =>
    new LocalDirectory({ clock: { now: () => now }, random: seededRandom(Math.random() * 1e9) });

  beforeEach(() => {
    now = 1_000_000;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a room that other tabs can join, on the same channel with the same key', async () => {
    const created = ok(await tab().create('otter-bramble', A));
    const joined = ok(await tab().join('otter-bramble', B));
    expect(joined.room).toBe('otter-bramble');
    expect(joined.channel).toBe(created.channel);
    expect(joined.roomKey).toBe(created.roomKey);
    expect(created.channel).not.toContain('otter');
  });

  it('gives each player a credential for their own id on that channel only', async () => {
    const created = ok(await tab().create('otter-bramble', A));
    const joined = ok(await tab().join('otter-bramble', B));
    expect(isLocalCredentialFor(created.credential.value, created.channel, A)).toBe(true);
    expect(isLocalCredentialFor(joined.credential.value, joined.channel, B)).toBe(true);
    expect(isLocalCredentialFor(joined.credential.value, joined.channel, A)).toBe(false);
    expect(isLocalCredentialFor(joined.credential.value, 'local-other', B)).toBe(false);
  });

  it('refuses a name that is live, and frees it when the lease runs out', async () => {
    const first = ok(await tab().create('otter-bramble', A));
    expect(await tab().create('otter-bramble', B)).toEqual({ error: 'taken' });
    now += LEASE_MS - 1;
    expect(await tab().create('otter-bramble', B)).toEqual({ error: 'taken' });
    now += 1;
    expect(await tab().join('otter-bramble', B)).toEqual({ error: 'not-found' });
    const second = ok(await tab().create('otter-bramble', B));
    expect(second.channel).not.toBe(first.channel);
  });

  it('rejects names that aren’t canonical', async () => {
    expect(await tab().create('Otter Bramble', A)).toEqual({ error: 'invalid' });
    expect(await tab().join('ab', A)).toEqual({ error: 'invalid' });
  });

  it('says a room that was never made is not found', async () => {
    expect(await tab().join('nobody-here', A)).toEqual({ error: 'not-found' });
  });

  describe('keepAlive', () => {
    let ticket: RoomTicket;

    beforeEach(async () => {
      ticket = ok(await tab().create('otter-bramble', A));
    });

    it('pushes the lease to a full LEASE_MS from now', async () => {
      now += LEASE_MS - 1_000;
      expect(await tab().keepAlive(ticket)).toBe('ok');
      now += LEASE_MS - 1;
      expect(ok(await tab().join('otter-bramble', B)).channel).toBe(ticket.channel);
      now += 1;
      expect(await tab().join('otter-bramble', B)).toEqual({ error: 'not-found' });
    });

    it('re-claims a lapsed name for the same channel if nobody took it', async () => {
      now += LEASE_MS + 60_000;
      expect(await tab().keepAlive(ticket)).toBe('ok');
      expect(ok(await tab().join('otter-bramble', B)).channel).toBe(ticket.channel);
    });

    it('is lost once another room has the name', async () => {
      now += LEASE_MS;
      ok(await tab().create('otter-bramble', B));
      expect(await tab().keepAlive(ticket)).toBe('lost');
    });

    it('is lost with the wrong room key', async () => {
      expect(await tab().keepAlive({ ...ticket, roomKey: 'guessed' })).toBe('lost');
    });

    it('is lost once the room key has been pruned', async () => {
      now += LEASE_MS + ROOM_KEY_RETENTION_MS;
      expect(await tab().keepAlive(ticket)).toBe('lost');
    });
  });

  describe('refreshCredential', () => {
    it('gives a new credential without extending the lease', async () => {
      const ticket = ok(await tab().create('otter-bramble', A));
      now += LEASE_MS - 1;
      const fresh = ok(await tab().refreshCredential(ticket, A));
      expect(isLocalCredentialFor(fresh.value, ticket.channel, A)).toBe(true);
      now += 1;
      expect(await tab().join('otter-bramble', B)).toEqual({ error: 'not-found' });
    });

    it('still works after the lease lapses, for players already in the room', async () => {
      const ticket = ok(await tab().create('otter-bramble', A));
      now += LEASE_MS + 60_000;
      expect(isDirectoryError(await tab().refreshCredential(ticket, A))).toBe(false);
    });

    it('is not found with the wrong room key', async () => {
      const ticket = ok(await tab().create('otter-bramble', A));
      expect(await tab().refreshCredential({ ...ticket, roomKey: 'guessed' }, A)).toEqual({
        error: 'not-found',
      });
    });
  });

  it('prunes expired entries when it saves', async () => {
    ok(await tab().create('old-room', A));
    now += LEASE_MS + ROOM_KEY_RETENTION_MS;
    const fresh = ok(await tab().create('new-room', A));
    const stored = JSON.parse(localStorage.getItem(LOCAL_ROOMS_KEY)!);
    expect(Object.keys(stored.leases)).toEqual(['new-room']);
    expect(Object.keys(stored.keys)).toEqual([fresh.channel]);
  });

  it('is unavailable when local storage can’t be written', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(await tab().create('otter-bramble', A)).toEqual({ error: 'unavailable' });
  });

  it('does every read and write under its lock', async () => {
    let held = false;
    const calls: boolean[] = [];
    const directory = new LocalDirectory({
      clock: { now: () => now },
      withLock: async (task) => {
        held = true;
        try {
          return task();
        } finally {
          held = false;
        }
      },
    });
    const getItem = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key) {
      calls.push(held);
      return getItem.call(this, key);
    });
    const ticket = ok(await directory.create('otter-bramble', A));
    await directory.join('otter-bramble', B);
    await directory.keepAlive(ticket);
    await directory.refreshCredential(ticket, B);
    expect(calls).toHaveLength(4);
    expect(calls.every(Boolean)).toBe(true);
  });
});
