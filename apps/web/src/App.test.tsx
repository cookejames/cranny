import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from './App.tsx';
import { currentPath, RoomHarness, settle } from './multiplayer/harness.tsx';

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

describe('multiplayer routes', () => {
  it('are absent, with no Home button, in a build without multiplayer', () => {
    renderAt('/');
    expect(screen.queryByRole('link', { name: 'Multiplayer' })).not.toBeInTheDocument();
    cleanup();
    renderAt('/multiplayer');
    expect(screen.getByTestId('path')).toHaveTextContent(/^\/$/);
    cleanup();
    renderAt('/m/amber-otter-quilt');
    expect(screen.getByTestId('path')).toHaveTextContent(/^\/$/);
  });

  describe('with multiplayer', () => {
    let harness: RoomHarness;

    beforeEach(() => {
      vi.useFakeTimers();
      harness = new RoomHarness();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('adds the Multiplayer button to Home', () => {
      harness.renderTab('/');
      expect(screen.getByRole('link', { name: 'Multiplayer' })).toHaveAttribute(
        'href',
        '/multiplayer',
      );
    });

    it('redirects a room name typed with capitals, spaces or underscores to the canonical one', async () => {
      await harness.addPlayer('amber-otter-quilt', 'B'.repeat(22), 'Teal Otter', true);
      harness.renderTab('/m/Amber_Otter%20Quilt');
      await settle(500);
      expect(currentPath()).toBe('/m/amber-otter-quilt');
      expect(screen.getByRole('heading', { name: 'amber-otter-quilt' })).toBeInTheDocument();
      await harness.close();
    });

    it('sends an invalid room name back to the Multiplayer screen', async () => {
      harness.renderTab('/m/a!');
      await settle(0);
      expect(currentPath()).toBe('/multiplayer');
      expect(screen.getByRole('alert')).toHaveTextContent('Room names are 3–32 letters');
    });
  });
});
