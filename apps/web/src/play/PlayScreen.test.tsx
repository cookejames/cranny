import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import { PlayScreen } from './PlayScreen.tsx';

/** Renders the play screen in a router, with a stand-in page for `/play`. */
function renderPlay(props: { startSolved?: boolean; shared?: boolean } = {}) {
  return render(
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
    expect(screen.getByText('9 of 9 placed')).toBeInTheDocument();
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
