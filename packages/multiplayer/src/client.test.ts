import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HELLO_RETRY_MS, HOST_FALLBACK_MS, RoomClient, SNAPSHOT_INTERVAL_MS } from './client.ts';
import { isDirectoryError, type RoomTicket } from './directory.ts';
import { encodeMessage, type PlayerId } from './protocol.ts';
import { CLOSE_OUT_MS, MAX_PRESENT, READY_TIMEOUT_MS, REVEAL_COUNTDOWN_MS } from './rules.ts';
import { FakeDirectory } from './testing/fakeDirectory.ts';
import { FakeTransport, type FakeConnection } from './testing/fakeTransport.ts';
import type { RoomTransport } from './transport.ts';
import { seededRandom } from './testing/random.ts';

const ROOM = 'amber-otter-quilt';
const LATENCY_MS = 20;
const DROP_DETECT_MS = 25_000;
/** Enough time for any message and the snapshot it prompts to arrive everywhere. */
const SETTLE_MS = 500;

/** A readable, valid player id; ids sort in the order of their letter. */
const id = (letter: string): PlayerId => letter.repeat(22);
const [A, B, C, D] = ['A', 'B', 'C', 'D'].map(id) as [PlayerId, PlayerId, PlayerId, PlayerId];

let transport: FakeTransport;
let directory: FakeDirectory;
let clients: RoomClient[];
let nextSeed = 1;

beforeEach(() => {
  vi.useFakeTimers();
  transport = new FakeTransport({ latencyMs: LATENCY_MS, dropDetectMs: DROP_DETECT_MS });
  directory = new FakeDirectory({
    occupied: (channel) => transport.presenceOf(channel).length > 0,
  });
  clients = [];
});

afterEach(async () => {
  for (const client of clients) await client.close();
  vi.useRealTimers();
});

/** Lets time pass on every clock, running whatever it triggers. */
const wait = (ms = SETTLE_MS) => vi.advanceTimersByTimeAsync(ms);

/** A ticket for the room: creates it for the first player, joins it for the rest. */
async function ticketFor(
  self: PlayerId,
  how: 'create' | 'join' | 'rejoin' | boolean,
): Promise<RoomTicket> {
  const call = how === true ? 'create' : how === false ? 'join' : how;
  const result = await directory[call](ROOM, self);
  if (isDirectoryError(result)) throw new Error(result.error);
  return result;
}

/** Starts a player's client and lets the room settle. */
async function join(
  self: PlayerId,
  options: { create?: boolean; how?: 'create' | 'join' | 'rejoin'; name?: string } = {},
) {
  const client = new RoomClient({
    transport,
    ticket: await ticketFor(self, options.how ?? options.create ?? false),
    self,
    name: options.name ?? `Player ${self[0]}`,
    random: seededRandom(nextSeed++),
  });
  clients.push(client);
  await client.start();
  await wait();
  return client;
}

/** A room created by A, with the other players joined in order. */
async function room(...others: PlayerId[]) {
  const host = await join(A, { create: true });
  const rest = [];
  for (const other of others) rest.push(await join(other));
  return [host, ...rest];
}

/** The live fake connection for a player (the most recent one). */
function connectionOf(self: PlayerId): FakeConnection {
  const found = transport.connections().filter((c) => c.self === self && c.state !== 'closed');
  return found.at(-1)!;
}

/** The room state a client sees. */
const stateOf = (client: RoomClient) => client.view().room!;

/** Readies everyone and runs the 3-2-1, so the round is being played. */
async function playRound(players: RoomClient[]) {
  for (const p of players) p.setReady(true);
  await wait();
  await wait(REVEAL_COUNTDOWN_MS);
}

/** Expects every client to hold the same snapshot (deadlines are local, so they differ). */
function expectAgreement(players: RoomClient[]) {
  const [first, ...rest] = players.map((p) => {
    const { room, term, rev, hostId, seats, lastResult, round } = stateOf(p);
    const { number, status, grid, participants, ready, progress, finishes } = round;
    const shared = { number, status, grid, participants, ready, progress, finishes };
    return { room, term, rev, hostId, seats, lastResult, round: shared };
  });
  for (const other of rest) expect(other).toEqual(first);
}

