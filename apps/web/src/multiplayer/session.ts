import {
  isDirectoryError,
  RoomClient,
  type Clock,
  type PlayerId,
  type RandomSource,
  type RoomTicket,
  type RoomView,
} from '@cranny/multiplayer';
import type { RoomAdapters } from '../net/adapters.ts';
import { claimSeat, forgetSeat, type SeatClaim, type SeatLocks } from './seat.ts';

// One tab's time in one room (specs/2026-09-25-multiplayer/SPEC.md §9, §10): claims the seat,
// gets a ticket, and runs a RoomClient until the tab leaves or the room screen goes away.

/** Why a room couldn't be joined before connecting. */
export type JoinFailure = 'not-found' | 'invalid' | 'unavailable';

/** What the room screen shows about the session. A new object after every change. */
export type SessionSnapshot =
  | { stage: 'joining' }
  | { stage: 'failed'; error: JoinFailure }
  | { stage: 'in-room'; self: PlayerId; view: RoomView };

/** A ticket the Multiplayer screen already has, so the room screen needn't ask again. */
type HandOff = { ticket: RoomTicket; self: PlayerId };

const handOffs = new Map<string, HandOff>();

/**
 * Passes a ticket from the Multiplayer screen to the room screen it is about to open. Kept in
 * memory only: a reload goes through the directory instead.
 */
export function handOff(ticket: RoomTicket, self: PlayerId): void {
  handOffs.set(ticket.room, { ticket, self });
}

/** Test and debugging seams; the defaults are for the browser. */
export type SessionOptions = {
  locks?: SeatLocks | null;
  random?: RandomSource;
  clock?: Clock;
};

/**
 * One tab's session in a room. `open` claims the seat, gets a ticket (handed off, or from the
 * directory) and starts a {@link RoomClient}; `close` disconnects but keeps the seat, and `leave`
 * gives it up.
 */
export class RoomSession {
  readonly room: string;
  private readonly adapters: RoomAdapters;
  private readonly name: string;
  private readonly options: SessionOptions;
  private listeners = new Set<() => void>();
  private current: SessionSnapshot = { stage: 'joining' };
  private claim: SeatClaim | null = null;
  private client: RoomClient | null = null;
  private stopWatching: (() => void) | null = null;
  private opened = false;
  private closed = false;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * @param room - The canonical room name.
   * @param name - The player's name, sent when taking a seat.
   */
  constructor(room: string, adapters: RoomAdapters, name: string, options: SessionOptions = {}) {
    this.room = room;
    this.adapters = adapters;
    this.name = name;
    this.options = options;
  }

  /** The latest snapshot, for `useSyncExternalStore`. */
  snapshot = (): SessionSnapshot => this.current;

  /** Calls `listener` after every change; returns the unsubscribe function. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** The room client once the session has one. */
  roomClient(): RoomClient | null {
    return this.client;
  }

  /**
   * Opens the session the first time a screen shows it, and cancels a {@link releaseSoon} that
   * hasn't happened yet (React's development double-mount unmounts and remounts at once).
   */
  retain(): void {
    if (this.closeTimer !== null) clearTimeout(this.closeTimer);
    this.closeTimer = null;
    if (!this.opened) void this.open();
  }

  /** Closes the session unless a screen retains it again straight away. */
  releaseSoon(): void {
    if (this.closeTimer !== null) return;
    this.closeTimer = setTimeout(() => {
      this.closeTimer = null;
      void this.close();
    }, 0);
  }

  /** Claims the seat, gets a ticket and connects. Only the first call does anything. */
  async open(): Promise<void> {
    if (this.opened || this.closed) return;
    this.opened = true;
    const { random, clock } = this.options;
    const claim = await claimSeat(this.room, this.options);
    if (this.closed) {
      claim.release();
      return;
    }
    this.claim = claim;
    const { self } = claim;
    let handed = handOffs.get(this.room);
    handOffs.delete(this.room);
    // A duplicated tab gets a new seat, so a ticket for the copied one is no use.
    if (handed?.self !== self) handed = undefined;
    let ticket = handed?.ticket;
    if (!ticket) {
      // A tab coming back to its own seat (a reload, or Try again) rejoins, which works even if
      // it was the last one there; anyone else needs someone in the room (SPEC §7).
      const { directory } = this.adapters;
      const joined = await (claim.returning
        ? directory.rejoin(this.room, self)
        : directory.join(this.room, self));
      if (this.closed) return;
      if (isDirectoryError(joined)) {
        this.set({ stage: 'failed', error: joined.error });
        return;
      }
      ticket = joined;
    }
    const client = new RoomClient({
      transport: this.adapters.transport,
      ticket,
      self,
      name: this.name,
      ...(clock && { clock }),
      ...(random && { random }),
    });
    this.client = client;
    this.stopWatching = client.subscribe((view) => this.set({ stage: 'in-room', self, view }));
    this.set({ stage: 'in-room', self, view: client.view() });
    await client.start();
  }

  /** Disconnects without leaving: the seat stays, shown as away, and this tab can come back. */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const client = this.client;
    await client?.close();
    this.finish();
  }

  /**
   * Leaves for good (SPEC §9 Leave confirmation): the client sends `leave` and waits for the
   * seat to go, then the tab forgets the seat and its board.
   */
  async leave(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.client?.leave();
    forgetSeat();
    this.finish();
  }

  /** Stops watching the client and lets another tab (or a reload) take the seat. */
  private finish(): void {
    this.stopWatching?.();
    this.stopWatching = null;
    this.claim?.release();
    this.claim = null;
  }

  /** Replaces the snapshot and tells subscribers. */
  private set(snapshot: SessionSnapshot): void {
    this.current = snapshot;
    for (const listener of [...this.listeners]) listener();
  }
}
