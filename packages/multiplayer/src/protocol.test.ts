import { describe, expect, it } from 'vitest';
import type { BoardCode } from './board.ts';
import {
  decodeMessage,
  encodeMessage,
  MAX_MESSAGE_BYTES,
  parseSnapshot,
  PROTOCOL_VERSION,
  utf8Length,
  type Message,
  type RoomSnapshot,
} from './protocol.ts';
import { randomPlayerId } from './random.ts';
import { seededRandom } from './testing/random.ts';

const random = seededRandom(3);
const ids = Array.from({ length: 17 }, () => randomPlayerId(random));
const [A, B, C] = ids as [string, string, string];

/** A full board code and a partial one. */
const FULL: BoardCode = [0, 17, 42, 99, 150, 201, 250, 280, 287];
const PARTIAL: BoardCode = [3, null, null, 64, null, null, null, 7, null];

/** A valid mid-round snapshot for three players. */
function snapshot(): RoomSnapshot {
  return {
    protocol: 1,
    room: 'amber-otter-quilt',
    term: 2,
    rev: 41,
    hostId: A,
    hostJoinOrder: 0,
    seats: [
      { id: A, name: 'Teal Otter', joinOrder: 0, score: 5 },
      { id: B, name: 'Rose Wren', joinOrder: 1, score: 3 },
      { id: C, name: 'Zoë 🦦', joinOrder: 2, score: 0 },
    ],
    round: {
      number: 3,
      status: 'closing',
      grid: { version: 1, seed: 123456 },
      participants: [A, B],
      ready: [],
      progress: { [A]: 9, [B]: 4 },
      finishes: [{ id: A, ms: 61234.5 }],
      readyClosesInMs: null,
      revealInMs: null,
      closesInMs: 17_250,
    },
    lastResult: {
      number: 2,
      grid: { version: 1, seed: 654321 },
      places: [
        { id: A, ms: 50_000, points: 5, outcome: 'finished', board: FULL },
        { id: B, ms: null, points: 0, outcome: 'dnf', board: PARTIAL },
        { id: C, ms: null, points: 0, outcome: 'sat-out' },
      ],
    },
  };
}

/** Sends a message through JSON, as a transport would. */
const wire = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

