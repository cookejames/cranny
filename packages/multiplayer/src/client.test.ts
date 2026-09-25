import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HELLO_RETRY_MS, HOST_FALLBACK_MS, RoomClient, SNAPSHOT_INTERVAL_MS } from './client.ts';
import {
  isDirectoryError,
  KEEP_ALIVE_INTERVAL_MS,
  LEASE_MS,
  type RoomTicket,
} from './directory.ts';
import { encodeMessage, type PlayerId } from './protocol.ts';
import { CLOSE_OUT_MS, MAX_PRESENT, READY_TIMEOUT_MS, REVEAL_COUNTDOWN_MS } from './rules.ts';
import { FakeDirectory } from './testing/fakeDirectory.ts';
import { FakeTransport, type FakeConnection } from './testing/fakeTransport.ts';
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
  directory = new FakeDirectory({ random: seededRandom(99) });
  clients = [];
});

afterEach(async () => {
  for (const client of clients) await client.close();
  vi.useRealTimers();
});

/** Lets time pass on every clock, running whatever it triggers. */
const wait = (ms = SETTLE_MS) => vi.advanceTimersByTimeAsync(ms);

/** A ticket for the room: creates it for the first player, joins it for the rest. */
async function ticketFor(self: PlayerId, create: boolean): Promise<RoomTicket> {
  const result = create ? await directory.create(ROOM, self) : await directory.join(ROOM, self);
  if (isDirectoryError(result)) throw new Error(result.error);
  return result;
}

/** Starts a player's client and lets the room settle. */
async function join(self: PlayerId, options: { create?: boolean; name?: string } = {}) {
  const client = new RoomClient({
    transport,
    directory,
    ticket: await ticketFor(self, options.create ?? false),
    self,
    name: options.name ?? `Player ${self[0]}`,
    created: options.create ?? false,
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
    const make = (self: PlayerId) =>
      new RoomClient({
        transport,
        directory,
        ticket,
        self,
        name: `Player ${self[0]}`,
        created: true,
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
  it('becomes host of an empty room it didn’t create', async () => {
    await (await room()).at(0)!.close();
    await wait();
    const b = await join(B);
    expect(b.view()).toMatchObject({ hosting: true, phase: 'in-room' });
    expect(stateOf(b)).toMatchObject({ term: 1, hostId: B });
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

  it('keeps the name alive every 4 minutes while host, and only while host', async () => {
    const keepAlive = vi.spyOn(directory, 'keepAlive');
    const [a, b] = await room(B);
    expect(keepAlive).toHaveBeenCalledTimes(1);
    await wait(KEEP_ALIVE_INTERVAL_MS * 3);
    expect(keepAlive).toHaveBeenCalledTimes(4);
    expect(directory.leaseExpiresAt(ROOM)).toBeGreaterThan(Date.now() + LEASE_MS / 2);
    await a!.close();
    await wait();
    expect(b!.view().hosting).toBe(true);
    expect(keepAlive).toHaveBeenCalledTimes(5); // at once on becoming host
  });

  it('shows the lost-name notice when another room took the name', async () => {
    const [a] = await room();
    vi.spyOn(directory, 'keepAlive').mockResolvedValue('lost');
    await wait(KEEP_ALIVE_INTERVAL_MS);
    expect(a!.view().nameLost).toBe(true);
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
