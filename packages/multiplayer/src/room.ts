import { CURRENT_VERSION } from '@cranny/engine';
import type { BoardCode } from './board.ts';
import { cleanPlayerName } from './names.ts';
import {
  PROTOCOL_VERSION,
  type ClientMessage,
  type PlayerId,
  type RoomSnapshot,
  type Round,
  type RoundResult,
  type Seat,
} from './protocol.ts';
import {
  CLOSE_OUT_MS,
  MAX_PRESENT,
  MAX_SEATS,
  MIN_PLAYERS,
  PIECE_COUNT,
  READY_TIMEOUT_MS,
  REVEAL_COUNTDOWN_MS,
} from './rules.ts';
import { roundResult } from './scoring.ts';

/**
 * A round as a client keeps it: the snapshot's countdowns turned into deadlines on this device's
 * clock (SPEC §5.4). Local times are milliseconds on the injected clock, never sent.
 */
export type LiveRound = Omit<Round, 'readyClosesInMs' | 'revealInMs' | 'closesInMs'> & {
  readyClosesAt: number | null;
  revealAt: number | null;
  closesAt: number | null;
};

/** The room as one client knows it: its latest snapshot, with local deadlines and presence. */
export type RoomState = {
  room: string;
  term: number;
  rev: number;
  hostId: PlayerId;
  seats: Seat[];
  round: LiveRound;
  lastResult: RoundResult | null;
  /** Who the transport says is connected (SPEC §6.2). Never part of a snapshot. */
  present: PlayerId[];
};

/** What the host's reducer reacts to (SPEC §5.3). */
export type RoomEvent =
  | { type: 'intent'; from: PlayerId; message: ClientMessage }
  | { type: 'presence'; present: PlayerId[] }
  /** A deadline may have passed. */
  | { type: 'tick' };

/**
 * What the reducer needs from outside, so it stays pure. `now` is the local clock; `seed` is a
 * fresh random seed, used only if this event starts a round.
 */
export type RoomEnv = { now: number; seed: number };

const LOBBY: LiveRound = {
  number: 0,
  status: 'lobby',
  grid: null,
  participants: [],
  ready: [],
  progress: {},
  finishes: [],
  readyClosesAt: null,
  revealAt: null,
  closesAt: null,
};

/**
 * A fresh room with no seats, hosted by `hostId` (SPEC §8.1). The host then applies its own
 * `hello` to take a seat.
 *
 * @param term - 1 for a room created or found empty; 0 for one started only because nobody
 *   answered (it loses to any real host, SPEC §8.1).
 */
export function newRoom(room: string, hostId: PlayerId, term: number): RoomState {
  return {
    room,
    term,
    rev: 0,
    hostId,
    seats: [],
    round: LOBBY,
    lastResult: null,
    present: [hostId],
  };
}

/**
 * Applies one event as the host (SPEC §2, §5.3), then acts on anything that follows from it at
 * `env.now`: a round starting, the reveal, the close-out ending or everyone having finished. `rev`
 * goes up by one if anything sent in snapshots changed. Invalid, late or repeated intents are
 * ignored.
 */
export function roomReducer(state: RoomState, event: RoomEvent, env: RoomEnv): RoomState {
  const next = settle(apply(state, event, env.now), env);
  const changed =
    next.seats !== state.seats ||
    next.round !== state.round ||
    next.lastResult !== state.lastResult;
  return changed ? { ...next, rev: state.rev + 1 } : next;
}

/** Applies an event without following on. */
function apply(state: RoomState, event: RoomEvent, now: number): RoomState {
  switch (event.type) {
    case 'presence': {
      const present = [...event.present];
      // A player who drops is no longer ready; they choose again when they come back.
      const ready = state.round.ready.filter((id) => present.includes(id));
      const next = { ...state, present };
      return ready.length === state.round.ready.length ? next : withRound(next, { ready });
    }
    case 'tick':
      return state;
    case 'intent':
      return applyIntent(state, event.from, event.message, now);
  }
}

