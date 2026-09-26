import { newBoard } from '@cranny/engine';
import { fireEvent, render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from './App.tsx';
import { RoomHarness, settle } from './multiplayer/harness.tsx';
import { Results } from './play/Results.tsx';
import { saveMultiplayerStats, saveStats } from './storage/storage.ts';

/**
 * Automated accessibility checks (specs/2026-09-25-single-player/SPEC.md §10) with axe on every screen. jsdom has no layout, so
 * colour contrast is checked separately (styles/contrast.test.ts) and in a real browser, and
 * page-level rules that need layout (such as "the page has an h1") come back incomplete from
 * axe; those are asserted directly.
 */

/**
 * Runs axe on the document and returns its violations, summarised for readable failures. Also
 * checks what axe can't in jsdom: the screen has one main landmark and exactly one h1.
 */
async function violations() {
  expect(screen.getAllByRole('main')).toHaveLength(1);
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  // The whole document, so page-level rules (such as having an h1) apply too.
  const result = await axe.run(document, {
    rules: { 'color-contrast': { enabled: false } },
  });
  return result.violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  );
}

/** Renders the app's routes at `path`. */
const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );

describe('accessibility', () => {
  // What index.html provides on the real page.
  beforeEach(() => {
    document.documentElement.lang = 'en';
    document.title = 'Cranny';
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Home, with stats', async () => {
    saveStats({ solved: 3, bestMs: 61_000, recentMs: [61_000, 70_000, 80_000] });
    renderAt('/');
    expect(await violations()).toEqual([]);
  });

  it('Home, with solo and multiplayer stats', async () => {
    saveStats({ solved: 3, bestMs: 61_000, recentMs: [61_000, 70_000, 80_000] });
    saveMultiplayerStats({ solved: 2, bestMs: 42_000, recentMs: [42_000, 50_000] });
    renderAt('/');
    expect(await violations()).toEqual([]);
  });

  it('Home, with Install app and its iOS instructions open', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
    );
    renderAt('/');
    const button = screen.getByRole('button', { name: 'Install app' });
    expect(await violations()).toEqual([]);
    fireEvent.click(button);
    expect(screen.getByRole('dialog', { name: 'Install Cranny' })).toBeInTheDocument();
    expect(await violations()).toEqual([]);
  });

  it('the play screen before Start', async () => {
    renderAt('/g/1XDWT5H');
    expect(await violations()).toEqual([]);
  });

  it('the play screen while playing, with a piece selected', async () => {
    renderAt('/g/1XDWT5H');
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tee, 4 squares' }), { detail: 0 });
    expect(await violations()).toEqual([]);
  });

  it('Results', async () => {
    render(
      <MemoryRouter>
        {/* Inside the play screen's <main>, as in the app. */}
        <main>
          <Results
            code="1XDWT5H"
            shared={false}
            board={newBoard({ version: 1, seed: 0, blocked: [3, 8, 13, 18, 19, 24, 34] })}
            outcome={{
              ms: 68_400,
              previousBestMs: 74_000,
              newBest: true,
              averageMs: 91_000,
              solved: 7,
            }}
            onNextGrid={() => {}}
          />
        </main>
      </MemoryRouter>,
    );
    expect(await violations()).toEqual([]);
  });

  it('the invalid-link screen', async () => {
    renderAt('/g/nope');
    expect(await violations()).toEqual([]);
  });

  describe('multiplayer', () => {
    let harness: RoomHarness;
    const TEAL = 'B'.repeat(22);

    beforeEach(() => {
      vi.useFakeTimers();
      harness = new RoomHarness();
    });

    afterEach(async () => {
      await harness.close();
      vi.useRealTimers();
    });

    /** axe with real timers: it waits on its own timeouts. */
    const check = async () => {
      vi.useRealTimers();
      const found = await violations();
      vi.useFakeTimers();
      return found;
    };

    it('the Multiplayer screen, with a join error', async () => {
      harness.renderTab('/multiplayer');
      await settle();
      fireEvent.change(screen.getByLabelText('Join a room'), { target: { value: 'nobody-here' } });
      fireEvent.click(screen.getByRole('button', { name: 'Join' }));
      await settle(100);
      expect(await check()).toEqual([]);
    });

    it('the lobby, with the ready countdown', async () => {
      const room = await harness.createRoom();
      const teal = await harness.addPlayer(room, TEAL, 'Teal Otter');
      await harness.addPlayer(room, 'C'.repeat(22), 'Rose Lynx');
      fireEvent.click(screen.getByRole('button', { name: 'Ready' }));
      teal.setReady(true);
      await settle(200);
      expect(await check()).toEqual([]);
    });

    it('the lobby, with a disconnected player', async () => {
      const room = await harness.createRoom();
      await harness.addPlayer(room, TEAL, 'Teal Otter');
      const rose = await harness.addPlayer(room, 'C'.repeat(22), 'Rose Lynx');
      await rose.close();
      await settle(200);
      expect(screen.getByText('disconnected')).toBeInTheDocument();
      expect(await check()).toEqual([]);
    });

    it('the leave confirmation', async () => {
      await harness.createRoom();
      fireEvent.click(screen.getByRole('button', { name: 'Leave the room' }));
      expect(await check()).toEqual([]);
    });

    it('playing, with the progress strip and the close-out', async () => {
      const room = await harness.createRoom();
      const teal = await harness.addPlayer(room, TEAL, 'Teal Otter');
      const rose = await harness.addPlayer(room, 'C'.repeat(22), 'Rose Lynx');
      await harness.startRound([teal, rose]);
      rose.reportProgress(1, 3);
      teal.reportFinished(1, 30_000);
      await settle(200);
      expect(await check()).toEqual([]);
    });

    it('sitting out a round', async () => {
      const room = await harness.createRoom();
      const teal = await harness.addPlayer(room, TEAL, 'Teal Otter');
      const rose = await harness.addPlayer(room, 'C'.repeat(22), 'Rose Lynx');
      fireEvent.click(screen.getByRole('button', { name: 'Ready' }));
      fireEvent.click(screen.getByRole('button', { name: 'Ready' }));
      teal.setReady(true);
      rose.setReady(true);
      await settle(200);
      await settle(30_000);
      expect(screen.getByText('You’ll play from the next round')).toBeInTheDocument();
      expect(await check()).toEqual([]);
    });

    it('the results and totals', async () => {
      const room = await harness.createRoom();
      const teal = await harness.addPlayer(room, TEAL, 'Teal Otter');
      await harness.startRound([teal]);
      teal.reportFinished(1, 30_000);
      await settle(200);
      await settle(60_000);
      expect(screen.getByRole('table')).toBeInTheDocument();
      expect(await check()).toEqual([]);
    });
  });
});
