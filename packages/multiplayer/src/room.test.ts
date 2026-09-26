import { CURRENT_VERSION } from '@cranny/engine';
import { describe, expect, it } from 'vitest';
import type { ClientMessage, PlayerId } from './protocol.ts';
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
import {
  CLOSE_OUT_MS,
  MAX_PRESENT,
  MAX_SEATS,
  READY_TIMEOUT_MS,
  REVEAL_COUNTDOWN_MS,
} from './rules.ts';

const SEED = 4242;

/** A small driver for the reducer with a controllable clock. */
class Room {
  state: RoomState;
  now = 1_000_000;

  /** A room hosted by `players[0]` with every player seated and present, in order. */
  constructor(players: PlayerId[]) {
    this.state = newRoom('amber-otter-quilt', players[0]!, 1);
    this.presence(players);
    for (const id of players) this.send(id, { type: 'hello', name: `Player ${id}` });
  }

  /** Applies an event at the current time. */
  event(event: RoomEvent): RoomState {
    this.state = roomReducer(this.state, event, { now: this.now, seed: SEED });
    return this.state;
  }

  /** Applies an intent from a player. */
  send(from: PlayerId, message: ClientMessage): RoomState {
    return this.event({ type: 'intent', from, message });
  }

  /** Sets who is connected. */
  presence(present: PlayerId[]): RoomState {
    return this.event({ type: 'presence', present });
  }

  /** Moves the clock on and ticks. */
  advance(ms: number): RoomState {
    this.now += ms;
    return this.event({ type: 'tick' });
  }

  /** Marks players ready. */
  ready(...ids: PlayerId[]): RoomState {
    for (const id of ids) this.send(id, { type: 'ready', ready: true });
    return this.state;
  }

  /** Readies everyone present, then runs the 3-2-1 so the round is being played. */
  play(...ids: PlayerId[]): RoomState {
    this.ready(...ids);
    return this.advance(REVEAL_COUNTDOWN_MS);
  }

  /** Reports a finish for the current round. */
  finish(id: PlayerId, ms = 60_000): RoomState {
    return this.send(id, { type: 'finished', round: this.state.round.number, ms });
  }

  score(id: PlayerId): number | undefined {
    return this.state.seats.find((s) => s.id === id)?.score;
  }
}

describe('seats', () => {
  it('seats players in join order, starting at 0', () => {
    const room = new Room(['a', 'b', 'c']);
    expect(room.state.seats).toEqual([
      { id: 'a', name: 'Player a', joinOrder: 0, score: 0 },
      { id: 'b', name: 'Player b', joinOrder: 1, score: 0 },
      { id: 'c', name: 'Player c', joinOrder: 2, score: 0 },
    ]);
  });

  it('updates the name when a known player says hello again', () => {
    const room = new Room(['a', 'b']);
    room.send('b', { type: 'hello', name: 'Rose Wren' });
    expect(room.state.seats[1]).toMatchObject({ id: 'b', name: 'Rose Wren', joinOrder: 1 });
    expect(room.state.seats).toHaveLength(2);
  });

  it('cleans names, and falls back to "Player" for a hello with nothing left', () => {
    const room = new Room(['a']);
    room.presence(['a', 'b', 'c']);
    room.send('b', { type: 'hello', name: '  Rose\u0007   Wren  ' });
    room.send('c', { type: 'hello', name: '\u0000' });
    expect(room.state.seats.map((s) => s.name)).toEqual(['Player a', 'Rose Wren', 'Player']);
  });

  it('renames, ignoring empty names and players without a seat', () => {
    const room = new Room(['a', 'b']);
    room.send('b', { type: 'rename', name: 'Teal Otter' });
    const before = room.state;
    room.send('b', { type: 'rename', name: '   ' });
    room.send('z', { type: 'rename', name: 'Nobody' });
    expect(room.state).toBe(before);
    expect(room.state.seats[1]!.name).toBe('Teal Otter');
  });

  it('turns away a ninth present player', () => {
    const eight = Array.from({ length: MAX_PRESENT }, (_, i) => `p${i}`);
    const room = new Room(eight);
    room.presence([...eight, 'late']);
    room.send('late', { type: 'hello', name: 'Late' });
    expect(room.state.seats).toHaveLength(MAX_PRESENT);
  });

  it('seats a player once someone else is away, up to 16 seats', () => {
    const room = new Room(Array.from({ length: MAX_PRESENT }, (_, i) => `p${i}`));
    for (let i = MAX_PRESENT; i < MAX_SEATS + 1; i++) {
      // The earliest present player drops each time, so eight stay present.
      const present = room.state.seats.map((s) => s.id).slice(i - MAX_PRESENT + 1);
      room.presence([...present, `p${i}`]);
      room.send(`p${i}`, { type: 'hello', name: `P${i}` });
    }
    expect(room.state.seats).toHaveLength(MAX_SEATS);
    expect(room.state.seats.some((s) => s.id === `p${MAX_SEATS}`)).toBe(false);
  });

  it('keeps a returning player’s seat and points', () => {
    const room = new Room(['a', 'b']);
    room.play('a', 'b');
    room.finish('a');
    room.finish('b');
    room.presence(['a']);
    room.presence(['a', 'b']);
    room.send('b', { type: 'hello', name: 'Player b' });
    expect(room.score('b')).toBe(3);
    expect(room.state.seats).toHaveLength(2);
  });

  it('bumps rev only when something in the snapshot changes', () => {
    const room = new Room(['a', 'b']);
    const { rev } = room.state;
    room.send('b', { type: 'hello', name: 'Player b' });
    room.advance(10);
    expect(room.state.rev).toBe(rev);
    room.send('b', { type: 'ready', ready: true });
    expect(room.state.rev).toBe(rev + 1);
  });
});

