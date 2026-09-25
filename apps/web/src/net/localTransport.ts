import {
  cryptoRandom,
  isPlayerId,
  randomPlayerId,
  systemClock,
  type Clock,
  type ConnectionStatus,
  type PlayerId,
  type RoomConnection,
  type RoomTicket,
  type RoomTransport,
  type TimerHandle,
  type Unsubscribe,
} from '@cranny/multiplayer';
import { isLocalCredentialFor } from './localDirectory.ts';

// A development-only transport between tabs of one browser (specs/2026-09-25-multiplayer/SPEC.md
// §3, §6). Each connection opens a BroadcastChannel for its room's channel id. BroadcastChannel
// has no presence, so the adapter builds it as SPEC §6.2 describes for such vendors: heartbeats
// every 10 s, a member silent for 25 s counts as gone, and a clean close sends a goodbye.

/** How often each connection says it's still here. */
export const HEARTBEAT_MS = 10_000;
/** How long a member may be silent before it counts as gone. */
export const SILENCE_MS = 25_000;
/** How often silent members are looked for, so a drop shows within SILENCE_MS + SWEEP_MS. */
export const SWEEP_MS = 1_000;
/** How long `connect` waits for the members already there to answer its join. */
export const JOIN_WAIT_MS = 200;

/** A named broadcast bus: what LocalTransport needs from `BroadcastChannel`. */
export type Bus = {
  /** Sends to every other open bus with the same name (never to this one). */
  post(data: unknown): void;
  listen(callback: (data: unknown) => void): void;
  close(): void;
};

/** Where `pagehide`/`pageshow` come from: `window` in the browser. */
export type PageLifecycle = {
  addEventListener(type: 'pagehide' | 'pageshow', listener: (event: Event) => void): void;
};

export type LocalTransportOptions = {
  clock?: Clock;
  /** Opens a bus by name; defaults to `BroadcastChannel`. */
  openBus?: (name: string) => Bus;
  /** Sends goodbyes when the page goes away; defaults to `window` if there is one. */
  lifecycle?: PageLifecycle | null;
  heartbeatMs?: number;
  silenceMs?: number;
  sweepMs?: number;
  joinWaitMs?: number;
};

/** What travels on the bus. `conn` tells a player's connections apart (e.g. two tabs). */
type Frame =
  | { t: 'join' | 'beat' | 'bye'; conn: string; from: PlayerId }
  | { t: 'msg'; conn: string; from: PlayerId; payload: unknown };

/** A frame read off the bus, or null if it isn't one (another build's tab, say). */
function parseFrame(data: unknown): Frame | null {
  if (typeof data !== 'object' || data === null) return null;
  const f = data as Record<string, unknown>;
  if (typeof f.conn !== 'string' || !isPlayerId(f.from)) return null;
  if (f.t === 'msg') return { t: 'msg', conn: f.conn, from: f.from, payload: f.payload };
  if (f.t === 'join' || f.t === 'beat' || f.t === 'bye') {
    return { t: f.t, conn: f.conn, from: f.from };
  }
  return null;
}

/** Opens a real `BroadcastChannel` as a {@link Bus}. */
function broadcastBus(name: string): Bus {
  const channel = new BroadcastChannel(name);
  return {
    post: (data) => channel.postMessage(data),
    listen: (callback) => channel.addEventListener('message', (event) => callback(event.data)),
    close: () => channel.close(),
  };
}

/** `window`, if this is a browser page. */
function defaultLifecycle(): PageLifecycle | null {
  return typeof window === 'undefined' ? null : window;
}

/**
 * {@link RoomTransport} over `BroadcastChannel`, so tabs of one browser can play together without
 * a server (development only, `VITE_ROOM_TRANSPORT=local`). Identity isn't authenticated: `from`
 * is the sender's own claim, which SPEC §6.1 accepts for vendors that can't bind it.
 */
export class LocalTransport implements RoomTransport {
  readonly clock: Clock;
  readonly heartbeatMs: number;
  readonly silenceMs: number;
  readonly sweepMs: number;
  private readonly openBus: (name: string) => Bus;
  private readonly joinWaitMs: number;
  private readonly open = new Set<LocalConnection>();

