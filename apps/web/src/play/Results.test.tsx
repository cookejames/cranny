import { newBoard } from '@cranny/engine';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SolveOutcome } from '../game/stats.ts';
import { Results } from './Results.tsx';
import { TOAST_MS } from './Toast.tsx';

const board = newBoard({ version: 1, seed: 0, blocked: [3, 8, 13, 18, 19, 24, 34] });
const outcome: SolveOutcome = {
  ms: 68_400,
  previousBestMs: 74_000,
  newBest: true,
  averageMs: 91_000,
  solved: 7,
};

/** Renders Results with the given outcome overrides and a spy for Next grid. */
function renderResults(overrides: Partial<SolveOutcome> = {}, shared = false) {
  const onNextGrid = vi.fn();
  render(
    <MemoryRouter>
      <Results
        code="1XDWT5H"
        shared={shared}
        board={board}
        outcome={{ ...outcome, ...overrides }}
        onNextGrid={onNextGrid}
      />
    </MemoryRouter>,
  );
  return onNextGrid;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Results', () => {
  it('shows the time to a tenth, the personal best flag and the stats', () => {
    renderResults();
    expect(screen.getByRole('heading', { name: 'Grid complete' })).toBeInTheDocument();
    expect(screen.getByText('Beat the clock · Grid 1XDWT5H')).toBeInTheDocument();
    expect(screen.getByText('1:08.4')).toBeInTheDocument();
    expect(screen.getByText('New personal best')).toBeInTheDocument();
    expect(screen.getByText('Previous best').nextSibling).toHaveTextContent('1:14');
    expect(screen.getByText('Average').nextSibling).toHaveTextContent('1:31');
    expect(screen.getByText('Solved').nextSibling).toHaveTextContent('7');
  });

  it('leaves out the flag when the best stands, and shows a dash with no previous best', () => {
    renderResults({ newBest: false, previousBestMs: null }, true);
    expect(screen.queryByText('New personal best')).not.toBeInTheDocument();
    expect(screen.getByText('Previous best').nextSibling).toHaveTextContent('—');
    expect(screen.getByText('Shared grid · Grid 1XDWT5H')).toBeInTheDocument();
  });

  it('goes to the next grid', () => {
    const onNextGrid = renderResults();
    fireEvent.click(screen.getByRole('button', { name: 'Next grid' }));
    expect(onNextGrid).toHaveBeenCalledOnce();
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
  });

  it('shares the grid link through the share sheet', async () => {
    const share = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { share });
    renderResults();
    await act(() => fireEvent.click(screen.getByRole('button', { name: 'Share grid' })));
    expect(share).toHaveBeenCalledWith({
      title: 'Cranny',
      text: 'I solved this Cranny grid in 1:08.4 — can you beat it?',
      url: `${window.location.origin}/g/1XDWT5H`,
    });
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('copies the link without a share sheet and says so briefly', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    vi.useFakeTimers();
    renderResults();
    await act(() => fireEvent.click(screen.getByRole('button', { name: 'Share grid' })));
    expect(writeText).toHaveBeenCalledWith(
      `I solved this Cranny grid in 1:08.4 — can you beat it? ${window.location.origin}/g/1XDWT5H`,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Link copied');
    act(() => vi.advanceTimersByTime(TOAST_MS));
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });
});
