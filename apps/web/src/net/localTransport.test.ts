import {
  cryptoRandom,
  randomPlayerId,
  type PlayerId,
  type RoomConnection,
  type RoomTicket,
  systemClock,
} from '@cranny/multiplayer';
import { describeTransportConformance } from '@cranny/multiplayer/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalCredential } from './localDirectory.ts';
import {
  JOIN_WAIT_MS,
  LocalConnection,
  LocalTransport,
  type LocalTransportOptions,
  SILENCE_MS,
} from './localTransport.ts';
import { fakePage, memoryBuses } from './testing.ts';

/** A ticket whose credential is good for `self` only. */
function ticket(room: string, self: PlayerId): RoomTicket {
  const value: LocalCredential = { channel: `channel-${room}`, self, expiresAt: Infinity };
  return {
    room,
    channel: `channel-${room}`,
    credential: { value, expiresInMs: 1 },
  };
}

// Player ids must look real, or the transport ignores their frames.
const A = 'a'.repeat(22);
const B = 'b'.repeat(22);
const C = 'c'.repeat(22);

/** The LocalConnection behind an interface value. */
function local(connection: RoomConnection): LocalConnection {
  if (!(connection instanceof LocalConnection)) throw new Error('Not a LocalConnection');
  return connection;
}

describeTransportConformance('LocalTransport (fake timers)', () => {
  vi.useFakeTimers();
  const transport = new LocalTransport({
    clock: systemClock,
    openBus: memoryBuses(systemClock).openBus,
    lifecycle: null,
  });
  return {
    // connect waits JOIN_WAIT_MS for answers, which only pass if something advances the timers.
    transport: {
      connect: async (t, self) => {
        const connecting = transport.connect(t, self);
        await vi.advanceTimersByTimeAsync(JOIN_WAIT_MS);
        return connecting;
      },
    },
    ticket: async (room, self) => ticket(room, self),
    drop: (c) => local(c).suspend(),
    restore: (c) => local(c).resume(),
    wait: (ms) => vi.advanceTimersByTimeAsync(ms).then(() => undefined),
    dispose: () => {
      vi.useRealTimers();
    },
  };
});

/** Real BroadcastChannel runs 20× faster than real time, so the 30 s drop test takes 1.5 s. */
const SCALE = 20;

describeTransportConformance('LocalTransport (BroadcastChannel)', () => {
  const scaled: LocalTransportOptions = {
    lifecycle: null,
    heartbeatMs: 10_000 / SCALE,
    silenceMs: SILENCE_MS / SCALE,
    sweepMs: 1_000 / SCALE,
    joinWaitMs: JOIN_WAIT_MS / SCALE,
  };
  // Real channels are shared by the whole process, so each test gets rooms of its own.
  const run = randomPlayerId(cryptoRandom);
  return {
    transport: new LocalTransport(scaled),
    ticket: async (room, self) => ticket(`${run}-${room}`, self),
    drop: (c) => local(c).suspend(),
    restore: (c) => local(c).resume(),
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms / SCALE)),
  };
});

