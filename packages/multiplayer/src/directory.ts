import { isValidRoomName } from './names.ts';
import type { PlayerId } from './protocol.ts';

/** A transport credential for one player on one channel. */
export type RoomCredential = {
  /** Adapter-specific, e.g. an Ably token; scoped to the ticket's channel only. */
  value: unknown;
  /** Set by the vendor or directory. */
  expiresInMs: number;
};

/** What a player needs to connect to a room (SPEC §7). */
export type RoomTicket = {
  /** Canonical room name. */
  room: string;
  /** Transport channel, derived from the name by the directory; opaque to clients. */
  channel: string;
  credential: RoomCredential;
};

export type CreateError = { error: 'taken' | 'invalid' | 'unavailable' };
export type JoinError = { error: 'not-found' | 'invalid' | 'unavailable' };
export type RejoinError = { error: 'invalid' | 'unavailable' };
export type RefreshError = { error: 'unavailable' };

/**
 * Hands out credentials for one room (SPEC §7). Stateless: a room's channel comes from its name,
 * and whether it is live comes from transport presence, so `create` and `join` are best effort.
 */
export interface RoomDirectory {
  /** A ticket for a new room: `taken` if anyone is present in a room with this name. */
  create(name: string, self: PlayerId): Promise<RoomTicket | CreateError>;
  /** A ticket for a room someone is present in: `not-found` if nobody is. */
  join(name: string, self: PlayerId): Promise<RoomTicket | JoinError>;
  /** A ticket for a tab that already has a seat in this room, with no check that anyone is there. */
  rejoin(name: string, self: PlayerId): Promise<RoomTicket | RejoinError>;
  /** A fresh credential for the same player on the same channel. */
  refreshCredential(ticket: RoomTicket, self: PlayerId): Promise<RoomCredential | RefreshError>;
}

/** Whether a directory result is an error. */
export const isDirectoryError = (
  result: object,
): result is CreateError | JoinError | RejoinError | RefreshError => 'error' in result;

/** The transport channel for a canonical room name (SPEC §7). */
export const roomChannel = (name: string): string => `room:${name}`;

/** What a {@link StatelessDirectory} needs from its vendor. Either may throw if it's unreachable. */
export type DirectoryBackend = {
  /** Whether at least one member is present on the channel. May lag by a few seconds. */
  occupied(channel: string): Promise<boolean>;
  /** A credential for one player on one channel. */
  credential(channel: string, self: PlayerId): Promise<RoomCredential>;
};

/**
 * The {@link RoomDirectory} rules on top of a vendor's presence and credentials (SPEC §7): the
 * name must be valid, `create` needs the room empty and `join` needs someone in it. A backend
 * that throws makes the call `unavailable`.
 */
export class StatelessDirectory implements RoomDirectory {
  /** @param backend - Presence and credentials for channels. */
  constructor(private readonly backend: DirectoryBackend) {}

  /** A ticket for a new room, unless someone is present in one with this name. */
  create(name: string, self: PlayerId): Promise<RoomTicket | CreateError> {
    return this.ticket(name, self, (occupied) => (occupied ? 'taken' : null));
  }

  /** A ticket for a room someone is present in. */
  join(name: string, self: PlayerId): Promise<RoomTicket | JoinError> {
    return this.ticket(name, self, (occupied) => (occupied ? null : 'not-found'));
  }

  /** A ticket without checking presence. */
  rejoin(name: string, self: PlayerId): Promise<RoomTicket | RejoinError> {
    return this.ticket(name, self, null);
  }

  /** A fresh credential for the ticket's channel. */
  async refreshCredential(
    ticket: RoomTicket,
    self: PlayerId,
  ): Promise<RoomCredential | RefreshError> {
    try {
      return await this.backend.credential(ticket.channel, self);
    } catch {
      return { error: 'unavailable' };
    }
  }

  /**
   * Validates the name, runs the presence check if there is one, and issues a ticket.
   *
   * @param check - Maps whether the room is occupied to an error, or null to go ahead; null to
   *   skip the presence check.
   */
  private async ticket<E extends string>(
    name: string,
    self: PlayerId,
    check: ((occupied: boolean) => E | null) | null,
  ): Promise<RoomTicket | { error: E | 'invalid' | 'unavailable' }> {
    if (!isValidRoomName(name)) return { error: 'invalid' };
    const channel = roomChannel(name);
    try {
      const error = check && check(await this.backend.occupied(channel));
      if (error) return { error };
      return { room: name, channel, credential: await this.backend.credential(channel, self) };
    } catch {
      return { error: 'unavailable' };
    }
  }
}
