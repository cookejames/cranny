import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BeforeInstallPromptEvent } from '../install/install.ts';
import { saveMultiplayerStats, saveStats } from '../storage/storage.ts';
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
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows solo and multiplayer stats together once there are multiplayer finishes', () => {
    saveStats({ solved: 12, bestMs: 61_900, recentMs: [70_000, 80_000] });
    saveMultiplayerStats({ solved: 3, bestMs: 42_300, recentMs: [42_300, 50_000, 57_700] });
    renderHome();
    const table = screen.getByRole('table', { name: 'Your stats' });
    const headers = within(table).getAllByRole('columnheader');
    expect(headers.map((h) => h.textContent)).toEqual(['Best', 'Average', 'Solved']);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((r) => r.textContent)).toEqual(['Solo1:011:1512', 'Multiplayer0:420:503']);
    expect(within(rows[1]!).getByRole('rowheader')).toHaveTextContent('Multiplayer');
  });

  it('shows the multiplayer stats on their own before any solo solve', () => {
    saveMultiplayerStats({ solved: 1, bestMs: 42_300, recentMs: [42_300] });
    renderHome();
    const rows = within(screen.getByRole('table', { name: 'Your stats' }))
      .getAllByRole('row')
      .slice(1);
    expect(rows.map((r) => r.textContent)).toEqual(['Multiplayer0:420:421']);
  });

  describe('Install app', () => {
    const ANDROID_CHROME =
      'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36';
    const IPHONE_SAFARI =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';

    afterEach(() => {
      vi.restoreAllMocks();
      Reflect.deleteProperty(navigator, 'standalone');
    });

    /** Fires a fake `beforeinstallprompt` whose dialog ends in `outcome`; returns its `prompt`. */
    function offerInstall(outcome: 'accepted' | 'dismissed') {
      const event = new Event('beforeinstallprompt', {
        cancelable: true,
      }) as BeforeInstallPromptEvent;
      const prompt = vi.fn(() => Promise.resolve());
      Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome, platform: 'web' }) });
      act(() => {
        window.dispatchEvent(event);
      });
      return prompt;
    }

    const installButton = () => screen.queryByRole('button', { name: 'Install app' });

    it('is hidden when the browser offers no install', () => {
      renderHome();
      expect(installButton()).not.toBeInTheDocument();
    });

    it('opens the browser’s install dialog once offered on Android, and hides after', async () => {
      vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ANDROID_CHROME);
      renderHome();
      const prompt = offerInstall('accepted');
      fireEvent.click(installButton()!);
      expect(prompt).toHaveBeenCalledTimes(1);
      await act(async () => {});
      expect(installButton()).not.toBeInTheDocument();
    });

    it('is hidden on a desktop, even when the browser offers an install', () => {
      vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
      );
      renderHome();
      offerInstall('accepted');
      expect(installButton()).not.toBeInTheDocument();
    });

    it('shows Add to Home Screen instructions on iPhone Safari', () => {
      vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE_SAFARI);
      renderHome();
      fireEvent.click(installButton()!);
      const dialog = screen.getByRole('dialog', { name: 'Install Cranny' });
      expect(dialog).toHaveTextContent(/Tap Share.*Add to Home Screen/);
      expect(dialog).toHaveTextContent('The app keeps its own stats');
      fireEvent.click(screen.getByRole('button', { name: 'Done' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('is hidden when running as the installed app', () => {
      vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE_SAFARI);
      Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
      renderHome();
      offerInstall('accepted');
      expect(installButton()).not.toBeInTheDocument();
    });
  });
});
