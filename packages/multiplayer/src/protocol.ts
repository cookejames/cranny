import { isValidSeed } from '@cranny/engine';
import { isCleanPlayerName, isValidRoomName } from './names.ts';
import { isPlayerId } from './random.ts';
import { MAX_SEATS, PIECE_COUNT } from './rules.ts';

/** The room protocol version (SPEC §5.2). Bump it for any change old clients can't read. */
export const PROTOCOL_VERSION = 1;
/** Messages bigger than this, as UTF-8 JSON, are dropped (SPEC §5.2). */
export const MAX_MESSAGE_BYTES = 8 * 1024;

/** 22 characters, base64url of 128 random bits. */
export type PlayerId = string;

export type Seat = {
  id: PlayerId;
  name: string;
  /** Assigned by the host, increasing; the lowest present seat is the next host. */
  joinOrder: number;
  score: number;
};

export type RoundStatus = 'lobby' | 'countdown' | 'playing' | 'closing';

/** The round as sent in a snapshot. Countdowns are time remaining when it was sent (SPEC §5.4). */
export type Round = {
  /** 0 before the first round. */
  number: number;
  status: RoundStatus;
  /** Null in the lobby. */
  grid: { version: number; seed: number } | null;
  /** Fixed when the round starts. */
  participants: PlayerId[];
  /** Lobby only. */
  ready: PlayerId[];
  /** Pieces placed, 0..9. */
  progress: Record<PlayerId, number>;
  /** In the order the host received them; `ms` is the player's own stopwatch. */
  finishes: { id: PlayerId; ms: number }[];
  readyClosesInMs: number | null;
  revealInMs: number | null;
  closesInMs: number | null;
};

export type RoundOutcome = 'finished' | 'dnf' | 'sat-out';

export type RoundResult = {
  number: number;
  places: { id: PlayerId; ms: number | null; points: number; outcome: RoundOutcome }[];
};

export type RoomSnapshot = {
  protocol: typeof PROTOCOL_VERSION;
  /** Canonical room name. */
  room: string;
  /**
   * Increases by one at every host handover. Snapshots are ordered by `term`, then by host rank
   * (`hostJoinOrder`, then `hostId`), then by `rev` (SPEC §8.2).
   */
  term: number;
  /** Increases with every change within a term; clients ignore anything older. */
  rev: number;
  hostId: PlayerId;
  hostJoinOrder: number;
  seats: Seat[];
  round: Round;
  lastResult: RoundResult | null;
};

/** Intents a client sends to the host (SPEC §5.2). */
export type ClientMessage =
  | { type: 'hello'; name: string }
  | { type: 'rename'; name: string }
  | { type: 'ready'; ready: boolean }
  | { type: 'progress'; round: number; placed: number }
  | { type: 'finished'; round: number; ms: number }
  | { type: 'leave' };

/** What the host sends (SPEC §5.2). A `reject` goes to everyone but only `to` acts on it. */
export type HostMessage =
  | { type: 'snapshot'; snapshot: RoomSnapshot }
  | { type: 'reject'; to: PlayerId; reason: 'full' | 'protocol' };

export type Message = ClientMessage | HostMessage;

/** A message as it goes over the transport. */
export type Envelope = Message & { protocol: number; from: PlayerId };

/** Why an incoming message was dropped, or what it asks of the receiver. */
export type DecodeFailure =
  | 'malformed'
  | 'oversized'
  /** `from` in the message isn't the sender the transport reported. */
  | 'spoofed'
  /** Sent by a newer client: this one should ask the player to refresh. */
  | 'newer-protocol'
  /** Sent by an older client: a host replies with `reject` `protocol`. */
  | 'older-protocol';

export type DecodeResult = { ok: true; message: Message } | { ok: false; reason: DecodeFailure };

/** Wraps a message for sending. */
export function encodeMessage(from: PlayerId, message: Message): Envelope {
  return { ...message, protocol: PROTOCOL_VERSION, from };
}

/**
 * Checks an incoming message (SPEC §5.2): size, protocol version, that `from` matches the sender
 * the transport reported, and the shape of every field. Returns a fresh copy holding only the known
 * fields. Never throws.
 *
 * @param from - The sender as the transport identified it.
 */
