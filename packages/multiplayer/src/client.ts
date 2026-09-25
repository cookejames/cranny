import { systemClock, type Clock, type TimerHandle } from './clock.ts';
import { KEEP_ALIVE_INTERVAL_MS, type RoomDirectory, type RoomTicket } from './directory.ts';
import { cleanPlayerName } from './names.ts';
import {
  decodeMessage,
  encodeMessage,
  type ClientMessage,
  type Message,
  type PlayerId,
  type RoomSnapshot,
} from './protocol.ts';
import { cryptoRandom, randomSeedFrom, type RandomSource } from './random.ts';
import {
  assumeHost,
  compareReigns,
  fromSnapshot,
  newRoom,
  nextHost,
  reignOf,
  roomReducer,
  toSnapshot,
  type RoomEvent,
  type RoomState,
} from './room.ts';
import type { ConnectionStatus, RoomConnection, RoomTransport, Unsubscribe } from './transport.ts';

/** Snapshots are merged to at most one per this many ms (SPEC §5.2). */
export const SNAPSHOT_INTERVAL_MS = 100;
/** A joining client resends `hello` this often until it has a seat (SPEC §8.1). */
export const HELLO_RETRY_MS = 5_000;
/**
 * A joining client that has heard nothing from anyone for this long starts the room itself, in
 * term 0 so any real host outranks it (SPEC §8.1).
 */
export const HOST_FALLBACK_MS = 15_000;
/** How long `leave` waits for a snapshot without this player's seat (SPEC §9). */
export const LEAVE_WAIT_MS = 2_000;
/** Intents that a snapshot shows went missing are resent at most this often. */
export const RESEND_INTERVAL_MS = 1_000;

/**
 * Where this client is with the room:
 * `connecting` (to the transport), `joining` (waiting for a seat), `in-room`, or finished:
 * `full` (turned away), `needs-update` (the room runs a newer protocol), `left` (left on purpose),
 * `closed` (closed, or couldn't connect).
 */
export type RoomPhase =
  'connecting' | 'joining' | 'in-room' | 'full' | 'needs-update' | 'left' | 'closed';

/** Everything the UI shows about the room. A new object after every change. */
export type RoomView = {
  phase: RoomPhase;
  status: ConnectionStatus;
  hosting: boolean;
  /** The latest room state, with deadlines on the local clock; null until the first snapshot. */
  room: RoomState | null;
  present: PlayerId[];
  /** No seat yet, `HELLO_RETRY_MS` after the first `hello` ("Still connecting…"). */
  stillConnecting: boolean;
  /** The directory gave the room's name to another room (SPEC §7 Lost name). */
  nameLost: boolean;
  /** When the connection dropped, on the local clock; null while connected. */
  reconnectingSince: number | null;
};

export type RoomClientOptions = {
  transport: RoomTransport;
  directory: RoomDirectory;
  ticket: RoomTicket;
  self: PlayerId;
  /** The player's name; cleaned before it's sent. */
  name: string;
  /** Whether this client just created the room, and so starts as host (SPEC §8.1). */
  created: boolean;
  clock?: Clock;
  random?: RandomSource;
};

/** What this player last told the host about the current round. */
type Reported = { round: number; placed: number; finishedMs: number | null };

/**
 * One player's side of a room (SPEC §5, §8): connects, keeps the latest snapshot, sends intents,
 * and while host runs the room reducer, its deadlines and the directory keep-alive. Handles host
 * handover, two hosts at once, reconnecting, and resending intents a snapshot shows were lost.
 * Framework-free: the UI subscribes to {@link RoomView}s.
 */
export class RoomClient {
  readonly self: PlayerId;
  readonly ticket: RoomTicket;
  private readonly transport: RoomTransport;
  private readonly directory: RoomDirectory;
  private readonly clock: Clock;
  private readonly random: RandomSource;
  private readonly created: boolean;
  private name: string;

  private connection: RoomConnection | null = null;
  private unsubscribes: Unsubscribe[] = [];
  private listeners = new Set<(view: RoomView) => void>();
  private current: RoomView;

  private state: RoomState | null = null;
  private hosting = false;
  private reported: Reported | null = null;
  private wantReady = false;
  private lastSentAt = -Infinity;
  private lastResendAt = -Infinity;
  private leaving: ((value: void) => void) | null = null;

  private flushTimer: TimerHandle | null = null;
  private tickTimer: TimerHandle | null = null;
  private helloTimer: TimerHandle | null = null;
  private fallbackTimer: TimerHandle | null = null;
  private keepAliveTimer: TimerHandle | null = null;
  private resendTimer: TimerHandle | null = null;

