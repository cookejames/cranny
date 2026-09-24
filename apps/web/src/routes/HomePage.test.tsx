import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { saveStats } from '../storage/storage.ts';
import { HomePage } from './HomePage.tsx';

/** Renders Home in a router. */
const renderHome = () =>
  render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );

describe('HomePage', () => {
  it('shows the wordmark, tagline and Play, with a decorative board', () => {
    renderHome();
    expect(screen.getByRole('heading', { name: 'Cranny' })).toBeInTheDocument();
    expect(
      screen.getByText('Nine pieces. Seven blocked squares. One grid to fill.'),
    ).toBeInTheDocument();
    const play = screen.getByRole('link', { name: 'Play' });
    expect(play).toHaveAttribute('href', '/play');
    expect(play).toHaveAccessibleDescription(/Beat the clock/);
    // The showcase board is decoration, hidden from assistive technology.
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    expect(document.querySelectorAll('g[data-piece]')).toHaveLength(9);
  });

  it('has no Race card', () => {
    renderHome();
    expect(screen.queryByText(/race/i)).not.toBeInTheDocument();
  });

  it('hides the stats row until the first solve', () => {
    renderHome();
    expect(screen.queryByText('Best')).not.toBeInTheDocument();
  });

  it('shows best, average and solved once there are solves', () => {
    saveStats({ solved: 12, bestMs: 61_900, recentMs: [70_000, 80_000] });
    renderHome();
    const stats = screen.getByLabelText('Your stats');
    expect(stats).toHaveTextContent('Best1:01');
    expect(stats).toHaveTextContent('Average1:15');
    expect(stats).toHaveTextContent('Solved12');
  });
});