describe('ready and starting a round', () => {
  it('starts the 3-2-1 as soon as every present player is ready', () => {
    const room = new Room(['a', 'b', 'c']);
    room.ready('a', 'b');
    expect(room.state.round.status).toBe('lobby');
    room.ready('c');
    expect(room.state.round).toMatchObject({
      number: 1,
      status: 'countdown',
      grid: { version: CURRENT_VERSION, seed: SEED },
      participants: ['a', 'b', 'c'],
      ready: [],
      progress: { a: 0, b: 0, c: 0 },
      finishes: [],
      readyClosesAt: null,
      revealAt: room.now + REVEAL_COUNTDOWN_MS,
    });
  });

  it('needs at least two players', () => {
    const room = new Room(['a']);
    room.ready('a');
    expect(room.state.round.status).toBe('lobby');
    expect(room.state.round.readyClosesAt).toBeNull();
  });

  it('only counts present players', () => {
    const room = new Room(['a', 'b', 'c']);
    room.ready('a', 'b');
    room.presence(['a', 'b']);
    expect(room.state.round).toMatchObject({ status: 'countdown', participants: ['a', 'b'] });
  });

  it('un-readies a player who drops', () => {
    const room = new Room(['a', 'b', 'c']);
    room.ready('c');
    room.presence(['a', 'b']);
    room.presence(['a', 'b', 'c']);
    expect(room.state.round.ready).toEqual([]);
  });

  it('ignores ready from someone without a seat, repeats, and ready outside the lobby', () => {
    const room = new Room(['a', 'b', 'c']);
    const start = room.state;
    room.send('z', { type: 'ready', ready: true });
    room.send('a', { type: 'ready', ready: false });
    expect(room.state).toBe(start);
    room.ready('a', 'b', 'c');
    const counting = room.state;
    room.send('a', { type: 'ready', ready: false });
    expect(room.state).toBe(counting);
  });

  it('runs the ready timeout once 2+ are ready and they are more than half', () => {
    const room = new Room(['a', 'b', 'c', 'd']);
    room.ready('a', 'b');
    expect(room.state.round.readyClosesAt).toBeNull(); // 2 of 4 is only half
    room.ready('c');
    expect(room.state.round.readyClosesAt).toBe(room.now + READY_TIMEOUT_MS);
    room.advance(READY_TIMEOUT_MS - 1);
    expect(room.state.round.status).toBe('lobby');
    room.advance(1);
    expect(room.state.round).toMatchObject({ status: 'countdown', participants: ['a', 'b', 'c'] });
  });

  it('keeps the ready deadline steady as more players get ready', () => {
    const room = new Room(['a', 'b', 'c', 'd', 'e']);
    room.ready('a', 'b', 'c');
    const deadline = room.state.round.readyClosesAt;
    room.advance(10_000);
    room.ready('d');
    expect(room.state.round.readyClosesAt).toBe(deadline);
  });

  it('cancels the ready timeout if the condition stops holding', () => {
    const room = new Room(['a', 'b', 'c']);
    room.ready('a', 'b');
    expect(room.state.round.readyClosesAt).not.toBeNull();
    room.send('b', { type: 'ready', ready: false });
    expect(room.state.round.readyClosesAt).toBeNull();
    room.advance(READY_TIMEOUT_MS);
    expect(room.state.round.status).toBe('lobby');
  });

  it('cancels the ready timeout when a newcomer makes the ready players half or fewer', () => {
    const room = new Room(['a', 'b', 'c']);
    room.ready('a', 'b');
    room.presence(['a', 'b', 'c', 'd']);
    room.send('d', { type: 'hello', name: 'D' });
    expect(room.state.round.readyClosesAt).toBeNull();
  });

  it('starts when the last player who isn’t ready leaves', () => {
    const room = new Room(['a', 'b', 'c']);
    room.ready('a', 'b');
    room.send('c', { type: 'leave' });
    expect(room.state.round.status).toBe('countdown');
  });

  it('can’t be stopped once the 3-2-1 has begun', () => {
    const room = new Room(['a', 'b', 'c']);
    room.ready('a', 'b', 'c');
    room.presence(['a', 'b']);
    room.send('b', { type: 'ready', ready: false });
    expect(room.state.round).toMatchObject({ status: 'countdown', participants: ['a', 'b', 'c'] });
    room.advance(REVEAL_COUNTDOWN_MS);
    expect(room.state.round.status).toBe('playing');
  });
});

