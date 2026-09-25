import { systemClock } from '../clock.ts';
import {
  StatelessDirectory,
  type CreateError,
  type JoinError,
  type RefreshError,
  type RejoinError,
  type RoomCredential,
  type RoomDirectory,
  type RoomTicket,
} from '../directory.ts';
import type { PlayerId } from '../protocol.ts';

export type FakeDirectoryOptions = {
  clock?: { now(): number };
  credentialTtlMs?: number;
  /**
   * Whether anyone is present on a channel, e.g. from `FakeTransport.presenceOf`. Defaults to
   * nobody, so `create` always succeeds and `join` always finds nothing.
   */
  occupied?: (channel: string) => boolean;
};

/** What a fake credential holds: the channel and player it's for, and when it expires. */
export type FakeCredentialValue = { channel: string; self: PlayerId; expiresAt: number };

/**
 * An in-memory {@link RoomDirectory} for tests (SPEC §7): the real rules from
 * {@link StatelessDirectory}, with presence from the test and credentials that expire on the
 * injected clock.
 */
export class FakeDirectory implements RoomDirectory {
  /** Set to false to make every call return `unavailable`. */
  available = true;
  private readonly directory: StatelessDirectory;

  /** @param options - Clock, credential lifetime (1 h) and presence (nobody). */
  constructor(options: FakeDirectoryOptions = {}) {
    const clock = options.clock ?? systemClock;
    const ttl = options.credentialTtlMs ?? 60 * 60_000;
    const occupied = options.occupied ?? (() => false);
    this.directory = new StatelessDirectory({
      occupied: async (channel) => {
        this.check();
        return occupied(channel);
      },
      credential: async (channel, self) => {
        this.check();
        const value: FakeCredentialValue = { channel, self, expiresAt: clock.now() + ttl };
        return { value, expiresInMs: ttl };
      },
    });
  }

  /** A ticket for a new room, unless someone is present in one with this name. */
  create(name: string, self: PlayerId): Promise<RoomTicket | CreateError> {
    return this.directory.create(name, self);
  }

  /** A ticket for a room someone is present in. */
  join(name: string, self: PlayerId): Promise<RoomTicket | JoinError> {
    return this.directory.join(name, self);
  }

  /** A ticket without checking presence. */
  rejoin(name: string, self: PlayerId): Promise<RoomTicket | RejoinError> {
    return this.directory.rejoin(name, self);
  }

  /** A fresh credential for the ticket's channel. */
  refreshCredential(ticket: RoomTicket, self: PlayerId): Promise<RoomCredential | RefreshError> {
    return this.directory.refreshCredential(ticket, self);
  }

  /** Throws while {@link available} is false, as an unreachable vendor would. */
  private check(): void {
    if (!this.available) throw new Error('Directory unavailable');
  }
}