/** Applies one client intent (SPEC §5.2, §5.3). */
function applyIntent(state: RoomState, from: PlayerId, message: ClientMessage, now: number) {
  const seat = state.seats.find((s) => s.id === from);
  const { round } = state;
  const inPlay = round.status !== 'lobby';
  switch (message.type) {
    case 'hello': {
      const name = cleanPlayerName(message.name) ?? 'Player';
      if (seat) return rename(state, seat, name);
      const presentSeats = state.seats.filter((s) => s.id !== from && isPresent(state, s.id));
      if (state.seats.length >= MAX_SEATS || presentSeats.length >= MAX_PRESENT) return state;
      const joinOrder = Math.max(-1, ...state.seats.map((s) => s.joinOrder)) + 1;
      return { ...state, seats: [...state.seats, { id: from, name, joinOrder, score: 0 }] };
    }
    case 'rename': {
      const name = cleanPlayerName(message.name);
      return seat && name ? rename(state, seat, name) : state;
    }
    case 'ready': {
      if (!seat || round.status !== 'lobby' || round.ready.includes(from) === message.ready) {
        return state;
      }
      const ready = message.ready
        ? [...round.ready, from]
        : round.ready.filter((id) => id !== from);
      return withRound(state, { ready });
    }
    case 'progress': {
      if (!inPlay || !isActive(round, from, message.round)) return state;
      if (round.progress[from] === message.placed) return state;
      return withRound(state, { progress: { ...round.progress, [from]: message.placed } });
    }
    case 'finished': {
      if (!inPlay || !isActive(round, from, message.round)) return state;
      const finishes = [...round.finishes, { id: from, ms: message.ms }];
      const progress = { ...round.progress, [from]: PIECE_COUNT };
      if (round.finishes.length > 0) return withRound(state, { finishes, progress });
      // The first finish starts the close-out (SPEC §2 Rounds 5).
      return withRound(state, {
        finishes,
        progress,
        status: 'closing',
        revealAt: null,
        closesAt: now + CLOSE_OUT_MS,
      });
    }
    case 'board':
      return acceptBoard(state, from, message.round, message.board);
    case 'leave': {
      if (!seat) return state;
      const without = (ids: PlayerId[]) => ids.filter((id) => id !== from);
      const progress = { ...round.progress };
      delete progress[from];
      const lastResult = state.lastResult && {
        ...state.lastResult,
        places: state.lastResult.places.filter((p) => p.id !== from),
      };
      return withRound(
        { ...state, seats: state.seats.filter((s) => s.id !== from), lastResult },
        {
          ready: without(round.ready),
          participants: without(round.participants),
          progress,
          finishes: round.finishes.filter((f) => f.id !== from),
        },
      );
    }
  }
}

/**
 * Stores a participant's board in the last result (specs/2026-09-26-player-grids/SPEC.md §3.4):
 * only for that result's round, only from a finisher or a dnf, and only once.
 */
function acceptBoard(state: RoomState, from: PlayerId, round: number, board: BoardCode) {
  const result = state.lastResult;
  if (!result || result.number !== round) return state;
  const place = result.places.find((p) => p.id === from);
  if (!place || place.outcome === 'sat-out' || place.board) return state;
  const places = result.places.map((p) => (p === place ? { ...p, board: [...board] } : p));
  return { ...state, lastResult: { ...result, places } };
}

/** Follows on from the state at `env.now`: starts, reveals and ends rounds (SPEC §2 Rounds). */
function settle(state: RoomState, env: RoomEnv): RoomState {
  const { now } = env;
  const { round } = state;
  if (round.status === 'lobby') {
    const present = state.seats.filter((s) => isPresent(state, s.id)).map((s) => s.id);
    const ready = round.ready.filter((id) => present.includes(id));
    if (present.length >= MIN_PLAYERS && ready.length === present.length) {
      return startRound(state, env);
    }
    const timeout = ready.length >= MIN_PLAYERS && ready.length * 2 > present.length;
    if (!timeout) return withRound(state, { readyClosesAt: null });
    if (round.readyClosesAt === null)
      return withRound(state, { readyClosesAt: now + READY_TIMEOUT_MS });
    return now >= round.readyClosesAt ? startRound(state, env) : state;
  }
  if (round.participants.length === 0) return endRound(state);
  if (round.status === 'countdown') {
    return round.revealAt !== null && now >= round.revealAt
      ? withRound(state, { status: 'playing', revealAt: null })
      : state;
  }
  if (round.status === 'closing') {
    const finished = new Set(round.finishes.map((f) => f.id));
    const waiting = round.participants.some((id) => !finished.has(id) && isPresent(state, id));
    if (!waiting || (round.closesAt !== null && now >= round.closesAt)) return endRound(state);
  }
  return state;
}

/**
 * Starts the 3-2-1 with the ready players as participants (SPEC §2 Rounds 2–3). Everyone else sits
 * out.
 */
function startRound(state: RoomState, { now, seed }: RoomEnv): RoomState {
  const order = new Map(state.seats.map((s) => [s.id, s.joinOrder]));
  const participants = state.round.ready
    .filter((id) => order.has(id) && isPresent(state, id))
    .sort((a, b) => order.get(a)! - order.get(b)!);
  return {
    ...state,
    round: {
      number: state.round.number + 1,
      status: 'countdown',
      grid: { version: CURRENT_VERSION, seed },
      participants,
      ready: [],
      progress: Object.fromEntries(participants.map((id) => [id, 0])),
      finishes: [],
      readyClosesAt: null,
      revealAt: now + REVEAL_COUNTDOWN_MS,
      closesAt: null,
    },
  };
}

