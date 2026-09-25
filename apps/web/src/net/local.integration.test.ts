import {
  isDirectoryError,
  RoomClient,
  SNAPSHOT_INTERVAL_MS,
  systemClock,
  type CreateError,
  type JoinError,
  type PlayerId,
  type RoomTicket,
} from '@cranny/multiplayer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalDirectory } from './localDirectory.ts';
import { LocalTransport, SILENCE_MS } from './localTransport.ts';
import { fakePage, memoryBuses } from './testing.ts';

// RoomClient over the local adapters, with each "tab" having its own transport, directory and
// page, sharing one bus as tabs of one browser do.

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

/** A tab's transport, page and directory, on the shared bus. */
function tab() {
  const { page, fire } = fakePage();
  const transport = new LocalTransport({ openBus: buses.openBus, lifecycle: page });
  const directory = new LocalDirectory({ occupied: (c) => transport.occupied(c) });
  return { transport, directory, fire };
}

/** Runs a directory call while letting its presence probe finish. */
async function ask<T>(promise: Promise<T>): Promise<T> {
  await vi.advanceTimersByTimeAsync(1_000);
  return promise;
}

/** Opens a tab for `self` that creates or joins the room, and lets it settle. */
async function openTab(self: PlayerId, create: boolean) {
  const { transport, directory, fire } = tab();
  const ticket = await ask<RoomTicket | CreateError | JoinError>(
    create ? directory.create(ROOM, self) : directory.join(ROOM, self),
  );
  if (isDirectoryError(ticket)) throw new Error(ticket.error);
  const client = new RoomClient({ transport, ticket, self, name: self[0]! });
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
    // The room is still there for a newcomer while B is in it, and gone once B leaves too. (A's
    // page only fired pagehide; a closed tab's connection would be gone, so close it too.)
    await a.client.close();
    expect(isDirectoryError(await ask(tab().directory.join(ROOM, 'C'.repeat(22))))).toBe(false);
    await b.client.close();
    expect(await ask(tab().directory.join(ROOM, 'C'.repeat(22)))).toEqual({ error: 'not-found' });
  });
});