describe('decodeMessage', () => {
  const messages: Message[] = [
    { type: 'hello', name: 'Teal Otter' },
    { type: 'rename', name: 'Rose Wren' },
    { type: 'ready', ready: true },
    { type: 'ready', ready: false },
    { type: 'progress', round: 2, placed: 0 },
    { type: 'progress', round: 2, placed: 9 },
    { type: 'finished', round: 2, ms: 45_012.3 },
    { type: 'board', round: 2, board: FULL },
    { type: 'board', round: 2, board: PARTIAL },
    { type: 'leave' },
    { type: 'snapshot', snapshot: snapshot() },
    { type: 'reject', to: B, reason: 'full' },
    { type: 'reject', to: B, reason: 'protocol' },
  ];

  it.each(messages)('round-trips $type', (message) => {
    expect(decodeMessage(wire(encodeMessage(A, message)), A)).toEqual({ ok: true, message });
  });

  it('keeps only the known fields', () => {
    const raw = { ...encodeMessage(A, { type: 'ready', ready: true }), extra: 'x' };
    expect(decodeMessage(raw, A)).toEqual({ ok: true, message: { type: 'ready', ready: true } });
  });

  it('drops a message whose from is not the transport sender', () => {
    expect(decodeMessage(encodeMessage(A, { type: 'leave' }), B)).toEqual({
      ok: false,
      reason: 'spoofed',
    });
  });

  it('reports newer and older protocols', () => {
    const newer = { ...encodeMessage(A, { type: 'leave' }), protocol: PROTOCOL_VERSION + 1 };
    expect(decodeMessage(newer, A)).toEqual({ ok: false, reason: 'newer-protocol' });
    const older = { ...encodeMessage(A, { type: 'leave' }), protocol: 0 };
    expect(decodeMessage(older, A)).toEqual({ ok: false, reason: 'older-protocol' });
  });

  it('drops oversized messages', () => {
    const name = 'x'.repeat(MAX_MESSAGE_BYTES);
    expect(decodeMessage(encodeMessage(A, { type: 'hello', name }), A)).toEqual({
      ok: false,
      reason: 'oversized',
    });
  });

  it('counts the limit in UTF-8 bytes', () => {
    const name = '🦦'.repeat(MAX_MESSAGE_BYTES / 4);
    expect(name.length).toBeLessThan(MAX_MESSAGE_BYTES);
    expect(decodeMessage(encodeMessage(A, { type: 'hello', name }), A)).toMatchObject({
      reason: 'oversized',
    });
  });

  const envelope = { protocol: 1, from: A };
  it.each([
    ['null', null],
    ['a string', 'hello'],
    ['an array', [1, 2]],
    ['no protocol', { type: 'leave', from: A }],
    ['a fractional protocol', { type: 'leave', from: A, protocol: 1.5 }],
    ['an unknown type', { ...envelope, type: 'shout' }],
    ['a hello without a name', { ...envelope, type: 'hello' }],
    ['a hello with a numeric name', { ...envelope, type: 'hello', name: 3 }],
    ['a very long name', { ...envelope, type: 'rename', name: 'x'.repeat(257) }],
    ['ready as a string', { ...envelope, type: 'ready', ready: 'yes' }],
    ['10 pieces placed', { ...envelope, type: 'progress', round: 1, placed: 10 }],
    ['negative pieces', { ...envelope, type: 'progress', round: 1, placed: -1 }],
    ['a fractional round', { ...envelope, type: 'progress', round: 1.5, placed: 2 }],
    ['a negative time', { ...envelope, type: 'finished', round: 1, ms: -5 }],
    ['an infinite time', { ...envelope, type: 'finished', round: 1, ms: Infinity }],
    ['a reject to a bad id', { ...envelope, type: 'reject', to: 'nobody', reason: 'full' }],
    ['an unknown reject reason', { ...envelope, type: 'reject', to: B, reason: 'rude' }],
    ['a snapshot without a snapshot', { ...envelope, type: 'snapshot' }],
    ['a board without a board', { ...envelope, type: 'board', round: 1 }],
    ['a short board', { ...envelope, type: 'board', round: 1, board: [1, 2] }],
    [
      'a board value too big',
      { ...envelope, type: 'board', round: 1, board: [288, ...PARTIAL.slice(1)] },
    ],
    ['a board for a bad round', { ...envelope, type: 'board', round: -1, board: FULL }],
  ])('rejects %s', (_, raw) => {
    expect(decodeMessage(raw, A)).toMatchObject({ ok: false });
  });

  it('rejects values JSON cannot hold', () => {
    const cyclic: Record<string, unknown> = { ...envelope, type: 'leave' };
    cyclic.self = cyclic;
    expect(decodeMessage(cyclic, A)).toEqual({ ok: false, reason: 'malformed' });
    expect(decodeMessage(undefined, A)).toEqual({ ok: false, reason: 'malformed' });
    expect(decodeMessage({ ...envelope, type: 'leave', n: 10n }, A)).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  it('never throws on random junk', () => {
    const rand = seededRandom(9);
    const junk = (depth: number): unknown => {
      const r = rand(1)[0]! % 8;
      if (depth > 3 || r === 0) return null;
      if (r === 1) return rand(1)[0]! / 7;
      if (r === 2) return 'x'.repeat(rand(1)[0]! % 5);
      if (r === 3) return [junk(depth + 1), junk(depth + 1)];
      if (r === 4) return true;
      if (r === 5) return { type: 'snapshot', snapshot: junk(depth + 1), protocol: 1, from: A };
      return { a: junk(depth + 1), round: junk(depth + 1), status: 'lobby' };
    };
    for (let i = 0; i < 2000; i++) expect(() => decodeMessage(junk(0), A)).not.toThrow();
  });
});

describe('parseSnapshot', () => {
  it('accepts a valid snapshot and returns a copy', () => {
    const s = snapshot();
    const parsed = parseSnapshot(wire(s));
    expect(parsed).toEqual(s);
    expect(parsed).not.toBe(s);
  });

  it('accepts a lobby with no result yet', () => {
    const s = snapshot();
    s.lastResult = null;
    s.round = {
      ...s.round,
      status: 'lobby',
      grid: null,
      participants: [],
      ready: [B],
      progress: {},
      finishes: [],
      readyClosesInMs: 30_000,
      closesInMs: null,
    };
    expect(parseSnapshot(wire(s))).toEqual(s);
  });

  it('accepts a result without a grid or boards, as older hosts send', () => {
    const s = snapshot();
    delete s.lastResult!.grid;
    for (const p of s.lastResult!.places) delete p.board;
    const parsed = parseSnapshot(wire(s));
    expect(parsed).toEqual(s);
    expect(parsed!.lastResult).not.toHaveProperty('grid');
    expect(parsed!.lastResult!.places[0]).not.toHaveProperty('board');
  });

  const breaks: [string, (s: RoomSnapshot) => void][] = [
    ['a future protocol', (s) => ((s as { protocol: number }).protocol = 2)],
    ['a non-canonical room', (s) => (s.room = 'Amber Otter')],
    ['a negative rev', (s) => (s.rev = -1)],
    ['a fractional term', (s) => (s.term = 1.5)],
    ['a bad host id', (s) => (s.hostId = 'host')],
    [
      '17 seats',
      (s) => (s.seats = ids.map((id, i) => ({ id, name: 'N', joinOrder: i, score: 0 }))),
    ],
    ['duplicate seats', (s) => s.seats.push({ ...s.seats[0]! })],
    ['an unclean name', (s) => (s.seats[0]!.name = ' Teal ')],
    ['a control character in a name', (s) => (s.seats[0]!.name = 'Teal\u0007')],
    ['an empty name', (s) => (s.seats[0]!.name = '')],
    ['a negative score', (s) => (s.seats[0]!.score = -5)],
    ['an unknown status', (s) => ((s.round as { status: string }).status = 'paused')],
    ['an invalid seed', (s) => (s.round.grid = { version: 1, seed: 2 ** 30 })],
    ['grid version 0', (s) => (s.round.grid = { version: 0, seed: 1 })],
    ['duplicate participants', (s) => (s.round.participants = [A, A])],
    ['10 pieces placed', (s) => (s.round.progress[B] = 10)],
    ['a bad progress key', (s) => (s.round.progress['someone'] = 1)],
    ['a duplicate finish', (s) => s.round.finishes.push({ id: A, ms: 1 })],
    ['a negative countdown', (s) => (s.round.closesInMs = -1)],
    ['a countdown over an hour', (s) => (s.round.revealInMs = 3_600_001)],
    ['too many points', (s) => (s.lastResult!.places[0]!.points = 6)],
    [
      'an unknown outcome',
      (s) => ((s.lastResult!.places[0] as { outcome: string }).outcome = 'won'),
    ],
    ['a malformed board', (s) => (s.lastResult!.places[0]!.board = [1, 2, 3])],
    ['a result grid with a bad seed', (s) => (s.lastResult!.grid = { version: 1, seed: -1 })],
    ['a null result grid', (s) => ((s.lastResult as { grid: unknown }).grid = null)],
    ['a missing round', (s) => delete (s as Partial<RoomSnapshot>).round],
  ];

  it.each(breaks)('rejects %s', (_, change) => {
    const s = snapshot();
    change(s);
    expect(parseSnapshot(wire(s))).toBeNull();
  });

  it('fits 16 seats with long names and full results well inside the size limit', () => {
    const s = snapshot();
    const name = '🦦'.repeat(16);
    const sixteen = ids.slice(0, 16);
    s.seats = sixteen.map((id, i) => ({ id, name, joinOrder: i, score: 999 }));
    s.round.participants = sixteen.slice(0, 8);
    s.round.progress = Object.fromEntries(sixteen.slice(0, 8).map((id) => [id, 9]));
    s.round.finishes = sixteen.slice(0, 8).map((id) => ({ id, ms: 123_456.789 }));
    s.lastResult!.places = sixteen.map((id) => ({
      id,
      ms: 123_456.789,
      points: 1,
      outcome: 'finished',
      board: [287, 287, 287, 287, 287, 287, 287, 287, 287],
    }));
    const size = utf8Length(JSON.stringify(encodeMessage(A, { type: 'snapshot', snapshot: s })));
    expect(size).toBeLessThan(MAX_MESSAGE_BYTES * 0.75);
  });
});

describe('utf8Length', () => {
  it.each([
    ['', 0],
    ['abc', 3],
    ['é', 2],
    ['€', 3],
    ['🦦', 4],
    ['\ud83e', 3], // a lone surrogate is encoded as U+FFFD
  ])('%j is %d bytes', (text, bytes) => {
    expect(utf8Length(text)).toBe(bytes);
  });
});
