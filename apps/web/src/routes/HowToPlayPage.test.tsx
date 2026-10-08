import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AppRoutes } from '../App.tsx';
import { HowToPlayPage } from './HowToPlayPage.tsx';

/** Renders How to play in a router. */
const renderPage = (multiplayer = false) =>
  render(
    <MemoryRouter>
      <HowToPlayPage multiplayer={multiplayer} />
    </MemoryRouter>,
  );

describe('HowToPlayPage', () => {
  it('explains the game, lists every piece and links to a game and Home', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'How to play Cranny' })).toBeVisible();
    expect(screen.getByText(/Cranny is a quick block puzzle game/)).toBeVisible();
    const pieces = within(screen.getByRole('region', { name: 'The pieces' })).getAllByRole(
      'listitem',
    );
    expect(pieces.map((piece) => piece.textContent)).toEqual([
      'Long bar, 4 squares',
      'Square, 4 squares',
      'Tee, 4 squares',
      'Zig, 4 squares',
      'Ell, 4 squares',
      'Bar, 3 squares',
      'Corner, 3 squares',
      'Domino, 2 squares',
      'Single, 1 square',
    ]);
    expect(screen.getByRole('link', { name: 'Play a grid' })).toHaveAttribute('href', '/play');
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
  });

  it('describes multiplayer only in builds that have it', () => {
    renderPage(false);
    expect(screen.queryByText('Multiplayer:')).not.toBeInTheDocument();
    renderPage(true);
    expect(screen.getByText('Multiplayer:')).toBeInTheDocument();
  });

  it('sets its own tab title', () => {
    renderPage();
    expect(document.title).toBe('How to play Cranny – a quick block puzzle game');
  });

  it('is reached from Home', () => {
    render(
      <MemoryRouter>
        <AppRoutes />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('link', { name: 'How to play' }));
    expect(screen.getByRole('heading', { level: 1, name: 'How to play Cranny' })).toBeVisible();
  });
});