  /** @param options - Test seams and timings; the defaults are for the browser. */
  constructor(options: LocalTransportOptions = {}) {
    this.clock = options.clock ?? systemClock;
    this.openBus = options.openBus ?? broadcastBus;
    this.heartbeatMs = options.heartbeatMs ?? HEARTBEAT_MS;
    this.silenceMs = options.silenceMs ?? SILENCE_MS;
    this.sweepMs = options.sweepMs ?? SWEEP_MS;
    this.joinWaitMs = options.joinWaitMs ?? JOIN_WAIT_MS;
    const lifecycle = options.lifecycle === undefined ? defaultLifecycle() : options.lifecycle;
    // A closing tab says goodbye so the others see it go at once rather than after SILENCE_MS. A
    // page restored from the back/forward cache announces itself again.
    lifecycle?.addEventListener('pagehide', () => {
      for (const c of this.open) c.sayGoodbye();
    });
    lifecycle?.addEventListener('pageshow', (event) => {
      if ((event as PageTransitionEvent).persisted) for (const c of this.open) c.announce();
    });
  }

  /**
   * Opens the ticket's channel and announces `self`, resolving after {@link JOIN_WAIT_MS} so the
   * members already there have answered and `presence()` lists them.
   *
   * @throws If the ticket's credential isn't for this channel and player.
   */
  async connect(ticket: RoomTicket, self: PlayerId): Promise<LocalConnection> {
    if (!isLocalCredentialFor(ticket.credential.value, ticket.channel, self)) {
      throw new Error('The ticket’s credential is for another room or player');
    }
    const connection = new LocalConnection(
      this,
      this.openBus(`cranny-room:${ticket.channel}`),
      randomPlayerId(cryptoRandom),
      self,
      () => this.open.delete(connection),
    );
    this.open.add(connection);
    connection.announce();
    await new Promise<void>((resolve) => this.clock.setTimeout(resolve, this.joinWaitMs));
    return connection;
  }
}

type Member = { self: PlayerId; lastSeen: number };

/** One tab's connection to one room over {@link LocalTransport}. */
export class LocalConnection implements RoomConnection {
  private state: ConnectionStatus = 'connected';
  /** Every other connection heard from recently, by connection id. */
  private readonly members = new Map<string, Member>();
  /** Presence as last reported to listeners. */
  private reported: PlayerId[];
  private lastBeat: number;
  private lastSweep: number;
  private sweepTimer: TimerHandle | undefined;
  private readonly messageListeners = new Set<(message: unknown, from: PlayerId) => void>();
  private readonly presenceListeners = new Set<(present: PlayerId[]) => void>();
  private readonly statusListeners = new Set<(status: ConnectionStatus) => void>();

  /**
   * @param transport - Timings and the clock.
   * @param bus - This connection's own bus; closed with it.
   * @param id - This connection's id on the bus.
   * @param self - The player it connects as.
   * @param onClose - Called once when it closes.
   */
  constructor(
    private readonly transport: LocalTransport,
    private readonly bus: Bus,
    private readonly id: string,
    readonly self: PlayerId,
    private readonly onClose: () => void,
  ) {
    const now = transport.clock.now();
    this.lastBeat = now;
    this.lastSweep = now;
    this.reported = [self];
    bus.listen((data) => this.receive(data));
    this.scheduleSweep();
  }

  /** Sends to the channel and, a moment later, to this connection's own listeners. */
  async publish(message: unknown): Promise<void> {
    if (this.state !== 'connected') throw new Error(`Can't publish while ${this.state}`);
    this.post({ t: 'msg', conn: this.id, from: this.self, payload: message });
    // BroadcastChannel never echoes to the sender, so deliver our own copy, after a timer so it
    // arrives asynchronously and in order like everyone else's.
    const copy = JSON.stringify(message);
    this.transport.clock.setTimeout(() => {
      if (this.state === 'connected') this.emitMessage(JSON.parse(copy), this.self);
    }, 0);
  }

  /** Subscribes to messages. */
  onMessage(callback: (message: unknown, from: PlayerId) => void): Unsubscribe {
    this.messageListeners.add(callback);
    return () => this.messageListeners.delete(callback);
  }