describe('the reveal and playing', () => {
  it('reveals when the 3-2-1 reaches zero', () => {
    const room = new Room(['a', 'b']);
    room.ready('a', 'b');
    room.advance(REVEAL_COUNTDOWN_MS - 1);
    expect(room.state.round.status).toBe('countdown');
    room.advance(1);
    expect(room.state.round).toMatchObject({ status: 'playing', revealAt: null });
  });

  it('records progress from participants in the current round only', () => {
    const room = new Room(['a', 'b', 'c']);
    room.ready('a', 'b');
    room.advance(READY_TIMEOUT_MS + REVEAL_COUNTDOWN_MS);
    room.send('a', { type: 'progress', round: 1, placed: 4 });
    room.send('c', { type: 'progress', round: 1, placed: 4 }); // sat out
    room.send('b', { type: 'progress', round: 0, placed: 4 }); // wrong round
    expect(room.state.round.progress).toEqual({ a: 4, b: 0 });
  });

  it('keeps waiting with no time limit until someone finishes', () => {
    const room = new Room(['a', 'b']);
    room.play('a', 'b');
    room.advance(24 * 60 * 60 * 1000);
    expect(room.state.round.status).toBe('playing');
  });

  it('keeps playing while every participant is away', () => {
    const room = new Room(['a', 'b', 'c']);
    room.ready('a', 'b');
    room.advance(READY_TIMEOUT_MS + REVEAL_COUNTDOWN_MS);
    room.presence(['c']);
    room.advance(60_000);
    expect(room.state.round.status).toBe('playing');
  });
});