describe('LocalTransport', () => {
  let buses: ReturnType<typeof memoryBuses>;
  let transport: LocalTransport;

  beforeEach(() => {
    vi.useFakeTimers();
    buses = memoryBuses(systemClock);
    transport = new LocalTransport({ openBus: buses.openBus, lifecycle: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Connects `self` to room `r`, letting the join wait pass. */
  async function connect(self: PlayerId, t: RoomTicket = ticket('r', self)) {
    const connecting = transport.connect(t, self);
    await vi.advanceTimersByTimeAsync(JOIN_WAIT_MS);
    return connecting;
  }

  it('drops a silent member after 25 s of silence, not before', async () => {
    const a = await connect(A);
    const b = await connect(B);
    expect(a.presence()).toEqual([A, B]);
    b.suspend();
    // b's last word was its answer to a's join; heartbeats since have been every 10 s, so the
    // last one a heard was at most 10 s ago. Silence then runs from the suspension.
    await vi.advanceTimersByTimeAsync(SILENCE_MS - 10_000);
    expect(a.presence()).toEqual([A, B]);
    await vi.advanceTimersByTimeAsync(10_000 + 1_000);
    expect(a.presence()).toEqual([A]);
  });

  it('keeps members that keep beating for as long as they are open', async () => {
    const a = await connect(A);
    await connect(B);
    const updates: PlayerId[][] = [];
    a.onPresence((p) => updates.push(p));
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(updates).toEqual([]);
    expect(a.presence()).toEqual([A, B]);
  });

  it('lists a player once however many tabs they have open, until the last closes', async () => {
    const a = await connect(A);
    const b1 = await connect(B);
    const b2 = await connect(B);
    expect(a.presence()).toEqual([A, B]);
    expect(b2.presence()).toEqual([B, A]);
    await b1.close();
    await vi.advanceTimersByTimeAsync(0);
    expect(a.presence()).toEqual([A, B]);
    await b2.close();
    await vi.advanceTimersByTimeAsync(0);
    expect(a.presence()).toEqual([A]);
  });

  it('rejects a ticket whose credential is for another player', async () => {
    await expect(transport.connect(ticket('r', C), A)).rejects.toThrow(/another room or player/);
  });

  it('ignores frames it doesn’t understand', async () => {
    const a = await connect(A);
    const received: unknown[] = [];
    a.onMessage((m) => received.push(m));
    const stranger = buses.raw('channel-r');
    for (const junk of [
      null,
      'hi',
      { t: 'msg', conn: 'x', from: 42 },
      { t: 'nope', conn: 'x', from: B },
      { t: 'msg', conn: 'x' },
    ]) {
      stranger.post(junk);
    }
    await vi.advanceTimersByTimeAsync(0);
    expect(received).toEqual([]);
    expect(a.presence()).toEqual([A]);
  });

  it('rejoins without dropping anyone after its timers were held up for a long time', async () => {
    const a = await connect(A);
    const b = await connect(B);
    // Freeze a's clock-driven work by jumping the clock: timers fire late, all at once.
    vi.setSystemTime(Date.now() + 5 * 60_000);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(a.presence()).toEqual([A, B]);
    expect(b.presence()).toEqual([B, A]);
  });

  it('gives others a fresh allowance when it comes back from a pause, in case they are slow to answer', async () => {
    const a = await connect(A);
    const b = await connect(B);
    const updates: PlayerId[][] = [];
    b.onPresence((p) => updates.push(p));
    b.suspend();
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    // A is paused too, so it can't answer B's return straight away.
    a.suspend();
    b.resume();
    await vi.advanceTimersByTimeAsync(SILENCE_MS - 5_000);
    a.resume();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(updates).toEqual([]);
    expect(b.presence()).toEqual([B, A]);
  });

  describe('page lifecycle', () => {
    it('says goodbye when the page is hidden, and comes back if it is restored', async () => {
      const { page, fire } = fakePage();
      const other = await connect(A);
      transport = new LocalTransport({ openBus: buses.openBus, lifecycle: page });
      const leaving = await connect(B);
      expect(other.presence()).toEqual([A, B]);
      fire('pagehide', true);
      await vi.advanceTimersByTimeAsync(0);
      expect(other.presence()).toEqual([A]);
      fire('pageshow', true);
      await vi.advanceTimersByTimeAsync(0);
      expect(other.presence()).toEqual([A, B]);
      expect(leaving.presence()).toEqual([B, A]);
    });

    it('doesn’t announce itself on a first page show', async () => {
      const { page, fire } = fakePage();
      transport = new LocalTransport({ openBus: buses.openBus, lifecycle: page });
      await connect(B);
      const posts = vi.fn();
      buses.raw('channel-r').listen(posts);
      fire('pageshow', false);
      await vi.advanceTimersByTimeAsync(0);
      expect(posts).not.toHaveBeenCalled();
    });
  });
});