export function decodeMessage(raw: unknown, from: PlayerId): DecodeResult {
  let json: string | undefined;
  try {
    json = JSON.stringify(raw);
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (json === undefined) return { ok: false, reason: 'malformed' };
  if (utf8Length(json) > MAX_MESSAGE_BYTES) return { ok: false, reason: 'oversized' };
  if (!isRecord(raw) || !isCount(raw.protocol)) return { ok: false, reason: 'malformed' };
  if (raw.protocol > PROTOCOL_VERSION) return { ok: false, reason: 'newer-protocol' };
  if (raw.from !== from || !isPlayerId(from)) return { ok: false, reason: 'spoofed' };
  if (raw.protocol < PROTOCOL_VERSION) return { ok: false, reason: 'older-protocol' };
  const message = parseMessage(raw);
  return message ? { ok: true, message } : { ok: false, reason: 'malformed' };
}

/** The message fields of a record whose envelope has been checked, or null if any are wrong. */
function parseMessage(raw: Record<string, unknown>): Message | null {
  switch (raw.type) {
    case 'hello':
    case 'rename':
      return typeof raw.name === 'string' && raw.name.length <= 256
        ? { type: raw.type, name: raw.name }
        : null;
    case 'ready':
      return typeof raw.ready === 'boolean' ? { type: 'ready', ready: raw.ready } : null;
    case 'progress':
      return isCount(raw.round) && isCount(raw.placed) && raw.placed <= PIECE_COUNT
        ? { type: 'progress', round: raw.round, placed: raw.placed }
        : null;
    case 'finished':
      return isCount(raw.round) && isDuration(raw.ms)
        ? { type: 'finished', round: raw.round, ms: raw.ms }
        : null;
    case 'leave':
      return { type: 'leave' };
    case 'snapshot': {
      const snapshot = parseSnapshot(raw.snapshot);
      return snapshot ? { type: 'snapshot', snapshot } : null;
    }
    case 'reject':
      return isPlayerId(raw.to) && (raw.reason === 'full' || raw.reason === 'protocol')
        ? { type: 'reject', to: raw.to, reason: raw.reason }
        : null;
    default:
      return null;
  }
}

/** A validated copy of a snapshot, or null if anything in it is out of shape or range. */
export function parseSnapshot(raw: unknown): RoomSnapshot | null {
  if (!isRecord(raw) || raw.protocol !== PROTOCOL_VERSION) return null;
  const { room, term, rev, hostId, hostJoinOrder } = raw;
  if (typeof room !== 'string' || !isValidRoomName(room)) return null;
  if (!isCount(term) || !isCount(rev) || !isPlayerId(hostId) || !isCount(hostJoinOrder)) {
    return null;
  }
  const seats = parseSeats(raw.seats);
  const round = parseRound(raw.round);
  const lastResult = raw.lastResult === null ? null : parseResult(raw.lastResult);
  if (!seats || !round || lastResult === undefined) return null;
  return {
    protocol: PROTOCOL_VERSION,
    room,
    term,
    rev,
    hostId,
    hostJoinOrder,
    seats,
    round,
    lastResult,
  };
}

/** Validated seats with unique ids, or null. */
function parseSeats(raw: unknown): Seat[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_SEATS) return null;
  const seats: Seat[] = [];
  for (const s of raw) {
    if (!isRecord(s) || !isPlayerId(s.id) || !isCount(s.joinOrder) || !isCount(s.score)) {
      return null;
    }
    if (typeof s.name !== 'string' || !isCleanPlayerName(s.name)) return null;
    seats.push({ id: s.id, name: s.name, joinOrder: s.joinOrder, score: s.score });
  }
  return unique(seats.map((s) => s.id)) ? seats : null;
}

const STATUSES: readonly string[] = ['lobby', 'countdown', 'playing', 'closing'];

