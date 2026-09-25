import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RoomTicket } from '../directory.ts';
import type { PlayerId } from '../protocol.ts';
import { cryptoRandom, randomPlayerId } from '../random.ts';
import type { ConnectionStatus, RoomConnection, RoomTransport } from '../transport.ts';

/** What an adapter's test provides to {@link describeTransportConformance}. */
export type ConformanceHarness = {
  transport: RoomTransport;
  /** A ticket for a room. The same key gives the same room; different keys, different rooms. */
  ticket(room: string, self: PlayerId): Promise<RoomTicket>;
  /** Cuts a connection abruptly, as a closed laptop or lost signal would (no clean close). */
  drop(connection: RoomConnection): Promise<void> | void;
  /** Brings a dropped connection back. Omit it if the adapter can only reconnect by itself. */
  restore?(connection: RoomConnection): Promise<void> | void;
  /**
   * Lets `ms` of transport time pass: advance fake timers, or sleep for a time-scaled amount if
   * the adapter can't use fake timers.
   */
  wait(ms: number): Promise<void>;
  /** Cleans up after each test. */
  dispose?(): Promise<void> | void;
};

/** How long a message or clean leave may take to arrive, in transport time. */
const PROMPT_MS = 2_000;
/** The abrupt-drop bound from SPEC §6.2. */
const DROP_BOUND_MS = 30_000;
const STEP_MS = 100;

/**
 * The suite every `RoomTransport` adapter must pass (SPEC §6.3): fan-out including the sender,
 * per-sender ordering, `from` identity, presence joins, clean leaves, abrupt drops within 30 s,
 * reconnecting, status changes and room isolation.
 *
 * @param name - Shown in the test names, e.g. "FakeTransport".
 * @param makeHarness - Called before each test.
 */
