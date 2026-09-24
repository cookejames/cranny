import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from './App.tsx';

/** Exposes the router's current path so tests can assert on redirects. */
function CurrentPath() {
  return <output data-testid="path">{useLocation().pathname}</output>;
}

/** Renders the app's routes at `path` (which may include a query string) in a memory router. */
function renderAt(path: string, state?: unknown) {
  const url = new URL(path, 'http://localhost');
  return render(
    <MemoryRouter initialEntries={[{ pathname: url.pathname, search: url.search, state }]}>
      <AppRoutes />
      <CurrentPath />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('routes', () => {
  it('shows Home at /', () => {
    renderAt('/');
    expect(screen.getByRole('heading', { name: 'Cranny' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Play' })).toHaveAttribute('href', '/play');
  });

  it('sends /play to a new grid code', () => {
    renderAt('/play');
    expect(screen.getByTestId('path').textContent).toMatch(/^\/g\/1[0-9A-HJKMNP-TV-Z]{6}$/);
    expect(screen.getByRole('grid', { name: 'Board' })).toBeInTheDocument();
    expect(screen.getByText('Beat the clock')).toBeInTheDocument();
  });

  it('shows the play screen for a valid code', () => {
    renderAt('/g/1XDWT5H');
    expect(screen.getByRole('heading', { name: 'Grid 1XDWT5H' })).toBeInTheDocument();
    // Opened directly, not dealt by /play, so it's a shared grid.
    expect(screen.getByText('Shared grid')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
  });

  it('normalises a code typed in lower case or with look-alike letters', () => {
    renderAt('/g/ixdwt5h');
    expect(screen.getByTestId('path')).toHaveTextContent('/g/1XDWT5H');
  });

  it('keeps a dealt grid marked as dealt through the canonical redirect', () => {
    renderAt('/g/ixdwt5h', { dealt: true });
    expect(screen.getByTestId('path')).toHaveTextContent('/g/1XDWT5H');
    expect(screen.getByText('Beat the clock')).toBeInTheDocument();
  });

  it('starts one drop from solved with ?solve in development only', () => {
    renderAt('/g/1XDWT5H?solve');
    expect(screen.getByText('8 of 9 placed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();
    cleanup();
    localStorage.clear(); // Don't resume the round the first render saved.
    vi.stubEnv('DEV', false);
    renderAt('/g/1XDWT5H?solve');
    expect(screen.getByText('0 of 9 placed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
  });

  it('explains a malformed code and offers a new grid', () => {
    renderAt('/g/nope');
    expect(screen.getByText("That grid link isn't valid")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Play a new grid' })).toHaveAttribute('href', '/play');
  });

  it('explains a code from a newer version', () => {
    renderAt('/g/2000000');
    expect(
      screen.getByText('This grid needs a newer version of Cranny. Refresh to update.'),
    ).toBeInTheDocument();
  });

  it('redirects unknown paths to Home', () => {
    renderAt('/nowhere');
    expect(screen.getByTestId('path')).toHaveTextContent(/^\/$/);
  });
});
