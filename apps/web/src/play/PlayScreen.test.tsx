import { generateGrid } from '@cranny/engine';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadRound, ROUND_KEY, saveRound } from '../storage/storage.ts';
import { PlayScreen } from './PlayScreen.tsx';

/**
 * Renders the play screen in a router, with a stand-in page for `/play`, and presses Start
 * (`?solve` rounds skip it).
 */
function renderPlay(props: { startSolved?: boolean; shared?: boolean; start?: boolean } = {}) {
  const view = render(
    <MemoryRouter initialEntries={['/g/100001A']}>
      <Routes>
        <Route
          path="/g/:code"
          element={
            <PlayScreen
              version={1}
              seed={42}
              code="100001A"
              shared={props.shared ?? false}
              {...props}
            />
          }
        />
        <Route path="/play" element={<p>New grid dealt</p>} />
      </Routes>
    </MemoryRouter>,
  );
  if (!props.startSolved && props.start !== false)
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
  return view;
}

/** The SVG path drawn for a tray piece, which changes when the piece turns. */
const trayShape = (name: RegExp) => screen.getByRole('button', { name }).querySelector('path')!;

describe('PlayScreen', () => {
  it('shows the header, progress, board, controls and all nine pieces', () => {
    renderPlay();
    expect(screen.getByRole('heading', { name: 'Grid 100001A' })).toBeInTheDocument();
    expect(screen.getByText('Beat the clock')).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent('0:00');
    expect(screen.getByText('0 of 9 placed')).toBeInTheDocument();
    expect(screen.getByRole('grid', { name: 'Board' })).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'Pieces' })).getAllByRole('button'),
    ).toHaveLength(9);
  });

  it('labels a shared grid', () => {
    renderPlay({ shared: true });
    expect(screen.getByText('Shared grid')).toBeInTheDocument();
  });

  it('selects a tray piece, then rotates and flips it', () => {
    renderPlay();
    const tee = screen.getByRole('button', { name: 'Tee, 4 squares' });
    expect(tee).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(tee);
    expect(tee).toHaveAttribute('aria-pressed', 'true');

    const before = trayShape(/^Tee/).getAttribute('d');
    fireEvent.click(screen.getByRole('button', { name: 'Rotate' }));
    const rotated = trayShape(/^Tee/).getAttribute('d');
    expect(rotated).not.toBe(before);
    fireEvent.click(screen.getByRole('button', { name: 'Flip' }));
    expect(trayShape(/^Tee/).getAttribute('d')).not.toBe(rotated);
    // Other pieces are untouched.
    expect(screen.getByRole('button', { name: 'Ell, 4 squares' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('moves the selection when another piece is tapped', () => {
    renderPlay();
    fireEvent.click(screen.getByRole('button', { name: 'Tee, 4 squares' }));
    fireEvent.click(screen.getByRole('button', { name: 'Single, 1 square' }));
    expect(screen.getByRole('button', { name: 'Tee, 4 squares' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: 'Single, 1 square' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('shows placed pieces as faded, disabled tiles, and Clear returns them', () => {
    renderPlay({ startSolved: true });
    expect(screen.getByText('8 of 9 placed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tee, 4 squares, placed' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByText('0 of 9 placed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tee, 4 squares' })).toBeEnabled();
  });

  it('confirms before skipping a grid with pieces placed', () => {
    renderPlay({ startSolved: true });
    fireEvent.click(screen.getByRole('button', { name: 'New grid' }));
    expect(screen.queryByText('New grid dealt')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tap again to skip' }));
    expect(screen.getByText('New grid dealt')).toBeInTheDocument();
  });
});

describe('PlayScreen round flow', () => {
  afterEach(() => vi.useRealTimers());

  const blockedCount = () => screen.queryAllByRole('gridcell', { name: /blocked$/ }).length;

  it('hides the blocked squares until Start, then starts the clock', () => {
    vi.useFakeTimers();
    renderPlay({ start: false });
    expect(blockedCount()).toBe(0);
    expect(document.body.innerHTML).not.toMatch(/blocked/i);
    // Nothing can be played before Start.
    fireEvent.click(screen.getByRole('button', { name: 'Tee, 4 squares' }), { detail: 0 });
    expect(screen.getByRole('button', { name: 'Tee, 4 squares' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByRole('timer')).toHaveTextContent('0:00');

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();
    expect(blockedCount()).toBe(7);
    act(() => vi.advanceTimersByTime(65_000));
    expect(screen.getByRole('timer')).toHaveTextContent('1:05');
  });

  it('saves the round in progress after every change', () => {
    vi.useFakeTimers({ now: 1_000_000 });
    renderPlay({ start: false });
    expect(localStorage.getItem(ROUND_KEY)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(loadRound()).toMatchObject({ code: '100001A', startedAt: 1_000_000, placements: {} });
    fireEvent.click(screen.getByRole('button', { name: 'Ell, 4 squares' }), { detail: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'Rotate' }));
    expect(loadRound()?.orientations.L4).toEqual({ rot: 1, flip: false });
  });

  it('resumes a saved round with the clock still running', () => {
    vi.useFakeTimers({ now: 10_000_000 });
    const [free] = [...Array(36).keys()].filter((c) => !generateGrid(42, 1).blocked.includes(c));
    saveRound({
      code: '100001A',
      startedAt: 10_000_000 - 125_000,
      placements: { M1: { orientation: { rot: 0, flip: false }, origin: free! } },
      orientations: { T4: { rot: 2, flip: false } },
    });
    renderPlay({ start: false });
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent('2:05');
    expect(screen.getByText('1 of 9 placed')).toBeInTheDocument();
    expect(blockedCount()).toBe(7);
  });

  it('discards a saved round for a different grid when another grid is opened', () => {
    saveRound({ code: '1XDWT5H', startedAt: 5, placements: {}, orientations: {} });
    renderPlay({ start: false });
    expect(localStorage.getItem(ROUND_KEY)).toBeNull();
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
  });

  it('starts afresh when the saved round for this grid is unusable', () => {
    localStorage.setItem(ROUND_KEY, '{"code":"100001A","startedAt":"soon"}');
    renderPlay({ start: false });
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
  });
});