describe('simulations', () => {
  it('plays a full round with three players', async () => {
    const [a, b, c] = await room(B, C);
    expect(a!.view()).toMatchObject({ phase: 'in-room', hosting: true });
    for (const p of [b!, c!]) expect(p.view()).toMatchObject({ phase: 'in-room', hosting: false });
    expect(stateOf(c!).seats.map((s) => [s.id, s.joinOrder])).toEqual([
      [A, 0],
      [B, 1],
      [C, 2],
    ]);

    for (const p of [a!, b!, c!]) p.setReady(true);
    await wait();
    const round = stateOf(b!).round;
    expect(round).toMatchObject({ number: 1, status: 'countdown', participants: [A, B, C] });
    const grid = round.grid;
    expect(stateOf(a!).round.grid).toEqual(grid);
    expect(stateOf(c!).round.grid).toEqual(grid);
    // Each client counts down to its own local reveal, a latency later than the host's.
    expect(stateOf(b!).round.revealAt! - stateOf(a!).round.revealAt!).toBeLessThanOrEqual(
      2 * LATENCY_MS,
    );

    await wait(REVEAL_COUNTDOWN_MS);
    for (const p of [a!, b!, c!]) expect(stateOf(p).round.status).toBe('playing');

    b!.reportProgress(1, 4);
    await wait();
    expect(stateOf(c!).round.progress[B]).toBe(4);

    c!.reportFinished(1, 51_000);
    await wait();
    expect(stateOf(a!).round.status).toBe('closing');
    a!.reportFinished(1, 50_000);
    await wait();
    expect(stateOf(b!).round.finishes.map((f) => f.id)).toEqual([C, A]);

    await wait(CLOSE_OUT_MS);
    expectAgreement([a!, b!, c!]);
    expect(stateOf(b!).lastResult).toEqual({
      number: 1,
      places: [
        { id: C, ms: 51_000, points: 5, outcome: 'finished' },
        { id: A, ms: 50_000, points: 3, outcome: 'finished' },
        { id: B, ms: null, points: 0, outcome: 'dnf' },
      ],
    });
    expect(stateOf(b!).seats.map((s) => s.score)).toEqual([3, 0, 5]);
  });

  it('hands over when the host drops mid-round, and the close-out keeps running', async () => {
    const [a, b, c] = await room(B, C);
    await playRound([a!, b!, c!]);
    b!.reportFinished(1, 40_000);
    await wait(LATENCY_MS * 4);
    const closesAt = stateOf(c!).round.closesAt!;
    expect(stateOf(c!).round.status).toBe('closing');

    transport.drop(connectionOf(A));
    await wait(DROP_DETECT_MS + SETTLE_MS);
    expect(b!.view().hosting).toBe(true);
    expect(stateOf(c!)).toMatchObject({ hostId: B, term: 2 });
    expect(stateOf(c!).round.status).toBe('closing');

    await vi.advanceTimersByTimeAsync(closesAt - Date.now() - 50);
    expect(stateOf(c!).round.status).toBe('closing');
    await wait();
    expect(stateOf(c!).round.status).toBe('lobby');
    expect(stateOf(c!).lastResult!.places.map((p) => [p.id, p.outcome])).toEqual([
      [B, 'finished'],
      [A, 'dnf'],
      [C, 'dnf'],
    ]);
  });

  it('settles two hosts to one', async () => {
    const ticket = await ticketFor(A, true);
    // Presence that hasn't synced yet: each connection first sees only itself.
    const lonely: RoomTransport = {
      connect: async (t, self) => {
        const connection = await transport.connect(t, self);
        const real = connection.presence.bind(connection);
        let first = true;
        connection.presence = () => (first ? ((first = false), [self]) : real());
        return connection;
      },
    };
    const make = (self: PlayerId) =>
      new RoomClient({
        transport: lonely,
        ticket,
        self,
        name: `Player ${self[0]}`,
        random: seededRandom(nextSeed++),
      });
    const b = make(B);
    const a = make(A);
    clients.push(a, b);
    await b.start();
    await a.start();
    expect(a.view().hosting && b.view().hosting).toBe(true);
    await wait(2 * SETTLE_MS);
    expect(a.view().hosting).toBe(true); // same term and join order: the lower id wins
    expect(b.view()).toMatchObject({ hosting: false, phase: 'in-room' });
    expect(stateOf(b).seats.map((s) => s.id)).toEqual([A, B]);
    expectAgreement([a, b]);
  });

  it('makes a returning former host step down to the host that replaced it', async () => {
    const [a, b, c] = await room(B, C);
    transport.drop(connectionOf(A));
    await wait(DROP_DETECT_MS + SETTLE_MS);
    expect(b!.view().hosting).toBe(true);
    b!.setReady(true);
    await wait();

    transport.restore(connectionOf(A));
    await wait(2 * SETTLE_MS);
    expect(a!.view().hosting).toBe(false);
    expect(b!.view().hosting).toBe(true);
    expectAgreement([a!, b!, c!]);
    expect(stateOf(a!).round.ready).toEqual([B]);
  });

  it('resumes a player who reloads mid-round', async () => {
    const [a, b] = await room(B);
    await playRound([a!, b!]);
    b!.reportProgress(1, 5);
    await wait();
    await b!.close();
    await wait();
    expect(stateOf(a!).present).toEqual([A]);

    const reloaded = await join(B);
    expect(reloaded.view().phase).toBe('in-room');
    const state = stateOf(reloaded);
    expect(state.round).toMatchObject({ number: 1, status: 'playing' });
    expect(state.round.participants).toContain(B);
    expect(state.round.progress[B]).toBe(5);
    reloaded.reportFinished(1, 70_000);
    await wait();
    expect(stateOf(a!).round.finishes).toEqual([{ id: B, ms: 70_000 }]);
  });

  it('makes a player who drops and comes back during the next round wait for the one after', async () => {
    const [a, b, c] = await room(B, C);
    await playRound([a!, b!, c!]);
    transport.drop(connectionOf(C));
    await wait(DROP_DETECT_MS + SETTLE_MS);
    a!.reportFinished(1, 1);
    b!.reportFinished(1, 2);
    await wait();
    expect(stateOf(a!).round.status).toBe('lobby');

    await playRound([a!, b!]);
    expect(stateOf(a!).round).toMatchObject({ number: 2, participants: [A, B] });
    transport.restore(connectionOf(C));
    await wait();
    expect(stateOf(c!).round).toMatchObject({ number: 2, status: 'playing' });
    expect(stateOf(c!).round.participants).not.toContain(C);
    c!.reportProgress(2, 3);
    await wait();
    expect(stateOf(a!).round.progress[C]).toBeUndefined();

    a!.reportFinished(2, 1);
    b!.reportFinished(2, 2);
    await wait();
    await playRound([a!, b!, c!]);
    expect(stateOf(c!).round).toMatchObject({ number: 3, participants: [A, B, C] });
    expect(stateOf(c!).seats.find((s) => s.id === C)!.score).toBe(0);
  });
});