  /** @param options - The transport, directory, ticket and player; see {@link RoomClientOptions}. */
  constructor(options: RoomClientOptions) {
    this.transport = options.transport;
    this.directory = options.directory;
    this.ticket = options.ticket;
    this.self = options.self;
    this.name = cleanPlayerName(options.name) ?? 'Player';
    this.created = options.created;
    this.clock = options.clock ?? systemClock;
    this.random = options.random ?? cryptoRandom;
    this.current = {
      phase: 'connecting',
      status: 'connecting',
      hosting: false,
      room: null,
      present: [],
      stillConnecting: false,
      nameLost: false,
      reconnectingSince: null,
    };
  }

  /** The latest view. */
  view(): RoomView {
    return this.current;
  }

  /** Calls `listener` after every change to the view. */
  subscribe(listener: (view: RoomView) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Connects and joins: as host if this client created the room or nobody else is there,
   * otherwise by sending `hello` until a snapshot gives it a seat (SPEC §8.1). The phase becomes
   * `closed` if the transport can't connect.
   */
  async start(): Promise<void> {
    let connection: RoomConnection;
    try {
      connection = await this.transport.connect(this.ticket, this.self);
    } catch {
      this.update({ phase: 'closed', status: 'closed' });
      return;
    }
    if (this.isFinished()) {
      await connection.close();
      return;
    }
    this.connection = connection;
    this.unsubscribes = [
      connection.onMessage((message, from) => this.onMessage(message, from)),
      connection.onPresence((present) => this.onPresence(present)),
      connection.onStatus((status) => this.onStatus(status)),
    ];
    const present = connection.presence();
    this.update({ phase: 'joining', status: connection.status(), present });
    if (this.created || present.every((id) => id === this.self)) this.startFresh(1);
    else this.startJoining();
  }

  /** Marks this player ready or not for the next round. */
  setReady(ready: boolean): void {
    this.wantReady = ready;
    this.intent({ type: 'ready', ready });
  }

  /** Changes this player's name. Names that clean to nothing are ignored. */
  rename(name: string): void {
    const cleaned = cleanPlayerName(name);
    if (!cleaned || cleaned === this.name) return;
    this.name = cleaned;
    this.intent({ type: 'rename', name: cleaned });
  }

  /** Reports how many pieces are on this player's board. Sent only when the count changes. */
  reportProgress(round: number, placed: number): void {
    const reported = this.reportedFor(round);
    if (reported.placed === placed || reported.finishedMs !== null) return;
    reported.placed = placed;
    this.intent({ type: 'progress', round, placed });
  }

  /** Reports that this player filled the grid, with their stopwatch time. */
  reportFinished(round: number, ms: number): void {
    const reported = this.reportedFor(round);
    if (reported.finishedMs !== null) return;
    reported.finishedMs = ms;
    this.intent({ type: 'finished', round, ms });
  }

  /**
   * Leaves for good (SPEC §2, §9): sends `leave`, waits up to `LEAVE_WAIT_MS` for a snapshot
   * without this seat (a host applies it itself and sends that snapshot), then closes.
   */
  async leave(): Promise<void> {
    if (this.isFinished() || !this.connection) return this.close();
    if (this.hosting && this.state) {
      this.apply({ type: 'intent', from: this.self, message: { type: 'leave' } });
      this.flush();
    } else {
      const seen = new Promise<void>((resolve) => (this.leaving = resolve));
      const timer = this.clock.setTimeout(() => this.leaving?.(), LEAVE_WAIT_MS);
      this.publish({ type: 'leave' });
      await seen;
      this.clock.clearTimeout(timer);
    }
    await this.shutDown('left');
  }

  /** Disconnects without leaving: the seat stays, shown as away (a closed tab, SPEC §2). */
  async close(): Promise<void> {
    await this.shutDown(this.isFinished() ? this.current.phase : 'closed');
  }

  // Joining and hosting

  /** Starts a new room with this client as host (SPEC §8.1). */
  private startFresh(term: number): void {
    this.clearJoinTimers();
    const state = newRoom(this.ticket.room, this.self, term);
    this.state = { ...state, present: this.presentNow() };
    this.beginHosting();
  }

  /** Sends `hello` and keeps resending it until a snapshot seats this player (SPEC §8.1). */
  private startJoining(): void {
    this.publish({ type: 'hello', name: this.name });
    const retry = () => {
      this.helloTimer = this.clock.setTimeout(() => {
        if (this.hosting || this.isFinished() || this.hasSeat()) return;
        this.update({ stillConnecting: true });
        this.publish({ type: 'hello', name: this.name });
        retry();
      }, HELLO_RETRY_MS);
    };
    retry();
    this.fallbackTimer = this.clock.setTimeout(() => {
      this.fallbackTimer = null;
      if (!this.state && !this.hosting && !this.isFinished()) this.startFresh(0);
    }, HOST_FALLBACK_MS);
  }

  /** Takes over as host from the latest snapshot, in a new term (SPEC §8.2). */
  private takeOver(): void {
    if (!this.state) return;
    this.state = { ...assumeHost(this.state, this.self), present: this.presentNow() };
    this.beginHosting();
  }

  /** Starts acting as host: takes a seat, applies presence, sends a snapshot and keeps the name. */
  private beginHosting(): void {
    this.hosting = true;
    this.clearJoinTimers();
    this.apply({ type: 'intent', from: this.self, message: { type: 'hello', name: this.name } });
    this.apply({ type: 'presence', present: this.presentNow() });
    this.scheduleBroadcast();
    this.keepAlive();
    this.update({ hosting: true, stillConnecting: false });
  }

  /** Stops acting as host after another host outranked this one (SPEC §8.2). */
  private stepDown(): void {
    this.hosting = false;
    for (const timer of [this.flushTimer, this.tickTimer, this.keepAliveTimer]) {
      if (timer !== null) this.clock.clearTimeout(timer);
    }
    this.flushTimer = this.tickTimer = this.keepAliveTimer = null;
    this.update({ hosting: false });
  }

  /** Renews the room's lease now and every `KEEP_ALIVE_INTERVAL_MS` while host (SPEC §7). */
  private keepAlive(): void {
    if (this.keepAliveTimer !== null) this.clock.clearTimeout(this.keepAliveTimer);
    this.keepAliveTimer = null;
    if (!this.hosting || this.current.nameLost) return;
    this.directory.keepAlive(this.ticket).then(
      (result) => {
        if (result === 'lost') this.update({ nameLost: true });
      },
      () => undefined,
    );
    this.keepAliveTimer = this.clock.setTimeout(() => this.keepAlive(), KEEP_ALIVE_INTERVAL_MS);
  }

  // Incoming

  /** Handles one message from the transport. */
  private onMessage(raw: unknown, from: PlayerId): void {
    if (from === this.self || this.isFinished()) return;
    const decoded = decodeMessage(raw, from);
    if (!decoded.ok) {
      if (decoded.reason === 'newer-protocol') void this.shutDown('needs-update');
      if (decoded.reason === 'older-protocol' && this.hosting) {
        this.publish({ type: 'reject', to: from, reason: 'protocol' });
      }
      return;
    }
    const { message } = decoded;
    switch (message.type) {
      case 'snapshot':
        return this.onSnapshot(message.snapshot, from);
      case 'reject':
        if (message.to !== this.self || this.hasSeat()) return;
        void this.shutDown(message.reason === 'full' ? 'full' : 'needs-update');
        return;
      default:
        if (this.hosting) this.onIntent(from, message);
    }
  }

  /** Host: applies a player's intent; a `hello` always gets a snapshot, or `reject` if full. */
  private onIntent(from: PlayerId, message: ClientMessage): void {
    this.apply({ type: 'intent', from, message });
    if (message.type !== 'hello') return;
    if (this.state?.seats.some((s) => s.id === from)) this.scheduleBroadcast();
    else this.publish({ type: 'reject', to: from, reason: 'full' });
  }

  /**
   * A snapshot from another host. Later reigns win, then higher revs within a reign (SPEC §8.2).
   * A host that is outranked steps down; one that outranks the sender resends its own snapshot so
   * the other steps down.
   */
  private onSnapshot(snapshot: RoomSnapshot, from: PlayerId): void {
    if (snapshot.hostId !== from || snapshot.room !== this.ticket.room) return;
    const incoming = { term: snapshot.term, hostId: from, hostJoinOrder: snapshot.hostJoinOrder };
    if (this.hosting && this.state) {
      if (compareReigns(incoming, reignOf(this.state)) >= 0) {
        this.scheduleBroadcast();
        return;
      }
      this.stepDown();
    } else if (this.state) {
      const order = compareReigns(incoming, reignOf(this.state));
      if (order > 0 || (order === 0 && snapshot.rev <= this.state.rev)) return;
    }
    this.adopt(snapshot);
  }

  /** Takes a snapshot as the latest state, then checks the host and resends anything lost. */
  private adopt(snapshot: RoomSnapshot): void {
    this.state = fromSnapshot(snapshot, this.clock.now(), this.presentNow());
    if (!this.hosting && this.hasSeat()) this.clearJoinTimers();
    if (this.leaving && !this.hasSeat()) this.leaving();
    this.update({
      room: this.state,
      phase: this.hasSeat() ? 'in-room' : 'joining',
      stillConnecting: this.hasSeat() ? false : this.current.stillConnecting,
    });
    this.checkHost();
    this.reconcile();
  }

  /** Presence changed: the host applies it; a client checks whether the host has gone. */
  private onPresence(present: PlayerId[]): void {
    if (this.isFinished()) return;
    this.update({ present: [...present] });
    if (this.hosting) {
      this.apply({ type: 'presence', present: [...present] });
      return;
    }
    if (this.state) {
      this.state = { ...this.state, present: [...present] };
      this.update({ room: this.state });
    }
    this.checkHost();
  }

  /**
   * Client: if the host isn't present, the present seat with the lowest join order takes over
   * (SPEC §8.2). With no state yet, a client alone in the room starts it (SPEC §8.1).
   */
  private checkHost(): void {
    if (this.hosting || this.leaving || this.isFinished()) return;
    if (this.connection?.status() !== 'connected') return;
    const present = this.presentNow();
    if (!this.state) {
      if (present.every((id) => id === this.self)) this.startFresh(1);
      return;
    }
    if (present.includes(this.state.hostId)) return;
    const next = nextHost({ ...this.state, present });
    if (next === this.self || next === null) this.takeOver();
  }

  /** Connection status changed; after a reconnect, re-announce and resend (SPEC §9). */
  private onStatus(status: ConnectionStatus): void {
    if (this.isFinished()) return;
    if (status === 'closed') {
      void this.shutDown('closed');
      return;
    }
    const reconnectingSince =
      status === 'connected' ? null : (this.current.reconnectingSince ?? this.clock.now());
    this.update({ status, reconnectingSince });
    // The host un-readies players who drop, so a returning player chooses again (SPEC §2).
    if (status === 'reconnecting') this.wantReady = false;
    if (status !== 'connected') return;
    this.onPresence(this.presentNow());
    if (this.hosting) {
      this.scheduleBroadcast();
    } else {
      this.publish({ type: 'hello', name: this.name });
      this.lastResendAt = -Infinity;
      this.reconcile();
    }
  }

  // Outgoing

  /** Sends an intent: applied directly while host, published otherwise. */
  private intent(message: ClientMessage): void {
    if (this.isFinished()) return;
    if (this.hosting) this.apply({ type: 'intent', from: this.self, message });
    else this.publish(message);
  }

  /**
   * Resends what a snapshot shows the host never got (delivery is at most once, SPEC §6.1): a
   * seat, the name, ready, progress or a finish. At most once per `RESEND_INTERVAL_MS`.
   */
  private reconcile(): void {
    const state = this.state;
    if (this.hosting || !state || this.leaving || this.isFinished()) return;
    const wait = this.lastResendAt + RESEND_INTERVAL_MS - this.clock.now();
    if (wait > 0) {
      if (this.resendTimer === null) {
        this.resendTimer = this.clock.setTimeout(() => {
          this.resendTimer = null;
          this.reconcile();
        }, wait);
      }
      return;
    }
    const lost = this.missingIntents(state);
    if (lost.length === 0) return;
    this.lastResendAt = this.clock.now();
    for (const message of lost) this.publish(message);
  }

  /** The intents this player sent that the state doesn't reflect. */
  private missingIntents(state: RoomState): ClientMessage[] {
    const seat = state.seats.find((s) => s.id === this.self);
    if (!seat) return [{ type: 'hello', name: this.name }];
    const lost: ClientMessage[] = [];
    if (seat.name !== this.name) lost.push({ type: 'rename', name: this.name });
    const { round } = state;
    if (round.status === 'lobby') {
      if (this.wantReady !== round.ready.includes(this.self)) {
        lost.push({ type: 'ready', ready: this.wantReady });
      }
      return lost;
    }
    this.wantReady = false;
    const reported = this.reported;
    if (!reported || reported.round !== round.number || !round.participants.includes(this.self)) {
      return lost;
    }
    const finished = round.finishes.some((f) => f.id === this.self);
    if (reported.finishedMs !== null && !finished) {
      lost.push({ type: 'finished', round: reported.round, ms: reported.finishedMs });
    } else if (!finished && (round.progress[this.self] ?? 0) !== reported.placed) {
      lost.push({ type: 'progress', round: reported.round, placed: reported.placed });
    }
    return lost;
  }

  /** Host: runs the reducer, then sends a snapshot and reschedules the next deadline. */
  private apply(event: RoomEvent): void {
    if (!this.state) return;
    const before = this.state;
    const env = { now: this.clock.now(), seed: randomSeedFrom(this.random) };
    this.state = roomReducer(this.state, event, env);
    if (this.state.rev !== before.rev) this.scheduleBroadcast();
    this.scheduleTick();
    if (this.state !== before) this.update({ room: this.state, phase: this.seatPhase() });
  }

  /** Host: wakes up at the next deadline (ready timeout, reveal or close-out). */
  private scheduleTick(): void {
    if (this.tickTimer !== null) this.clock.clearTimeout(this.tickTimer);
    this.tickTimer = null;
    const round = this.state?.round;
    if (!this.hosting || !round) return;
    const deadlines = [round.readyClosesAt, round.revealAt, round.closesAt].filter(
      (at): at is number => at !== null,
    );
    if (deadlines.length === 0) return;
    const wait = Math.max(0, Math.min(...deadlines) - this.clock.now());
    this.tickTimer = this.clock.setTimeout(() => {
      this.tickTimer = null;
      this.apply({ type: 'tick' });
    }, wait);
  }

  /** Host: sends a snapshot soon, merging bursts to one per `SNAPSHOT_INTERVAL_MS` (SPEC §5.2). */
  private scheduleBroadcast(): void {
    if (!this.hosting || this.flushTimer !== null) return;
    const wait = Math.max(0, this.lastSentAt + SNAPSHOT_INTERVAL_MS - this.clock.now());
    this.flushTimer = this.clock.setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, wait);
  }

