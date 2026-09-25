import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoomTicket } from '../directory.ts';
import { describeTransportConformance } from './conformance.ts';
import { FakeTransport } from './fakeTransport.ts';

/** A ticket for a fake channel named after the room. */
const ticket = (room: string): RoomTicket => ({
  room,
  channel: `channel-${room}`,
  roomKey: 'key',
  credential: { value: null, expiresInMs: 3_600_000 },
});

describeTransportConformance('FakeTransport', () => {
  vi.useFakeTimers();
  const transport = new FakeTransport({ latencyMs: 20 });
  return {
    transport,
    ticket: async (room) => ticket(room),
    drop: (c) => transport.drop(c),
    restore: (c) => transport.restore(c),
    wait: (ms) => vi.advanceTimersByTimeAsync(ms).then(() => undefined),
    dispose: () => {
      vi.useRealTimers();
    },
  };
});

describe('FakeTransport', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports a dropped member gone after dropDetectMs, not before', async () => {
    const transport = new FakeTransport({ dropDetectMs: 25_000 });
    const a = await transport.connect(ticket('r'), 'a');
    const b = await transport.connect(ticket('r'), 'b');
    await vi.advanceTimersByTimeAsync(0);
    transport.drop(b);
    await vi.advanceTimersByTimeAsync(24_999);
    expect(a.presence()).toEqual(['a', 'b']);
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(1); // the presence update it triggers
    expect(a.presence()).toEqual(['a']);
  });

  it('keeps a member present if it comes back before the drop is noticed', async () => {
    const transport = new FakeTransport();
    const a = await transport.connect(ticket('r'), 'a');
    const b = await transport.connect(ticket('r'), 'b');
    await vi.advanceTimersByTimeAsync(0);
    const updates: string[][] = [];
    a.onPresence((p) => updates.push(p));
    transport.drop(b);
    await vi.advanceTimersByTimeAsync(5_000);
    transport.restore(b);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(updates).toEqual([]);
    expect(a.presence()).toEqual(['a', 'b']);
  });

  it('refuses to publish while reconnecting, and loses messages sent meanwhile', async () => {
    const transport = new FakeTransport();
    const a = await transport.connect(ticket('r'), 'a');
    const b = await transport.connect(ticket('r'), 'b');
    const got: unknown[] = [];
    b.onMessage((m) => got.push(m));
    transport.drop(b);
    await expect(b.publish({ n: 1 })).rejects.toThrow();
    await a.publish({ n: 2 });
    await vi.advanceTimersByTimeAsync(0);
    transport.restore(b);
    await vi.advanceTimersByTimeAsync(0);
    expect(got).toEqual([]);
  });

  it('lists a player with two connections once, until both have gone', async () => {
    const transport = new FakeTransport();
    const a = await transport.connect(ticket('r'), 'a');
    const b1 = await transport.connect(ticket('r'), 'b');
    const b2 = await transport.connect(ticket('r'), 'b');
    await vi.advanceTimersByTimeAsync(0);
    expect(a.presence()).toEqual(['a', 'b']);
    await b1.close();
    await vi.advanceTimersByTimeAsync(0);
    expect(a.presence()).toEqual(['a', 'b']);
    await b2.close();
    await vi.advanceTimersByTimeAsync(0);
    expect(a.presence()).toEqual(['a']);
  });

  it('copies messages, so the receiver can’t change what the sender holds', async () => {
    const transport = new FakeTransport();
    const a = await transport.connect(ticket('r'), 'a');
    const sent = { list: [1] };
    let received: { list: number[] } | undefined;
    a.onMessage((m) => (received = m as typeof sent));
    await a.publish(sent);
    await vi.advanceTimersByTimeAsync(0);
    received!.list.push(2);
    expect(sent.list).toEqual([1]);
  });
});