describe('joining', () => {
  it('refuses to join an emptied room, but a rejoin starts it again with a fresh state', async () => {
    const [a] = await room(B);
    await clients[1]!.close();
    a!.rename('Ann');
    await wait();
    await a!.close();
    await wait();
    expect(await directory.join(ROOM, A)).toEqual({ error: 'not-found' });
    const again = await join(A, { how: 'rejoin' });
    expect(again.view()).toMatchObject({ hosting: true, phase: 'in-room' });
    expect(stateOf(again)).toMatchObject({ term: 1, hostId: A });
    expect(stateOf(again).seats.map((s) => s.id)).toEqual([A]);
  });

  it('puts two players who create the same room at once in one room with one host', async () => {
    const tickets = [await ticketFor(A, 'create'), await ticketFor(B, 'create')];
    const [a, b] = [A, B].map(
      (self, i) =>
        new RoomClient({
          transport,
          ticket: tickets[i]!,
          self,
          name: `Player ${self[0]}`,
          random: seededRandom(nextSeed++),
        }),
    );
    clients.push(a!, b!);
    await Promise.all([a!.start(), b!.start()]);
    await wait(2 * SETTLE_MS);
    expect([a!, b!].filter((c) => c.view().hosting)).toHaveLength(1);
    expect(stateOf(a!).seats.map((s) => s.id)).toEqual(stateOf(b!).seats.map((s) => s.id));
    expect(stateOf(a!).seats).toHaveLength(2);
  });

  it('joins an occupied room it was told was free, without resetting it', async () => {
    const [a, b] = await room(B);
    b!.rename('Bea');
    await wait();
    const before = stateOf(a!);
    // A best-effort create that missed the players already there (SPEC §7).
    const c = await join(C, { how: 'rejoin' });
    expect(c.view().hosting).toBe(false);
    expect(a!.view().hosting).toBe(true);
    expect(stateOf(c)).toMatchObject({ term: before.term, hostId: A });
    expect(stateOf(c).seats.map((s) => [s.id, s.name])).toEqual([
      [A, 'Player A'],
      [B, 'Bea'],
      [C, 'Player C'],
    ]);
  });

  it('shows "still connecting" while nobody answers, then starts the room itself', async () => {
    const silent = await transport.connect(await ticketFor(D, true), D);
    const b = await join(B);
    expect(b.view()).toMatchObject({ phase: 'joining', stillConnecting: false });
    await wait(HELLO_RETRY_MS);
    expect(b.view().stillConnecting).toBe(true);
    await wait(HOST_FALLBACK_MS - HELLO_RETRY_MS);
    expect(b.view()).toMatchObject({ hosting: true, phase: 'in-room', stillConnecting: false });
    expect(stateOf(b).term).toBe(0);
    await silent.close();
  });

  it('turns away a ninth present player', async () => {
    const letters = 'ABCDEFGH'.split('');
    await room(...letters.slice(1).map(id));
    const ninth = await join(id('I'));
    expect(ninth.view().phase).toBe('full');
    expect(connectionOf(id('I'))).toBeUndefined();
    expect(stateOf(clients[0]!).seats).toHaveLength(MAX_PRESENT);
  });

  it('asks for a refresh when the room speaks a newer protocol', async () => {
    const [, b] = await room(B);
    const newer = { ...encodeMessage(A, { type: 'leave' }), protocol: 2 };
    await connectionOf(A).publish(newer);
    await wait();
    expect(b!.view().phase).toBe('needs-update');
  });

  it('rejects a client that speaks an older protocol', async () => {
    await room();
    const old = await transport.connect(await ticketFor(D, false), D);
    const got: unknown[] = [];
    old.onMessage((m) => got.push(m));
    await old.publish({ ...encodeMessage(D, { type: 'hello', name: 'Old' }), protocol: 0 });
    await wait();
    expect(got).toContainEqual(
      expect.objectContaining({ type: 'reject', to: D, reason: 'protocol' }),
    );
    await old.close();
  });

  it('ignores a snapshot claiming to come from a host that didn’t send it', async () => {
    const [a, b] = await room(B);
    const forged = { ...encodeMessage(D, { type: 'snapshot', snapshot: null as never }) };
    await connectionOf(A).publish(forged);
    await wait();
    expect(stateOf(b!).hostId).toBe(A);
    expect(a!.view().phase).toBe('in-room');
  });
});