  /** Host: sends the current snapshot now. */
  private flush(): void {
    if (!this.hosting || !this.state) return;
    const now = this.clock.now();
    this.lastSentAt = now;
    this.publish({ type: 'snapshot', snapshot: toSnapshot(this.state, now) });
  }

  /** Publishes a message; failures are ignored, since snapshots and resends recover them. */
  private publish(message: Message): void {
    const connection = this.connection;
    if (!connection || connection.status() !== 'connected') return;
    connection.publish(encodeMessage(this.self, message)).catch(() => undefined);
  }

  // Helpers

  /** The record of what was reported for a round, reset when the round changes. */
  private reportedFor(round: number): Reported {
    if (this.reported?.round !== round) this.reported = { round, placed: 0, finishedMs: null };
    return this.reported;
  }

  /** Who the connection says is present now. */
  private presentNow(): PlayerId[] {
    return this.connection?.presence() ?? [];
  }

  /** Whether the latest state has a seat for this player. */
  private hasSeat(): boolean {
    return this.state?.seats.some((s) => s.id === this.self) ?? false;
  }

  /** `in-room` with a seat, `joining` without. */
  private seatPhase(): RoomPhase {
    return this.hasSeat() ? 'in-room' : 'joining';
  }

  /** Whether the client has stopped for good. */
  private isFinished(): boolean {
    const { phase } = this.current;
    return phase === 'full' || phase === 'needs-update' || phase === 'left' || phase === 'closed';
  }

  /** Stops the hello and fallback timers once seated or hosting. */
  private clearJoinTimers(): void {
    if (this.helloTimer !== null) this.clock.clearTimeout(this.helloTimer);
    if (this.fallbackTimer !== null) this.clock.clearTimeout(this.fallbackTimer);
    this.helloTimer = this.fallbackTimer = null;
  }

  /** Stops everything, closes the connection and ends in `phase`. */
  private async shutDown(phase: RoomPhase): Promise<void> {
    if (this.isFinished() && this.connection === null) return;
    this.stepDown();
    this.clearJoinTimers();
    if (this.resendTimer !== null) this.clock.clearTimeout(this.resendTimer);
    this.resendTimer = null;
    this.leaving?.();
    this.leaving = null;
    for (const unsubscribe of this.unsubscribes) unsubscribe();
    this.unsubscribes = [];
    const connection = this.connection;
    this.connection = null;
    this.update({ phase, status: 'closed', hosting: false, reconnectingSince: null });
    await connection?.close();
  }

  /** Replaces the view and tells subscribers. */
  private update(patch: Partial<RoomView>): void {
    this.current = { ...this.current, ...patch };
    for (const listener of [...this.listeners]) listener(this.current);
  }
}
