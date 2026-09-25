import type { PlayerId } from './protocol.ts';

/** How long a room's name stays claimed after the last keep-alive (SPEC §7). */
export const LEASE_MS = 10 * 60_000;
/** How often the host renews the lease (SPEC §7). */
export const KEEP_ALIVE_INTERVAL_MS = 4 * 60_000;

/** A transport credential for one player on one channel. */
export type RoomCredential = {
  /** Adapter-specific, e.g. an Ably token; scoped to the ticket's channel only. */
  value: unknown;
  /** Set by the vendor or directory, independent of the lease. */
  expiresInMs: number;
};

/** What a player needs to connect to a room (SPEC §7). */
export type RoomTicket = {
  /** Canonical room name. */
  room: string;
  /** Opaque transport channel id: random, not derived from the name. */
  channel: string;
  /** Random per-room secret; proves membership for `keepAlive` and `refreshCredential`. */
  roomKey: string;
  credential: RoomCredential;
};

export type CreateError = { error: 'taken' | 'invalid' | 'unavailable' };
export type JoinError = { error: 'not-found' | 'invalid' | 'unavailable' };
export type RefreshError = { error: 'not-found' | 'unavailable' };

/**
 * Claims room names and hands out credentials for one room (SPEC §7). Room keep-alive (host only,
 * on a timer) and credential refresh (each client, near expiry) are separate jobs.
 */
export interface RoomDirectory {
  /** Claims a canonical name that has no live lease, for a new room. */
  create(name: string, self: PlayerId): Promise<RoomTicket | CreateError>;
  /** A ticket for a live room. */
  join(name: string, self: PlayerId): Promise<RoomTicket | JoinError>;
  /**
   * Host only: pushes the lease to `LEASE_MS` from now, re-claiming the name for the same channel
   * if it lapsed. `lost` if another room has taken the name.
   */
  keepAlive(ticket: RoomTicket): Promise<'ok' | 'lost' | 'unavailable'>;
  /** Any client: a fresh credential for its own seat on the same channel. Never extends the lease. */
  refreshCredential(ticket: RoomTicket, self: PlayerId): Promise<RoomCredential | RefreshError>;
}

/** Whether a directory result is an error. */
export const isDirectoryError = (
  result: object,
): result is CreateError | JoinError | RefreshError => 'error' in result;
