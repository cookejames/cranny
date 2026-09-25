import { systemClock, type Clock } from '../clock.ts';
import type { RoomTicket } from '../directory.ts';
import type { PlayerId } from '../protocol.ts';
import type { ConnectionStatus, RoomConnection, RoomTransport, Unsubscribe } from '../transport.ts';

export type FakeTransportOptions = {
  clock?: Clock;
  /** Delay before every delivery, in ms. Equal delays keep each sender's messages in order. */
  latencyMs?: number;
  /** How long after an abrupt drop the others see the member leave (within SPEC §6.2's 30 s). */
  dropDetectMs?: number;
};

/**
 * An in-memory transport for tests (SPEC §6): deterministic, with messages copied through JSON
 * as if sent over a network, and `drop`/`restore` to simulate lost signal.
 */
export class FakeTransport implements RoomTransport {
  readonly clock: Clock;
  readonly latencyMs: number;
  readonly dropDetectMs: number;
  private readonly channels = new Map<string, Set<FakeConnection>>();

  /** @param options - Clock, latency and drop detection; defaults are the system clock, 0 and 25 s. */
  constructor(options: FakeTransportOptions = {}) {
    this.clock = options.clock ?? systemClock;
    this.latencyMs = options.latencyMs ?? 0;
    this.dropDetectMs = options.dropDetectMs ?? 25_000;
  }

  /** Joins a channel at once. */
  async connect(ticket: RoomTicket, self: PlayerId): Promise<FakeConnection> {
    const members = this.channels.get(ticket.channel) ?? new Set();
    this.channels.set(ticket.channel, members);
    const connection = new FakeConnection(this, ticket.channel, self);
    members.add(connection);
    connection.seen = this.presenceOf(ticket.channel);
    this.presenceChanged(ticket.channel);
    return connection;
  }

  /**
   * Cuts a connection as a lost signal would: it goes `reconnecting` and stops sending and
   * receiving, and the others see it leave after `dropDetectMs` unless it is restored first.
   */
  drop(connection: RoomConnection): void {
    const c = this.own(connection);
    if (c.state !== 'connected') return;
    c.setStatus('reconnecting');
    c.dropTimer = this.clock.setTimeout(() => {
      c.dropTimer = undefined;
      c.inPresence = false;
      this.presenceChanged(c.channel);
    }, this.dropDetectMs);
  }

  /** Brings a dropped connection back: connected, in presence, and told who is there now. */
  restore(connection: RoomConnection): void {
    const c = this.own(connection);
    if (c.state !== 'reconnecting') return;
    if (c.dropTimer !== undefined) this.clock.clearTimeout(c.dropTimer);
    c.dropTimer = undefined;
    c.setStatus('connected');
    const rejoined = !c.inPresence;
    c.inPresence = true;
    if (rejoined) this.presenceChanged(c.channel);
    else this.deliverPresence(c);
  }

  /** Every open connection, for tests that need to reach into the network. */
  connections(): FakeConnection[] {
    return [...this.channels.values()].flatMap((set) => [...set]);
  }

  /** Fans a message out to every connected member of the channel, including the sender. */
  send(from: FakeConnection, message: unknown): void {
    const copy = JSON.stringify(message);
    for (const to of this.channels.get(from.channel) ?? []) {
      if (to.state !== 'connected') continue;
      this.later(() => {
        if (to.state === 'connected') to.receive(JSON.parse(copy), from.self);
      });
    }
  }

  /** Removes a connection that closed cleanly; the others see it leave at once. */
  remove(connection: FakeConnection): void {
    if (connection.dropTimer !== undefined) this.clock.clearTimeout(connection.dropTimer);
    this.channels.get(connection.channel)?.delete(connection);
    this.presenceChanged(connection.channel);
  }

  /** Who is in a channel's presence: each player once, however many connections they have. */
  presenceOf(channel: string): PlayerId[] {
    const ids = [...(this.channels.get(channel) ?? [])].filter((c) => c.inPresence);
    return [...new Set(ids.map((c) => c.self))];
  }

  /** Tells every connected member of a channel who is present now. */
  private presenceChanged(channel: string): void {
    for (const c of this.channels.get(channel) ?? []) this.deliverPresence(c);
  }

  /** Updates one connection's view of presence, after the usual latency. */
  private deliverPresence(c: FakeConnection): void {
    if (c.state !== 'connected') return;
    this.later(() => {
      if (c.state !== 'connected') return;
      const now = this.presenceOf(c.channel);
      if (now.join() === c.seen.join()) return;
      c.seen = now;
      c.emitPresence(now);
    });
  }

  /** Runs a delivery after the configured latency. */
  private later(callback: () => void): void {
    this.clock.setTimeout(callback, this.latencyMs);
  }

  /** The fake connection behind an interface value. */
  private own(connection: RoomConnection): FakeConnection {
    if (!(connection instanceof FakeConnection) || connection.transport !== this) {
      throw new Error('Not a connection of this FakeTransport');
    }
    return connection;
  }
}

/** One member's connection to a {@link FakeTransport} channel. */
export class FakeConnection implements RoomConnection {
  state: ConnectionStatus = 'connected';
  inPresence = true;
  /** Presence as this connection has been told it. */
  seen: PlayerId[] = [];
  dropTimer: unknown;
  private readonly messageListeners = new Set<(message: unknown, from: PlayerId) => void>();
  private readonly presenceListeners = new Set<(present: PlayerId[]) => void>();
  private readonly statusListeners = new Set<(status: ConnectionStatus) => void>();

  /**
   * @param transport - The network it belongs to.
   * @param channel - The ticket's channel id.
   * @param self - The authenticated player id.
   */
  constructor(
    readonly transport: FakeTransport,
    readonly channel: string,
    readonly self: PlayerId,
  ) {}

  /** Fans out to the channel; rejects unless connected. */
  async publish(message: unknown): Promise<void> {
    if (this.state !== 'connected') throw new Error(`Can't publish while ${this.state}`);
    this.transport.send(this, message);
  }

  /** Subscribes to messages. */
  onMessage(callback: (message: unknown, from: PlayerId) => void): Unsubscribe {
    this.messageListeners.add(callback);
    return () => this.messageListeners.delete(callback);
  }

  /** Who this connection has been told is present. */
  presence(): PlayerId[] {
    return [...this.seen];
  }

  /** Subscribes to presence changes. */
  onPresence(callback: (present: PlayerId[]) => void): Unsubscribe {
    this.presenceListeners.add(callback);
    return () => this.presenceListeners.delete(callback);
  }

  /** The connection status. */
  status(): ConnectionStatus {
    return this.state;
  }

  /** Subscribes to status changes. */
  onStatus(callback: (status: ConnectionStatus) => void): Unsubscribe {
    this.statusListeners.add(callback);
    return () => this.statusListeners.delete(callback);
  }

  /** Leaves at once; the others see it go. */
  async close(): Promise<void> {
    if (this.state === 'closed') return;
    this.setStatus('closed');
    this.inPresence = false;
    this.transport.remove(this);
  }

  /** Delivers an incoming message to listeners. */
  receive(message: unknown, from: PlayerId): void {
    for (const listener of [...this.messageListeners]) listener(message, from);
  }

  /** Tells listeners who is present. */
  emitPresence(present: PlayerId[]): void {
    for (const listener of [...this.presenceListeners]) listener([...present]);
  }

  /** Changes the status and tells listeners. */
  setStatus(status: ConnectionStatus): void {
    if (this.state === status) return;
    this.state = status;
    for (const listener of [...this.statusListeners]) listener(status);
  }
}