  /** Who is here: this player first, then everyone heard from within the silence limit. */
  presence(): PlayerId[] {
    return [...this.reported];
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

  /** Says goodbye so the others drop this member at once, then closes the bus. */
  async close(): Promise<void> {
    if (this.state === 'closed') return;
    if (this.state === 'connected') this.sayGoodbye();
    this.setStatus('closed');
    this.transport.clock.clearTimeout(this.sweepTimer);
    this.bus.close();
    this.onClose();
  }

  /**
   * Goes silent as a frozen or suspended tab would, without a goodbye: `reconnecting`, no
   * heartbeats, nothing sent or received. For tests (the conformance suite's abrupt drop).
   */
  suspend(): void {
    if (this.state !== 'connected') return;
    this.setStatus('reconnecting');
  }

  /** Comes back from {@link suspend}: `connected` again, and announced to the channel. */
  resume(): void {
    if (this.state !== 'reconnecting') return;
    this.setStatus('connected');
    this.announce();
  }

  /**
   * Tells the channel this connection is here and asks everyone to answer at once. Members
   * already known are given a fresh silence allowance, since after a pause they haven't had the
   * chance to be heard from; dropping them straight away could make this tab think it's alone.
   */
  announce(): void {
    if (this.state !== 'connected') return;
    const now = this.transport.clock.now();
    for (const member of this.members.values()) member.lastSeen = now;
    this.lastBeat = now;
    this.lastSweep = now;
    this.post({ t: 'join', conn: this.id, from: this.self });
  }

  /** Tells the channel this connection is leaving. */
  sayGoodbye(): void {
    if (this.state === 'connected') this.post({ t: 'bye', conn: this.id, from: this.self });
  }

  /** Handles one frame from another connection. */
  private receive(data: unknown): void {
    if (this.state !== 'connected') return;
    const frame = parseFrame(data);
    if (!frame || frame.conn === this.id) return;
    if (frame.t === 'bye') {
      this.members.delete(frame.conn);
    } else {
      this.members.set(frame.conn, { self: frame.from, lastSeen: this.transport.clock.now() });
      if (frame.t === 'join') this.post({ t: 'beat', conn: this.id, from: this.self });
    }
    // Presence first, so a newcomer's first message never comes from someone not yet present.
    this.updatePresence();
    if (frame.t === 'msg') this.emitMessage(frame.payload, frame.from);
  }

  /** Sends heartbeats and drops silent members, every {@link SWEEP_MS}. */
  private scheduleSweep(): void {
    const { clock, heartbeatMs, silenceMs, sweepMs } = this.transport;
    this.sweepTimer = clock.setTimeout(() => {
      this.scheduleSweep();
      if (this.state !== 'connected') return;
      const now = clock.now();
      // A long gap between sweeps means this tab was frozen or throttled: the others have
      // probably dropped it, and it hasn't been listening, so start again as if reconnecting.
      if (now - this.lastSweep > silenceMs) {
        this.announce();
        return;
      }
      this.lastSweep = now;
      if (now - this.lastBeat >= heartbeatMs) {
        this.lastBeat = now;
        this.post({ t: 'beat', conn: this.id, from: this.self });
      }
      for (const [conn, member] of this.members) {
        if (now - member.lastSeen >= silenceMs) this.members.delete(conn);
      }
      this.updatePresence();
    }, sweepMs);
  }

  /** Recomputes presence and tells listeners if it changed. */
  private updatePresence(): void {
    const others = [...this.members.values()].map((m) => m.self).filter((id) => id !== this.self);
    const now = [this.self, ...new Set(others)];
    if (now.join() === this.reported.join()) return;
    this.reported = now;
    for (const listener of [...this.presenceListeners]) listener([...now]);
  }

  /** Posts a frame to the other connections on the channel. */
  private post(frame: Frame): void {
    this.bus.post(frame);
  }

  /** Delivers a message to listeners. */
  private emitMessage(message: unknown, from: PlayerId): void {
    for (const listener of [...this.messageListeners]) listener(message, from);
  }

  /** Changes the status and tells listeners. */
  private setStatus(status: ConnectionStatus): void {
    if (this.state === status) return;
    this.state = status;
    for (const listener of [...this.statusListeners]) listener(status);
  }
}
