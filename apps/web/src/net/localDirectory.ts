import {
  cryptoRandom,
  isValidRoomName,
  LEASE_MS,
  randomPlayerId,
  systemClock,
  type CreateError,
  type JoinError,
  type PlayerId,
  type RandomSource,
  type RefreshError,
  type RoomCredential,
  type RoomDirectory,
  type RoomTicket,
} from '@cranny/multiplayer';
import { loadLocalRooms, saveLocalRooms, type LocalRooms } from '../storage/storage.ts';

// A development-only room directory (specs/2026-09-25-multiplayer/SPEC.md §7). Leases live in
// local storage, so every tab of the browser shares them, as a server would for every device.

/** How long a local credential lasts, matching Ably's default token lifetime. */
export const LOCAL_CREDENTIAL_TTL_MS = 60 * 60_000;
/** How long a channel's room key is kept after its lease, so a late keep-alive can re-claim it. */
export const ROOM_KEY_RETENTION_MS = 24 * 60 * 60_000;

/** What a local credential holds: the one channel and player it's good for. */
export type LocalCredential = { channel: string; self: PlayerId; expiresAt: number };

/** Whether a credential value is a local credential for this channel and player. */
export function isLocalCredentialFor(value: unknown, channel: string, self: PlayerId): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Partial<LocalCredential>;
  return c.channel === channel && c.self === self;
}

/** Runs `task` while holding the directory's lock, so tabs don't claim a name at the same time. */
export type WithLock = <T>(task: () => T) => Promise<T>;

export type LocalDirectoryOptions = {
  clock?: { now(): number };
  random?: RandomSource;
  /** Defaults to a Web Lock where the browser has them, otherwise no locking. */
  withLock?: WithLock;
  leaseMs?: number;
};

/** A Web Lock around `task`, or none if the browser doesn't support them. */
function defaultWithLock(): WithLock {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  if (!locks) return async (task) => task();
  return (task) => locks.request('cranny-local-directory', task);
}

/**
 * {@link RoomDirectory} kept in local storage for `VITE_ROOM_TRANSPORT=local`. It behaves like the
 * real directory (leases, `taken`, `not-found`, re-claiming a lapsed name, room keys), but nothing
 * is secret: any tab can read the storage.
 */
export class LocalDirectory implements RoomDirectory {
  private readonly clock: { now(): number };
  private readonly random: RandomSource;
  private readonly withLock: WithLock;
  private readonly leaseMs: number;

  /** @param options - Test seams; the defaults are for the browser. */
  constructor(options: LocalDirectoryOptions = {}) {
    this.clock = options.clock ?? systemClock;
    this.random = options.random ?? cryptoRandom;
    this.withLock = options.withLock ?? defaultWithLock();
    this.leaseMs = options.leaseMs ?? LEASE_MS;
  }

  /** Claims a free name for a new room on a new random channel. */
  async create(name: string, self: PlayerId): Promise<RoomTicket | CreateError> {
    if (!isValidRoomName(name)) return { error: 'invalid' };
    return this.update((rooms, now) => {
      if (rooms.leases[name]) return { error: 'taken' };
      const channel = `local-${randomPlayerId(this.random)}`;
      const roomKey = randomPlayerId(this.random);
      this.claim(rooms, name, channel, roomKey, now);
      return { room: name, channel, roomKey, credential: this.credential(channel, self, now) };
    });
  }

  /** A ticket for a room whose lease is live. */
  async join(name: string, self: PlayerId): Promise<RoomTicket | JoinError> {
    if (!isValidRoomName(name)) return { error: 'invalid' };
    return this.read((rooms, now) => {
      const lease = rooms.leases[name];
      const key = lease && rooms.keys[lease.channel];
      if (!lease || !key) return { error: 'not-found' };
      const { channel } = lease;
      return {
        room: name,
        channel,
        roomKey: key.roomKey,
        credential: this.credential(channel, self, now),
      };
    });
  }

  /** Extends the lease, re-claiming a lapsed name for the same channel if nobody took it. */
  async keepAlive(ticket: RoomTicket): Promise<'ok' | 'lost' | 'unavailable'> {
    const result = await this.update((rooms, now) => {
      if (rooms.keys[ticket.channel]?.roomKey !== ticket.roomKey) return 'lost' as const;
      const lease = rooms.leases[ticket.room];
      if (lease && lease.channel !== ticket.channel) return 'lost' as const;
      this.claim(rooms, ticket.room, ticket.channel, ticket.roomKey, now);
      return 'ok' as const;
    });
    return typeof result === 'string' ? result : result.error;
  }

  /** A new credential for the same channel. Leaves the lease alone. */
  async refreshCredential(
    ticket: RoomTicket,
    self: PlayerId,
  ): Promise<RoomCredential | RefreshError> {
    return this.read((rooms, now) =>
      rooms.keys[ticket.channel]?.roomKey === ticket.roomKey
        ? this.credential(ticket.channel, self, now)
        : { error: 'not-found' },
    );
  }

  /** Runs `task` on the live rooms under the lock, without saving. */
  private read<T>(task: (rooms: LocalRooms, now: number) => T): Promise<T> {
    return this.withLock(() => {
      const now = this.clock.now();
      return task(prune(loadLocalRooms(), now), now);
    });
  }

  /**
   * Runs `task` on the live rooms under the lock and saves what it leaves, or returns
   * `unavailable` if local storage can't be written (e.g. it's blocked).
   */
  private update<T>(
    task: (rooms: LocalRooms, now: number) => T,
  ): Promise<T | { error: 'unavailable' }> {
    return this.withLock(() => {
      const now = this.clock.now();
      const rooms = prune(loadLocalRooms(), now);
      const result = task(rooms, now);
      return saveLocalRooms(rooms) ? result : { error: 'unavailable' as const };
    });
  }

  /** Gives `name` to `channel` for a full lease, and keeps the room key a while past it. */
  private claim(
    rooms: LocalRooms,
    name: string,
    channel: string,
    roomKey: string,
    now: number,
  ): void {
    const expiresAt = now + this.leaseMs;
    rooms.leases[name] = { channel, expiresAt };
    rooms.keys[channel] = { roomKey, keepUntil: expiresAt + ROOM_KEY_RETENTION_MS };
  }

  /** A credential for one player on one channel. */
  private credential(channel: string, self: PlayerId, now: number): RoomCredential {
    const value: LocalCredential = { channel, self, expiresAt: now + LOCAL_CREDENTIAL_TTL_MS };
    return { value, expiresInMs: LOCAL_CREDENTIAL_TTL_MS };
  }
}

/** Removes expired leases and room keys past their retention, in place. */
function prune(rooms: LocalRooms, now: number): LocalRooms {
  for (const [name, lease] of Object.entries(rooms.leases)) {
    if (lease.expiresAt <= now) delete rooms.leases[name];
  }
  for (const [channel, key] of Object.entries(rooms.keys)) {
    if (key.keepUntil <= now) delete rooms.keys[channel];
  }
  return rooms;
}