/** Scores the round, adds the points to the totals and goes back to the lobby (SPEC §2 Rounds 6). */
function endRound(state: RoomState): RoomState {
  const { grid } = state.round;
  const result = roundResult(state.round, state.seats);
  if (grid) result.grid = grid;
  const points = new Map(result.places.map((p) => [p.id, p.points]));
  return {
    ...state,
    seats: state.seats.map((s) => ({ ...s, score: s.score + (points.get(s.id) ?? 0) })),
    round: { ...LOBBY, number: state.round.number },
    lastResult: result,
  };
}

/** Whether a player is still playing this round: a participant who hasn't finished. */
function isActive(round: LiveRound, id: PlayerId, number: number) {
  return (
    round.number === number &&
    round.participants.includes(id) &&
    !round.finishes.some((f) => f.id === id)
  );
}

/** Whether the transport shows a player as connected. */
const isPresent = (state: RoomState, id: PlayerId) => state.present.includes(id);

/** Changes a seat's name; the same state if it's unchanged. */
function rename(state: RoomState, seat: Seat, name: string): RoomState {
  if (seat.name === name) return state;
  return { ...state, seats: state.seats.map((s) => (s === seat ? { ...s, name } : s)) };
}

/** Patches the round; the same state if every patched field already has that value. */
function withRound(state: RoomState, patch: Partial<LiveRound>): RoomState {
  const same = (Object.keys(patch) as (keyof LiveRound)[]).every(
    (k) => state.round[k] === patch[k],
  );
  return same ? state : { ...state, round: { ...state.round, ...patch } };
}

/** The snapshot to send at local time `now`, with countdowns as time remaining (SPEC §5.4). */
export function toSnapshot(state: RoomState, now: number): RoomSnapshot {
  const { readyClosesAt, revealAt, closesAt, ...round } = state.round;
  const remaining = (at: number | null) => (at === null ? null : Math.max(0, at - now));
  return {
    protocol: PROTOCOL_VERSION,
    room: state.room,
    term: state.term,
    rev: state.rev,
    hostId: state.hostId,
    hostJoinOrder: state.seats.find((s) => s.id === state.hostId)?.joinOrder ?? 0,
    seats: state.seats,
    round: {
      ...round,
      readyClosesInMs: remaining(readyClosesAt),
      revealInMs: remaining(revealAt),
      closesInMs: remaining(closesAt),
    },
    lastResult: state.lastResult,
  };
}

/** A received snapshot as local state: deadlines are `receivedAt` plus the time remaining. */
export function fromSnapshot(
  snapshot: RoomSnapshot,
  receivedAt: number,
  present: PlayerId[],
): RoomState {
  const { readyClosesInMs, revealInMs, closesInMs, ...round } = snapshot.round;
  const deadline = (ms: number | null) => (ms === null ? null : receivedAt + ms);
  return {
    room: snapshot.room,
    term: snapshot.term,
    rev: snapshot.rev,
    hostId: snapshot.hostId,
    seats: snapshot.seats,
    round: {
      ...round,
      readyClosesAt: deadline(readyClosesInMs),
      revealAt: deadline(revealInMs),
      closesAt: deadline(closesInMs),
    },
    lastResult: snapshot.lastResult,
    present,
  };
}

/** Who leads a snapshot's reign: its term and host, ranked by join order then id. */
export type Reign = { term: number; hostId: PlayerId; hostJoinOrder: number };

/** The reign a state belongs to. */
export function reignOf(state: RoomState): Reign {
  const hostJoinOrder = state.seats.find((s) => s.id === state.hostId)?.joinOrder ?? 0;
  return { term: state.term, hostId: state.hostId, hostJoinOrder };
}

/**
 * Orders two reigns (SPEC §8.2): a later term wins; within a term, the host with the lower join
 * order, then the lower player id. Negative if `a` wins, positive if `b` wins, 0 if they're the
 * same reign (then `rev` decides).
 */
export function compareReigns(a: Reign, b: Reign): number {
  if (a.term !== b.term) return b.term - a.term;
  if (a.hostJoinOrder !== b.hostJoinOrder) return a.hostJoinOrder - b.hostJoinOrder;
  return a.hostId < b.hostId ? -1 : a.hostId > b.hostId ? 1 : 0;
}

/**
 * Who should be host once the current one has gone (SPEC §8.2): the present seat with the lowest
 * join order, ties to the lower id. Null if no seat is present.
 */
export function nextHost(state: RoomState): PlayerId | null {
  const candidates = state.seats
    .filter((s) => isPresent(state, s.id))
    .sort((a, b) => a.joinOrder - b.joinOrder || (a.id < b.id ? -1 : 1));
  return candidates[0]?.id ?? null;
}

/**
 * Takes over as host from the last snapshot, starting a new term (SPEC §8.2). Deadlines carry on
 * from where this client computed them, so countdowns keep running.
 */
export function assumeHost(state: RoomState, id: PlayerId): RoomState {
  return { ...state, hostId: id, term: state.term + 1, rev: state.rev + 1 };
}