describe('the close-out and the end of a round', () => {
  it('starts a 30 s close-out at the first finish', () => {
    const room = new Room(['a', 'b', 'c']);
    room.play('a', 'b', 'c');
    room.send('b', { type: 'progress', round: 1, placed: 8 });
    room.finish('b', 61_000);
    expect(room.state.round).toMatchObject({
      status: 'closing',
      finishes: [{ id: 'b', ms: 61_000 }],
      progress: { a: 0, b: 9, c: 0 },
      closesAt: room.now + CLOSE_OUT_MS,
    });
  });

  it('ends the round when the close-out runs out, scoring into the totals', () => {
    const room = new Room(['a', 'b', 'c', 'd']);
    room.ready('a', 'b', 'c');
    room.advance(READY_TIMEOUT_MS + REVEAL_COUNTDOWN_MS);
    room.send('c', { type: 'progress', round: 1, placed: 6 });
    room.finish('b');
    room.advance(10_000);
    room.finish('a');
    room.advance(CLOSE_OUT_MS - 10_001);
    expect(room.state.round.status).toBe('closing');
    room.advance(1);
    expect(room.state.round).toMatchObject({ number: 1, status: 'lobby', grid: null });
    expect(room.state.lastResult).toEqual({
      number: 1,
      grid: { version: CURRENT_VERSION, seed: SEED },
      places: [
        { id: 'b', ms: 60_000, points: 5, outcome: 'finished' },
        { id: 'a', ms: 60_000, points: 3, outcome: 'finished' },
        { id: 'c', ms: null, points: 0, outcome: 'dnf' },
        { id: 'd', ms: null, points: 0, outcome: 'sat-out' },
      ],
    });
    expect(room.state.seats.map((s) => s.score)).toEqual([3, 5, 0, 0]);
  });

  it('ends early once every present participant has finished', () => {
    const room = new Room(['a', 'b', 'c']);
    room.play('a', 'b', 'c');
    room.finish('a');
    room.presence(['a', 'b']);
    expect(room.state.round.status).toBe('closing');
    room.finish('b');
    expect(room.state.round.status).toBe('lobby');
    expect(room.state.lastResult!.places.find((p) => p.id === 'c')).toMatchObject({
      outcome: 'dnf',
      points: 0,
    });
  });

  it('ends early when the last unfinished participant drops', () => {
    const room = new Room(['a', 'b']);
    room.play('a', 'b');
    room.finish('a');
    room.presence(['a']);
    expect(room.state.round.status).toBe('lobby');
    expect(room.score('a')).toBe(5);
  });

  it('adds totals up across rounds', () => {
    const room = new Room(['a', 'b', 'c']);
    for (const order of [
      ['a', 'b', 'c'],
      ['c', 'b', 'a'],
      ['b', 'a', 'c'],
    ]) {
      room.play('a', 'b', 'c');
      for (const id of order) room.finish(id);
    }
    expect(room.state.round.number).toBe(3);
    expect(room.state.seats.map((s) => s.score)).toEqual([5 + 2 + 3, 3 + 3 + 5, 2 + 5 + 2]);
  });

  it('ignores a repeated finish, a finish for another round and one from a non-participant', () => {
    const room = new Room(['a', 'b', 'c', 'd']);
    room.ready('a', 'b', 'c');
    room.advance(READY_TIMEOUT_MS + REVEAL_COUNTDOWN_MS);
    room.finish('a');
    const after = room.state;
    room.finish('a');
    room.send('b', { type: 'finished', round: 7, ms: 1 });
    room.finish('d');
    room.send('a', { type: 'progress', round: 1, placed: 3 });
    expect(room.state).toBe(after);
  });

  it('ignores progress and finishes that arrive after the round ended', () => {
    const room = new Room(['a', 'b']);
    room.play('a', 'b');
    room.finish('a');
    room.advance(CLOSE_OUT_MS);
    const ended = room.state;
    room.send('b', { type: 'finished', round: 1, ms: 1 });
    room.send('b', { type: 'progress', round: 1, placed: 9 });
    expect(room.state).toBe(ended);
  });

  it('gives 0 to a participant who is away when the close-out ends', () => {
    const room = new Room(['a', 'b', 'c']);
    room.play('a', 'b', 'c');
    room.send('c', { type: 'progress', round: 1, placed: 8 });
    room.finish('a');
    room.presence(['a', 'b']);
    room.advance(CLOSE_OUT_MS);
    expect(room.score('c')).toBe(0);
    expect(room.state.lastResult!.places.map((p) => p.outcome)).toEqual(['finished', 'dnf', 'dnf']);
  });
});

