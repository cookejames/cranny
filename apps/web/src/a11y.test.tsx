import { newBoard } from '@cranny/engine';
import { fireEvent, render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppRoutes } from './App.tsx';
import { Results } from './play/Results.tsx';
import { saveStats } from './storage/storage.ts';

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

  it('Home, with stats', async () => {
    saveStats({ solved: 3, bestMs: 61_000, recentMs: [61_000, 70_000, 80_000] });
    renderAt('/');
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
});
