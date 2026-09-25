import { systemClock } from '../clock.ts';
import {
  LEASE_MS,
  type CreateError,
  type JoinError,
  type RefreshError,
  type RoomCredential,
  type RoomDirectory,
  type RoomTicket,
} from '../directory.ts';
import { isValidRoomName } from '../names.ts';
import type { PlayerId } from '../protocol.ts';
import { cryptoRandom, randomPlayerId, type RandomSource } from '../random.ts';

export type FakeDirectoryOptions = {
  clock?: { now(): number };
  random?: RandomSource;
  leaseMs?: number;
  credentialTtlMs?: number;
};

/** What a fake credential holds: the channel and player it's for, and when it expires. */
export type FakeCredentialValue = { channel: string; self: PlayerId; expiresAt: number };

type Lease = { channel: string; expiresAt: number };

/**
 * An in-memory {@link RoomDirectory} for tests (SPEC §7). Leases and credentials expire on the
 * injected clock and are kept apart: `keepAlive` extends the lease, `refreshCredential` never does.
 */
export class FakeDirectory implements RoomDirectory {
  /** Set to false to make every call return `unavailable`. */
  available = true;
  private readonly clock: { now(): number };
  private readonly random: RandomSource;
  private readonly leaseMs: number;
  private readonly credentialTtlMs: number;
  private readonly leases = new Map<string, Lease>();
  /** Every channel ever made, with its room key, so tickets can be checked after a lease lapses. */
  private readonly keys = new Map<string, string>();

  /** @param options - Clock, randomness, lease length (10 min) and credential lifetime (1 h). */
  constructor(options: FakeDirectoryOptions = {}) {
    this.clock = options.clock ?? systemClock;
    this.random = options.random ?? cryptoRandom;
    this.leaseMs = options.leaseMs ?? LEASE_MS;
    this.credentialTtlMs = options.credentialTtlMs ?? 60 * 60_000;
  }

  /** Claims a free name for a new room on a new random channel. */
  async create(name: string, self: PlayerId): Promise<RoomTicket | CreateError> {
    if (!this.available) return { error: 'unavailable' };
    if (!isValidRoomName(name)) return { error: 'invalid' };
    if (this.live(name)) return { error: 'taken' };
    const channel = `channel-${randomPlayerId(this.random)}`;
    const roomKey = randomPlayerId(this.random);
    this.keys.set(channel, roomKey);
    this.leases.set(name, { channel, expiresAt: this.clock.now() + this.leaseMs });
    return { room: name, channel, roomKey, credential: this.credential(channel, self) };
  }

  /** A ticket for a live room. */
  async join(name: string, self: PlayerId): Promise<RoomTicket | JoinError> {
    if (!this.available) return { error: 'unavailable' };
    if (!isValidRoomName(name)) return { error: 'invalid' };
    const lease = this.live(name);
    if (!lease) return { error: 'not-found' };
    const roomKey = this.keys.get(lease.channel)!;
    return {
      room: name,
      channel: lease.channel,
      roomKey,
      credential: this.credential(lease.channel, self),
    };
  }

  /** Extends the lease, re-claiming a lapsed name for the same channel if nobody took it. */
  async keepAlive(ticket: RoomTicket): Promise<'ok' | 'lost' | 'unavailable'> {
    if (!this.available) return 'unavailable';
    if (this.keys.get(ticket.channel) !== ticket.roomKey) return 'lost';
    const lease = this.live(ticket.room);
    if (lease && lease.channel !== ticket.channel) return 'lost';
    this.leases.set(ticket.room, {
      channel: ticket.channel,
      expiresAt: this.clock.now() + this.leaseMs,
    });
    return 'ok';
  }

  /** A new credential for the same channel. Leaves the lease alone. */
  async refreshCredential(
    ticket: RoomTicket,
    self: PlayerId,
  ): Promise<RoomCredential | RefreshError> {
    if (!this.available) return { error: 'unavailable' };
    if (this.keys.get(ticket.channel) !== ticket.roomKey) return { error: 'not-found' };
    return this.credential(ticket.channel, self);
  }

  /** When a room's lease runs out, or null if it has none that's live. For tests. */
  leaseExpiresAt(name: string): number | null {
    return this.live(name)?.expiresAt ?? null;
  }

  /** The room's lease if it hasn't expired. */
  private live(name: string): Lease | null {
    const lease = this.leases.get(name);
    return lease && lease.expiresAt > this.clock.now() ? lease : null;
  }

  /** A credential for one player on one channel. */
  private credential(channel: string, self: PlayerId): RoomCredential {
    const value: FakeCredentialValue = {
      channel,
      self,
      expiresAt: this.clock.now() + this.credentialTtlMs,
    };
    return { value, expiresInMs: this.credentialTtlMs };
  }
}
