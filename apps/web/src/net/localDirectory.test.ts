import {
  isDirectoryError,
  roomChannel,
  systemClock,
  type PlayerId,
  type RoomTicket,
} from '@cranny/multiplayer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isLocalCredentialFor, LocalDirectory } from './localDirectory.ts';
import { JOIN_WAIT_MS, LocalTransport, PROBE_WAIT_MS } from './localTransport.ts';
import { memoryBuses } from './testing.ts';

// Player ids must look real, or the transport ignores their frames.
const A: PlayerId = 'a'.repeat(22);
const B: PlayerId = 'b'.repeat(22);

describe('LocalDirectory', () => {
  let buses: ReturnType<typeof memoryBuses>;

  beforeEach(() => {
    vi.useFakeTimers();
    buses = memoryBuses(systemClock);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** One tab's transport and directory, sharing the bus with the other tabs. */
  function tab() {
    const transport = new LocalTransport({ openBus: buses.openBus, lifecycle: null });
    const directory = new LocalDirectory({ occupied: (c) => transport.occupied(c) });
    return { transport, directory };
  }

  /** Runs a directory call while letting its probe wait pass. */
  async function call<T>(promise: Promise<T>): Promise<T> {
    await vi.advanceTimersByTimeAsync(PROBE_WAIT_MS);
    return promise;
  }

  /** Connects a tab to the room with a ticket from `rejoin`, which never probes. */
  async function enter(self: PlayerId) {
    const { transport, directory } = tab();
    const ticket = (await directory.rejoin('otter-bramble', self)) as RoomTicket;
    const connecting = transport.connect(ticket, self);
    await vi.advanceTimersByTimeAsync(JOIN_WAIT_MS);
    return connecting;
  }

  it('creates an empty room, on the channel named after it, with a credential for the player', async () => {
    const ticket = await call(tab().directory.create('otter-bramble', A));
    if (isDirectoryError(ticket)) throw new Error(ticket.error);
    expect(ticket.channel).toBe(roomChannel('otter-bramble'));
    expect(isLocalCredentialFor(ticket.credential.value, ticket.channel, A)).toBe(true);
  });

  it('finds a room while another tab is in it, and loses it when that tab closes', async () => {
    const other = tab().directory;
    expect(await call(other.join('otter-bramble', B))).toEqual({ error: 'not-found' });
    const a = await enter(A);
    expect(await call(other.create('otter-bramble', B))).toEqual({ error: 'taken' });
    expect(isDirectoryError(await call(other.join('otter-bramble', B)))).toBe(false);
    await a.close();
    expect(await call(other.join('otter-bramble', B))).toEqual({ error: 'not-found' });
  });

  it('checks for a room without showing up in its presence', async () => {
    const a = await enter(A);
    const seen: PlayerId[][] = [];
    a.onPresence((present) => seen.push(present));
    await call(tab().directory.join('otter-bramble', B));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(seen).toEqual([]);
    expect(a.presence()).toEqual([A]);
    await a.close();
  });

  it('rejoins an empty room, and rejects invalid names', async () => {
    const { directory } = tab();
    expect(isDirectoryError(await directory.rejoin('otter-bramble', A))).toBe(false);
    expect(await call(directory.create('Otter Bramble', A))).toEqual({ error: 'invalid' });
    expect(await directory.rejoin('no', A)).toEqual({ error: 'invalid' });
  });
});