/** A validated round, or null. */
function parseRound(raw: unknown): Round | null {
  if (!isRecord(raw) || !isCount(raw.number) || !STATUSES.includes(raw.status as string)) {
    return null;
  }
  let grid: Round['grid'] = null;
  if (raw.grid !== null) {
    if (!isRecord(raw.grid) || !isCount(raw.grid.version) || raw.grid.version < 1) return null;
    if (typeof raw.grid.seed !== 'number' || !isValidSeed(raw.grid.seed)) return null;
    grid = { version: raw.grid.version, seed: raw.grid.seed };
  }
  const participants = parseIds(raw.participants);
  const ready = parseIds(raw.ready);
  const progress = parseProgress(raw.progress);
  const finishes = parseFinishes(raw.finishes);
  const readyClosesInMs = parseRemaining(raw.readyClosesInMs);
  const revealInMs = parseRemaining(raw.revealInMs);
  const closesInMs = parseRemaining(raw.closesInMs);
  if (!participants || !ready || !progress || !finishes) return null;
  if (readyClosesInMs === undefined || revealInMs === undefined || closesInMs === undefined) {
    return null;
  }
  return {
    number: raw.number,
    status: raw.status as RoundStatus,
    grid,
    participants,
    ready,
    progress,
    finishes,
    readyClosesInMs,
    revealInMs,
    closesInMs,
  };
}

/** A list of unique player ids, or null. */
function parseIds(raw: unknown): PlayerId[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_SEATS || !raw.every(isPlayerId)) return null;
  return unique(raw) ? [...raw] : null;
}

/** A progress map (player id → 0..9), or null. */
function parseProgress(raw: unknown): Record<PlayerId, number> | null {
  if (!isRecord(raw)) return null;
  const entries = Object.entries(raw);
  if (entries.length > MAX_SEATS) return null;
  const progress: Record<PlayerId, number> = {};
  for (const [id, placed] of entries) {
    if (!isPlayerId(id) || !isCount(placed) || placed > PIECE_COUNT) return null;
    progress[id] = placed;
  }
  return progress;
}

/** Finishes with unique ids, or null. */
function parseFinishes(raw: unknown): Round['finishes'] | null {
  if (!Array.isArray(raw) || raw.length > MAX_SEATS) return null;
  const finishes: Round['finishes'] = [];
  for (const f of raw) {
    if (!isRecord(f) || !isPlayerId(f.id) || !isDuration(f.ms)) return null;
    finishes.push({ id: f.id, ms: f.ms });
  }
  return unique(finishes.map((f) => f.id)) ? finishes : null;
}

const OUTCOMES: readonly string[] = ['finished', 'dnf', 'sat-out'];

/** A validated round result, or undefined (null is a valid "no result" value to the caller). */
function parseResult(raw: unknown): RoundResult | undefined {
  if (!isRecord(raw) || !isCount(raw.number)) return undefined;
  if (!Array.isArray(raw.places) || raw.places.length > MAX_SEATS) return undefined;
  const places: RoundResult['places'] = [];
  for (const p of raw.places) {
    if (!isRecord(p) || !isPlayerId(p.id) || !isCount(p.points) || p.points > 5) return undefined;
    if (!(p.ms === null || isDuration(p.ms)) || !OUTCOMES.includes(p.outcome as string)) {
      return undefined;
    }
    places.push({ id: p.id, ms: p.ms, points: p.points, outcome: p.outcome as RoundOutcome });
  }
  return unique(places.map((p) => p.id)) ? { number: raw.number, places } : undefined;
}

/** A countdown's remaining time: null, or a duration of at most an hour; undefined if invalid. */
function parseRemaining(raw: unknown): number | null | undefined {
  if (raw === null) return null;
  return isDuration(raw) && raw <= 3_600_000 ? raw : undefined;
}

/** Whether a value is a plain object (not null or an array). */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Whether a value is a non-negative safe integer. */
const isCount = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0;

/** Whether a value is a finite, non-negative number of milliseconds. */
const isDuration = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** Whether a list has no repeats. */
const unique = (values: readonly unknown[]) => new Set(values).size === values.length;

/** The length of a string once encoded as UTF-8, in bytes. */
export function utf8Length(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code < 0xdc00 && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next < 0xe000) {
        bytes += 4;
        i++;
      } else bytes += 3;
    } else bytes += 3;
  }
  return bytes;
}