describe('the host', () => {
  it('merges snapshots to at most one per 100 ms', async () => {
    const [, b] = await room(B);
    const snapshots: number[] = [];
    connectionOf(B).onMessage((m) => {
      if ((m as { type: string }).type === 'snapshot') snapshots.push(Date.now());
    });
    for (let name = 0; name < 20; name++) {
      b!.rename(`Name ${name}`);
      await vi.advanceTimersByTimeAsync(10);
    }
    await wait();
    expect(snapshots.length).toBeGreaterThan(1);
    expect(snapshots.length).toBeLessThanOrEqual(4);
    for (let i = 1; i < snapshots.length; i++) {
      expect(snapshots[i]! - snapshots[i - 1]!).toBeGreaterThanOrEqual(SNAPSHOT_INTERVAL_MS);
    }
    expect(stateOf(b!).seats[1]!.name).toBe('Name 19');
  });

  it('starts a round by the ready timeout, and the others sit out', async () => {
    const [a, b, c] = await room(B, C);
    a!.setReady(true);
    b!.setReady(true);
    await wait();
    expect(stateOf(c!).round.readyClosesAt).not.toBeNull();
    await wait(READY_TIMEOUT_MS);
    expect(stateOf(c!).round).toMatchObject({ status: 'countdown', participants: [A, B] });
  });
});

