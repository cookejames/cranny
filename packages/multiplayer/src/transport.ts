import type { RoomTicket } from './directory.ts';
import type { PlayerId } from './protocol.ts';

/** Stops a subscription. */
export type Unsubscribe = () => void;

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'closed';

/**
 * A realtime vendor behind a neutral interface (SPEC §6). Adapters live in the app
 * (`apps/web/src/net/`) and must pass `describeTransportConformance`.
 */
export interface RoomTransport {
  /**
   * Joins the ticket's channel as `self`. Resolves once connected and in presence, with
   * `presence()` already listing everyone else there.
   */
  connect(ticket: RoomTicket, self: PlayerId): Promise<RoomConnection>;
}

/**
 * One player's connection to one room's channel. Messages from one sender arrive in the order
 * sent; nothing else about ordering or delivery is promised (at most once, SPEC §6.1).
 */
export interface RoomConnection {
  /** Sends to everyone in the room, including this connection. Rejects if not connected. */
  publish(message: unknown): Promise<void>;
  /** `from` is the identity the transport authenticated, not a field the sender wrote. */
  onMessage(callback: (message: unknown, from: PlayerId) => void): Unsubscribe;
  /**
   * Who is connected now, including this player. A member who drops abruptly is gone within
   * 30 s, one who closes cleanly at once (SPEC §6.2).
   */
  presence(): PlayerId[];
  onPresence(callback: (present: PlayerId[]) => void): Unsubscribe;
  status(): ConnectionStatus;
  onStatus(callback: (status: ConnectionStatus) => void): Unsubscribe;
  /** Leaves the channel cleanly. */
  close(): Promise<void>;
}
