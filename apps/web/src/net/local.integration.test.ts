import {
  isDirectoryError,
  LEASE_MS,
  RoomClient,
  SNAPSHOT_INTERVAL_MS,
  systemClock,
  type PlayerId,
} from '@cranny/multiplayer';
import { seededRandom } from '@cranny/multiplayer/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadLocalRooms } from '../storage/storage.ts';
import { LocalDirectory } from './localDirectory.ts';
import { LocalTransport, SILENCE_MS } from './localTransport.ts';
import { fakePage, memoryBuses } from './testing.ts';

// RoomClient over the local adapters, with each "tab" having its own transport, directory and
// page, sharing one bus and local storage as tabs of one browser do.

const ROOM = 'amber-otter-quilt';
const A: PlayerId = 'A'.repeat(22);
const B: PlayerId = 'B'.repeat(22);

let buses: ReturnType<typeof memoryBuses>;
let clients: RoomClient[];

beforeEach(() => {
  vi.useFakeTimers();
  buses = memoryBuses(systemClock);
  clients = [];
});

afterEach(async () => {
  for (const client of clients) await client.close();
  vi.useRealTimers();
});

/** Opens a tab for `self` that creates or joins the room, and lets it settle. */
async function openTab(self: PlayerId, create: boolean) {
  const { page, fire } = fakePage();
  const transport = new LocalTransport({ openBus: buses.openBus, lifecycle: page });
  const directory = new LocalDirectory({ random: seededRandom(self.charCodeAt(0)) });
  const ticket = create ? await directory.create(ROOM, self) : await directory.join(ROOM, self);
  if (isDirectoryError(ticket)) throw new Error(ticket.error);
  const client = new RoomClient({
    transport,
    directory,
    ticket,
    self,
    name: self[0]!,
    created: create,
  });
  clients.push(client);
  const starting = client.start();
  await vi.advanceTimersByTimeAsync(1_000);
  await starting;
  return { client, close: () => fire('pagehide', false) };
}

describe('RoomClient over the local adapters', () => {
  it('plays together in two tabs, and hands over at once when the host tab closes', async () => {
    const a = await openTab(A, true);
    const b = await openTab(B, false);
    expect(a.client.view()).toMatchObject({ phase: 'in-room', hosting: true });
    expect(b.client.view()).toMatchObject({ phase: 'in-room', hosting: false });
    expect(b.client.view().room!.seats.map((s) => s.id)).toEqual([A, B]);

    a.client.setReady(true);
    b.client.setReady(true);
    await vi.advanceTimersByTimeAsync(SNAPSHOT_INTERVAL_MS * 5);
    const round = b.client.view().room!.round;
    expect(round).toMatchObject({ number: 1, status: 'countdown', participants: [A, B] });
    expect(a.client.view().room!.round.grid).toEqual(round.grid);

    // The host's tab goes away without closing its client, as a closed tab would. Its goodbye
    // means B takes over well before the silence limit would notice.
    const takeoverAt = Date.now();
    a.close();
    await vi.advanceTimersByTimeAsync(SNAPSHOT_INTERVAL_MS * 5);
    expect(b.client.view().hosting).toBe(true);
    expect(Date.now() - takeoverAt).toBeLessThan(SILENCE_MS);
    // The new host renews the lease on taking over.
    expect(loadLocalRooms().leases[ROOM]?.expiresAt).toBeGreaterThanOrEqual(takeoverAt + LEASE_MS);
  });
});
