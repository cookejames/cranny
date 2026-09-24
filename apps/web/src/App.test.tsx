import { render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AppRoutes } from './App.tsx';

/** Exposes the router's current path so tests can assert on redirects. */
function CurrentPath() {
  return <output data-testid="path">{useLocation().pathname}</output>;
}

/** Renders the app's routes at `path` in a memory router. */
function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
      <CurrentPath />
    </MemoryRouter>,
  );
}

describe('routes', () => {
  it('shows Home at /', () => {
    renderAt('/');
    expect(screen.getByRole('heading', { name: 'Tessel' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Play' })).toHaveAttribute('href', '/play');
  });

  it('sends /play to a new grid code', () => {
    renderAt('/play');
    expect(screen.getByTestId('path').textContent).toMatch(/^\/g\/1[0-9A-HJKMNP-TV-Z]{6}$/);
    expect(screen.getByTestId('board-area')).toBeInTheDocument();
  });

  it('shows the play screen for a valid code', () => {
    renderAt('/g/1XDWT5H');
    expect(screen.getByText('Grid 1XDWT5H')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
  });

  it('normalises a code typed in lower case or with look-alike letters', () => {
    renderAt('/g/ixdwt5h');
    expect(screen.getByTestId('path')).toHaveTextContent('/g/1XDWT5H');
  });

  it('explains a malformed code and offers a new grid', () => {
    renderAt('/g/nope');
    expect(screen.getByText("That grid link isn't valid")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Play a new grid' })).toHaveAttribute('href', '/play');
  });

  it('explains a code from a newer version', () => {
    renderAt('/g/2000000');
    expect(
      screen.getByText('This grid needs a newer version of Tessel. Refresh to update.'),
    ).toBeInTheDocument();
  });

  it('redirects unknown paths to Home', () => {
    renderAt('/nowhere');
    expect(screen.getByTestId('path')).toHaveTextContent(/^\/$/);
  });
});