export function describeTransportConformance(
  name: string,
  makeHarness: () => ConformanceHarness | Promise<ConformanceHarness>,
): void {
  describe(`${name} conformance`, () => {
    let h: ConformanceHarness;
    let open: RoomConnection[];

    beforeEach(async () => {
      h = await makeHarness();
      open = [];
    });

    afterEach(async () => {
      for (const c of open) if (c.status() !== 'closed') await c.close();
      await h.dispose?.();
    });

    /** Connects a new player to a room and records every message and status it sees. */
    async function join(room: string) {
      const id = randomPlayerId(cryptoRandom);
      const connection = await h.transport.connect(await h.ticket(room, id), id);
      open.push(connection);
      const received: { message: unknown; from: PlayerId }[] = [];
      const statuses: ConnectionStatus[] = [];
      connection.onMessage((message, from) => received.push({ message, from }));
      connection.onStatus((status) => statuses.push(status));
      return { id, connection, received, statuses };
    }

    /** Waits until `check` holds, failing after `withinMs` of transport time. */
    async function eventually(check: () => boolean, withinMs: number, what: string) {
      for (let waited = 0; !check(); waited += STEP_MS) {
        if (waited >= withinMs) throw new Error(`Timed out after ${withinMs} ms: ${what}`);
        await h.wait(STEP_MS);
      }
    }

    it('connects, and lists itself and everyone already there in presence', async () => {
      const a = await join('room');
      expect(a.connection.status()).toBe('connected');
      expect(a.connection.presence()).toContain(a.id);
      const b = await join('room');
      expect(b.connection.presence()).toEqual(expect.arrayContaining([a.id, b.id]));
    });

    it('delivers to everyone in the room, including the sender, with the sender’s identity', async () => {
      const a = await join('room');
      const b = await join('room');
      const c = await join('room');
      await eventually(() => a.connection.presence().length === 3, PROMPT_MS, 'all present');
      const message = { type: 'test', nested: { list: [1, 'two', null], ok: true } };
      await a.connection.publish(message);
      for (const who of [a, b, c]) {
        await eventually(() => who.received.length === 1, PROMPT_MS, 'delivery');
        expect(who.received[0]).toEqual({ message, from: a.id });
      }
    });

    it('keeps each sender’s messages in order', async () => {
      const a = await join('room');
      const b = await join('room');
      const c = await join('room');
      for (let n = 0; n < 20; n++) {
        await a.connection.publish({ from: 'a', n });
        await c.connection.publish({ from: 'c', n });
      }
      await eventually(() => b.received.length === 40, PROMPT_MS, 'all 40 delivered');
      for (const sender of [a, c]) {
        const ns = b.received
          .filter((r) => r.from === sender.id)
          .map((r) => (r.message as { n: number }).n);
        expect(ns).toEqual([...Array(20).keys()]);
      }
    });

    it('stops calling a listener once unsubscribed', async () => {
      const a = await join('room');
      const b = await join('room');
      const seen: unknown[] = [];
      const stop = b.connection.onMessage((m) => seen.push(m));
      await a.connection.publish({ n: 1 });
      await eventually(() => seen.length === 1, PROMPT_MS, 'first message');
      stop();
      await a.connection.publish({ n: 2 });
      await eventually(() => b.received.length === 2, PROMPT_MS, 'second message');
      expect(seen).toHaveLength(1);
    });

    it('tells others when a member joins', async () => {
      const a = await join('room');
      const updates: PlayerId[][] = [];
      a.connection.onPresence((present) => updates.push(present));
      const b = await join('room');
      await eventually(() => a.connection.presence().includes(b.id), PROMPT_MS, 'b present');
      expect(updates.at(-1)).toEqual(expect.arrayContaining([a.id, b.id]));
    });

    it('drops a member who closes cleanly at once', async () => {
      const a = await join('room');
      const b = await join('room');
      await eventually(() => a.connection.presence().includes(b.id), PROMPT_MS, 'b present');
      await b.connection.close();
      expect(b.connection.status()).toBe('closed');
      await eventually(() => !a.connection.presence().includes(b.id), PROMPT_MS, 'b gone');
      await a.connection.publish({ after: 'close' });
      await eventually(() => a.received.length === 1, PROMPT_MS, 'own message');
      expect(b.received).toEqual([]);
    });

    it('drops a member who vanishes within 30 s', async () => {
      const a = await join('room');
      const b = await join('room');
      await eventually(() => a.connection.presence().includes(b.id), PROMPT_MS, 'b present');
      const updates: PlayerId[][] = [];
      a.connection.onPresence((present) => updates.push(present));
      await h.drop(b.connection);
      await eventually(() => !a.connection.presence().includes(b.id), DROP_BOUND_MS, 'b gone');
      expect(updates.at(-1)).not.toContain(b.id);
    });

    it('reconnects after a drop, reporting its status and appearing in presence again', async () => {
      if (!h.restore) return;
      const a = await join('room');
      const b = await join('room');
      await h.drop(b.connection);
      await eventually(() => b.connection.status() === 'reconnecting', PROMPT_MS, 'reconnecting');
      await eventually(() => !a.connection.presence().includes(b.id), DROP_BOUND_MS, 'b gone');
      await h.restore(b.connection);
      await eventually(() => b.connection.status() === 'connected', PROMPT_MS, 'reconnected');
      expect(b.statuses).toEqual(['reconnecting', 'connected']);
      await eventually(() => a.connection.presence().includes(b.id), PROMPT_MS, 'b back');
      await eventually(() => b.connection.presence().includes(a.id), PROMPT_MS, 'b sees a');
      await b.connection.publish({ back: true });
      await eventually(() => a.received.length === 1, PROMPT_MS, 'message after reconnecting');
      expect(a.received[0]).toEqual({ message: { back: true }, from: b.id });
    });

    it('keeps rooms apart', async () => {
      const a = await join('room-one');
      const b = await join('room-two');
      const c = await join('room-one');
      await a.connection.publish({ secret: 'one' });
      await eventually(() => c.received.length === 1, PROMPT_MS, 'same-room delivery');
      await h.wait(PROMPT_MS);
      expect(b.received).toEqual([]);
      expect(b.connection.presence()).toEqual([b.id]);
      expect(a.connection.presence()).not.toContain(b.id);
    });
  });
}
