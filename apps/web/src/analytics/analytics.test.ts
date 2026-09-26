import { afterEach, describe, expect, it, vi } from 'vitest';
import { durationBucket, scrubProperties, scrubUrl } from './analytics.ts';

const posthog = vi.hoisted(() => ({ init: vi.fn(), capture: vi.fn() }));
vi.mock('posthog-js', () => ({ default: posthog }));

/** A fresh copy of the module, so it reads `VITE_POSTHOG_KEY` as currently stubbed. */
async function freshAnalytics() {
  vi.resetModules();
  return import('./analytics.ts');
}

afterEach(() => {
  vi.unstubAllEnvs();
  posthog.init.mockClear();
  posthog.capture.mockClear();
});

describe('durationBucket', () => {
  it('buckets solve times by minute', () => {
    expect(durationBucket(59_999)).toBe('<1m');
    expect(durationBucket(60_000)).toBe('1-2m');
    expect(durationBucket(150_000)).toBe('2-5m');
    expect(durationBucket(300_000)).toBe('5-10m');
    expect(durationBucket(600_000)).toBe('10m+');
  });
});

describe('scrubUrl', () => {
  it('replaces room names and grid codes', () => {
    expect(scrubUrl('https://cranny.cooke.ing/m/quiet-otter')).toBe(
      'https://cranny.cooke.ing/m/:room',
    );
    expect(scrubUrl('/g/1XDWT5H')).toBe('/g/:code');
  });

  it('drops the query and fragment', () => {
    expect(scrubUrl('https://cranny.cooke.ing/g/1XDWT5H?solve#x')).toBe(
      'https://cranny.cooke.ing/g/:code',
    );
  });

  it('leaves other paths alone', () => {
    expect(scrubUrl('https://cranny.cooke.ing/multiplayer')).toBe(
      'https://cranny.cooke.ing/multiplayer',
    );
  });
});

describe('scrubProperties', () => {
  it('scrubs URL, path and referrer properties only', () => {
    expect(
      scrubProperties({
        $current_url: 'https://cranny.cooke.ing/m/quiet-otter',
        $pathname: '/g/1XDWT5H',
        $referrer: 'https://example.com/?q=1',
        kind: '/m/not-a-url-property',
        players: 3,
      }),
    ).toEqual({
      $current_url: 'https://cranny.cooke.ing/m/:room',
      $pathname: '/g/:code',
      $referrer: 'https://example.com/',
      kind: '/m/not-a-url-property',
      players: 3,
    });
  });
});

describe('track', () => {
  it('does nothing without a key', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', '');
    const { analyticsEnabled, track } = await freshAnalytics();
    expect(analyticsEnabled).toBe(false);
    track({ name: 'mp_room_joined' });
    await vi.dynamicImportSettled();
    expect(posthog.init).not.toHaveBeenCalled();
    expect(posthog.capture).not.toHaveBeenCalled();
  });

  it('starts PostHog cookieless once and sends each event', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test');
    const { track } = await freshAnalytics();
    track({ name: 'solo_round_started', shared: false });
    track({ name: 'install_clicked', platform: 'ios' });
    await vi.waitFor(() => expect(posthog.capture).toHaveBeenCalledTimes(2));
    expect(posthog.init).toHaveBeenCalledOnce();
    expect(posthog.init).toHaveBeenCalledWith(
      'phc_test',
      expect.objectContaining({
        api_host: '/relay',
        cookieless_mode: 'always',
        autocapture: false,
      }),
    );
    expect(posthog.capture).toHaveBeenNthCalledWith(1, 'solo_round_started', { shared: false });
    expect(posthog.capture).toHaveBeenNthCalledWith(2, 'install_clicked', { platform: 'ios' });
  });

  it('never throws when PostHog does', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test');
    posthog.capture.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    const { track } = await freshAnalytics();
    expect(() => track({ name: 'mp_room_joined' })).not.toThrow();
    await vi.waitFor(() => expect(posthog.capture).toHaveBeenCalled());
  });
});