describe('boards after a round (specs/2026-09-26-player-grids)', () => {
  const FULL = [0, 17, 42, 99, 150, 201, 250, 280, 287];
  const PARTIAL = [3, null, null, 64, null, null, null, 7, null];

  /** A room whose round 1 has ended: a finished, b didn't, c sat out. */
  function ended() {
    const room = new Room(['a', 'b', 'c']);
    room.ready('a', 'b');
    room.advance(READY_TIMEOUT_MS + REVEAL_COUNTDOWN_MS);
    room.finish('a');
    room.advance(CLOSE_OUT_MS);
    expect(room.state.round.status).toBe('lobby');
    return room;
  }

  /** The board stored for a player in the last result. */
  const boardOf = (room: Room, id: PlayerId) =>
    room.state.lastResult!.places.find((p) => p.id === id)?.board;

  it('stores boards from finishers and players who didn’t finish', () => {
    const room = ended();
    const rev = room.state.rev;
    room.send('a', { type: 'board', round: 1, board: FULL });
    room.send('b', { type: 'board', round: 1, board: PARTIAL });
    expect(boardOf(room, 'a')).toEqual(FULL);
    expect(boardOf(room, 'b')).toEqual(PARTIAL);
    expect(room.state.rev).toBe(rev + 2);
  });

  it('ignores a board from someone who sat out, a stranger, the wrong round, or a repeat', () => {
    const room = ended();
    room.send('a', { type: 'board', round: 1, board: FULL });
    const after = room.state;
    room.send('a', { type: 'board', round: 1, board: PARTIAL });
    room.send('b', { type: 'board', round: 2, board: PARTIAL });
    room.send('c', { type: 'board', round: 1, board: PARTIAL });
    room.send('z', { type: 'board', round: 1, board: PARTIAL });
    expect(room.state).toBe(after);
  });

  it('ignores a board before any round has ended', () => {
    const room = new Room(['a', 'b']);
    room.play('a', 'b');
    const playing = room.state;
    room.send('a', { type: 'board', round: 1, board: FULL });
    expect(room.state).toBe(playing);
  });

  it('never puts boards in the round being played', () => {
    const room = ended();
    room.send('a', { type: 'board', round: 1, board: FULL });
    room.play('a', 'b');
    expect(JSON.stringify(room.state.round)).not.toContain('board');
  });

  it('keeps the boards in snapshots, and drops a player’s board when they leave', () => {
    const room = ended();
    room.send('a', { type: 'board', round: 1, board: FULL });
    expect(toSnapshot(room.state, room.now).lastResult!.places[0]!.board).toEqual(FULL);
    room.send('a', { type: 'leave' });
    expect(boardOf(room, 'a')).toBeUndefined();
  });
});

describe('late joiners and sitting out', () => {
  it('seats a player who joins mid-round without adding them to the round', () => {
    const room = new Room(['a', 'b']);
    room.play('a', 'b');
    room.presence(['a', 'b', 'c']);
    room.send('c', { type: 'hello', name: 'C' });
    room.send('c', { type: 'progress', round: 1, placed: 3 });
    expect(room.state.round.participants).toEqual(['a', 'b']);
    expect(room.state.round.progress).toEqual({ a: 0, b: 0 });
    room.finish('a');
    room.finish('b');
    expect(room.state.lastResult!.places.at(-1)).toEqual({
      id: 'c',
      ms: null,
      points: 0,
      outcome: 'sat-out',
    });
    room.ready('a', 'b', 'c');
    expect(room.state.round.participants).toEqual(['a', 'b', 'c']);
  });

  it('lets a participant who dropped and came back carry on', () => {
    const room = new Room(['a', 'b']);
    room.play('a', 'b');
    room.presence(['a']);
    room.presence(['a', 'b']);
    room.send('b', { type: 'hello', name: 'Player b' });
    room.send('b', { type: 'progress', round: 1, placed: 5 });
    expect(room.state.round.progress.b).toBe(5);
  });
});

describe('leave', () => {
  it('removes the seat, its score, its ready and its place in the last result', () => {
    const room = new Room(['a', 'b', 'c']);
    room.play('a', 'b', 'c');
    room.finish('b');
    room.finish('a');
    room.finish('c');
    room.ready('c');
    room.send('b', { type: 'leave' });
    expect(room.state.seats.map((s) => s.id)).toEqual(['a', 'c']);
    expect(room.state.lastResult!.places.map((p) => p.id)).toEqual(['a', 'c']);
    room.send('c', { type: 'leave' });
    expect(room.state.round.ready).toEqual([]);
  });

  it('takes a participant out of the round in progress', () => {
    const room = new Room(['a', 'b', 'c']);
    room.play('a', 'b', 'c');
    room.finish('a');
    room.send('a', { type: 'leave' });
    expect(room.state.round).toMatchObject({
      status: 'closing',
      participants: ['b', 'c'],
      progress: { b: 0, c: 0 },
      finishes: [],
    });
    room.finish('b');
    room.finish('c');
    expect(room.state.lastResult!.places.map((p) => [p.id, p.points])).toEqual([
      ['b', 5],
      ['c', 3],
    ]);
  });

  it('ends the round if every participant leaves', () => {
    const room = new Room(['a', 'b', 'c']);
    room.ready('a', 'b');
    room.advance(READY_TIMEOUT_MS + REVEAL_COUNTDOWN_MS);
    room.send('a', { type: 'leave' });
    room.send('b', { type: 'leave' });
    expect(room.state.round.status).toBe('lobby');
    expect(room.state.lastResult!.places).toEqual([
      { id: 'c', ms: null, points: 0, outcome: 'sat-out' },
    ]);
  });

  it('gives a player who rejoins after leaving a new seat at 0', () => {
    const room = new Room(['a', 'b']);
    room.play('a', 'b');
    room.finish('b');
    room.finish('a');
    room.send('b', { type: 'leave' });
    room.send('b', { type: 'hello', name: 'Player b' });
    room.presence(['a', 'b']);
    const seat = room.state.seats.find((s) => s.id === 'b');
    expect(seat).toMatchObject({ name: 'Player b', score: 0 });
    expect(seat!.joinOrder).toBeGreaterThan(room.state.seats[0]!.joinOrder);
    expect(nextHost(room.state)).toBe('a');
  });

  it('ignores a leave from someone without a seat', () => {
    const room = new Room(['a']);
    const before = room.state;
    room.send('z', { type: 'leave' });
    expect(room.state).toBe(before);
  });
});

