import {
  isDirectoryError,
  RoomClient,
  REVEAL_COUNTDOWN_MS,
  type PlayerId,
} from '@cranny/multiplayer';
import { FakeDirectory, FakeTransport } from '@cranny/multiplayer/testing';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { expect, vi } from 'vitest';
import { AppRoutes } from '../App.tsx';
import { loadSeat } from '../storage/storage.ts';
import { RoomAdaptersContext } from './RoomAdaptersContext.ts';

// Test helpers for the multiplayer screens: the app over FakeTransport and FakeDirectory, with
// fake timers, and other players as RoomClients driven by the test.

/** Exposes the router's current path. */
function CurrentPath() {
  return <output data-testid="path">{useLocation().pathname}</output>;
}

/**
 * Lets promises and timers run for `ms` of fake time. Needs `vi.useFakeTimers()`. Also waits for
 * the lazily loaded multiplayer screens (`App.tsx`), whose loading fake time can't hurry.
 */
export const settle = (ms = 0) =>
  act(async () => {
    await Promise.all([import('./MultiplayerPage.tsx'), import('./RoomPage.tsx')]);
    await vi.advanceTimersByTimeAsync(ms);
  });

/** The current path of the most recently rendered tab. */
export const currentPath = () => screen.getAllByTestId('path').at(-1)!.textContent!;

/** The UI tab's player id, from its session storage. */
export const uiId = () => loadSeat()!.playerId;

/** A fake network and directory, the tabs rendered on them, and the test's own players. */
export class RoomHarness {
  readonly transport = new FakeTransport();
  readonly directory = new FakeDirectory({
    occupied: (channel) => this.transport.presenceOf(channel).length > 0,
  });
  readonly others: RoomClient[] = [];

  /**
   * Renders the app at `pathname` as one browser tab. The multiplayer screens load lazily, so
   * let fake time run (`settle`) before querying them.
   */
  renderTab(pathname: string) {
    return render(
      <RoomAdaptersContext value={{ transport: this.transport, directory: this.directory }}>
        <MemoryRouter initialEntries={[pathname]}>
          <AppRoutes />
          <CurrentPath />
        </MemoryRouter>
      </RoomAdaptersContext>,
    );
  }

  /** Creates a room from the Multiplayer screen; returns its name. */
  async createRoom(): Promise<string> {
    this.renderTab('/multiplayer');
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Create a room' }));
    await settle(200);
    expect(currentPath()).toMatch(/^\/m\/[a-z]+-[a-z]+-[a-z]+$/);
    return currentPath().slice('/m/'.length);
  }

  /** A player driven by the test, joining `room` (or creating it, as its host). */
  async addPlayer(room: string, self: PlayerId, name: string, created = false) {
    const ticket = created
      ? await this.directory.create(room, self)
      : await this.directory.join(room, self);
    if (isDirectoryError(ticket)) throw new Error(ticket.error);
    const client = new RoomClient({ transport: this.transport, ticket, self, name });
    this.others.push(client);
    const starting = client.start();
    await settle(200);
    await starting;
    return client;
  }

  /** Readies the UI player and `players`, and runs the 3-2-1 unless `reveal` is false. */
  async startRound(players: RoomClient[], reveal = true) {
    fireEvent.click(screen.getByRole('button', { name: /^(Ready|Play another)$/ }));
    for (const p of players) p.setReady(true);
    await settle(200);
    if (reveal) await settle(REVEAL_COUNTDOWN_MS);
  }

  /** Disconnects the test's players. */
  async close() {
    for (const client of this.others) await client.close();
  }
}