describe('resending', () => {
  it('resends progress and a finish made while reconnecting', async () => {
    const [a, b] = await room(B);
    await playRound([a!, b!]);
    transport.drop(connectionOf(B));
    b!.reportProgress(1, 8);
    b!.reportFinished(1, 42_000);
    await wait();
    expect(b!.view().status).toBe('reconnecting');
    expect(stateOf(a!).round.finishes).toEqual([]);
    transport.restore(connectionOf(B));
    await wait();
    expect(b!.view()).toMatchObject({ status: 'connected', reconnectingSince: null });
    expect(stateOf(a!).round.finishes).toEqual([{ id: B, ms: 42_000 }]);
  });

  it('resends intents a snapshot shows were lost in transit', async () => {
    const [a, b] = await room(B);
    const connection = connectionOf(B);
    const publish = connection.publish.bind(connection);
    let dropped = 0;
    vi.spyOn(connection, 'publish').mockImplementation(async (m) => {
      if ((m as { type: string }).type === 'ready' && dropped++ === 0) return;
      return publish(m);
    });
    b!.setReady(true);
    a!.setReady(true); // prompts a snapshot that lacks B's ready
    await wait(2_000);
    expect(dropped).toBe(2);
    expect(stateOf(a!).round.status).not.toBe('lobby');
  });
});

describe('leaving', () => {
  it('removes a leaving player’s seat and score for everyone', async () => {
    const [a, b, c] = await room(B, C);
    await playRound([a!, b!, c!]);
    b!.reportFinished(1, 1);
    a!.reportFinished(1, 2);
    c!.reportFinished(1, 3);
    await wait();
    const left = b!.leave();
    await wait();
    await left;
    expect(b!.view().phase).toBe('left');
    expect(connectionOf(B)).toBeUndefined();
    for (const p of [a!, c!]) {
      expect(stateOf(p).seats.map((s) => s.id)).toEqual([A, C]);
      expect(stateOf(p).lastResult!.places.map((pl) => pl.id)).toEqual([A, C]);
    }
  });

  it('hands the room on when the host leaves', async () => {
    const [a, b, c] = await room(B, C);
    await a!.leave();
    await wait();
    expect(a!.view().phase).toBe('left');
    expect(b!.view().hosting).toBe(true);
    expect(stateOf(c!).seats.map((s) => s.id)).toEqual([B, C]);
    expect(stateOf(c!)).toMatchObject({ hostId: B, term: 2 });
  });

  it('gives up waiting after 2 s if no snapshot comes', async () => {
    const [, b] = await room(B);
    transport.drop(connectionOf(A));
    const left = b!.leave();
    await wait(2_000);
    await left;
    expect(b!.view().phase).toBe('left');
  });

  it('keeps the seat, shown as away, when the tab just closes', async () => {
    const [a, b] = await room(B);
    await b!.close();
    await wait();
    expect(b!.view().phase).toBe('closed');
    expect(stateOf(a!).seats.map((s) => s.id)).toEqual([A, B]);
    expect(stateOf(a!).present).toEqual([A]);
  });
});