describe('snapshots', () => {
  it('sends countdowns as time remaining and turns them back into local deadlines', () => {
    const room = new Room(['a', 'b', 'c']);
    room.ready('a', 'b');
    room.advance(12_000);
    const snapshot = toSnapshot(room.state, room.now);
    expect(snapshot.round.readyClosesInMs).toBe(READY_TIMEOUT_MS - 12_000);
    expect(snapshot).toMatchObject({ protocol: 1, hostId: 'a', hostJoinOrder: 0, term: 1 });
    const local = fromSnapshot(snapshot, 5_000, ['a', 'b']);
    expect(local.round.readyClosesAt).toBe(5_000 + READY_TIMEOUT_MS - 12_000);
    expect(local.present).toEqual(['a', 'b']);
    expect(toSnapshot(local, 5_000)).toEqual(snapshot);
  });

  it('never sends a negative time remaining', () => {
    const room = new Room(['a', 'b']);
    room.ready('a', 'b');
    expect(toSnapshot(room.state, room.now + 10_000).round.revealInMs).toBe(0);
  });
});

describe('hosts', () => {
  it('picks the present seat with the lowest join order as the next host', () => {
    const room = new Room(['a', 'b', 'c']);
    room.presence(['b', 'c']);
    expect(nextHost(room.state)).toBe('b');
    room.presence(['c', 'x']);
    expect(nextHost(room.state)).toBe('c');
    room.presence(['x']);
    expect(nextHost(room.state)).toBeNull();
  });

  it('starts a new term on handover and keeps the countdowns running', () => {
    const room = new Room(['a', 'b', 'c']);
    room.play('a', 'b', 'c');
    room.finish('a');
    const copy = fromSnapshot(toSnapshot(room.state, room.now), room.now, ['b', 'c']);
    const taken = assumeHost(copy, 'b');
    expect(taken).toMatchObject({ hostId: 'b', term: 2 });
    expect(taken.round.closesAt).toBe(room.state.round.closesAt);
    const after = roomReducer(taken, { type: 'tick' }, { now: room.now + CLOSE_OUT_MS, seed: 1 });
    expect(after.round.status).toBe('lobby');
  });

  it('orders reigns by term, then host join order, then host id', () => {
    const r = (term: number, hostJoinOrder: number, hostId: string) => ({
      term,
      hostJoinOrder,
      hostId,
    });
    expect(compareReigns(r(2, 5, 'z'), r(1, 0, 'a'))).toBeLessThan(0);
    expect(compareReigns(r(1, 0, 'z'), r(1, 1, 'a'))).toBeLessThan(0);
    expect(compareReigns(r(1, 1, 'a'), r(1, 1, 'b'))).toBeLessThan(0);
    expect(compareReigns(r(1, 1, 'b'), r(1, 1, 'a'))).toBeGreaterThan(0);
    expect(compareReigns(r(1, 1, 'a'), r(1, 1, 'a'))).toBe(0);
  });

  it('reads the reign from the host’s seat', () => {
    const room = new Room(['a', 'b']);
    expect(reignOf(assumeHost(room.state, 'b'))).toEqual({
      term: 2,
      hostId: 'b',
      hostJoinOrder: 1,
    });
  });
});
