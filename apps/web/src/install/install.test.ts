import { describe, expect, it, vi } from 'vitest';
import {
  InstallStore,
  isAndroid,
  isIosSafari,
  isStandalone,
  type BeforeInstallPromptEvent,
} from './install.ts';

/** Real user-agent strings, and whether each is Safari on iOS or iPadOS. */
const USER_AGENTS: [name: string, userAgent: string, maxTouchPoints: number, expected: boolean][] =
  [
    [
      'iPhone Safari',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
      5,
      true,
    ],
    [
      'iPad Safari, reporting itself as a Mac',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
      5,
      true,
    ],
    [
      'iPad Safari in mobile mode',
      'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
      5,
      true,
    ],
    [
      'desktop Safari',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
      0,
      false,
    ],
    [
      'Chrome on iPhone (CriOS)',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.156 Mobile/15E148 Safari/604.1',
      5,
      false,
    ],
    [
      'Firefox on iPhone (FxiOS)',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/141.0 Mobile/15E148 Safari/605.1.15',
      5,
      false,
    ],
    [
      'Edge on iPhone (EdgiOS)',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 EdgiOS/138.3351.109 Mobile/15E148 Safari/605.1.15',
      5,
      false,
    ],
    [
      'an in-app browser on iPhone (Instagram)',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 389.0.0.49.87',
      5,
      false,
    ],
    [
      'Android Chrome',
      'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36',
      5,
      false,
    ],
    [
      'desktop Chrome',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
      0,
      false,
    ],
  ];

const ANDROID_CHROME = USER_AGENTS[8]![1];
const DESKTOP_CHROME = USER_AGENTS[9]![1];
const IPHONE_SAFARI = USER_AGENTS[0]![1];

/** A fake `beforeinstallprompt` event whose install dialog ends in `outcome`. */
function installEvent(outcome: 'accepted' | 'dismissed') {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as BeforeInstallPromptEvent;
  const prompt = vi.fn(() => Promise.resolve());
  Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome, platform: 'web' }) });
  return { event, prompt };
}

/**
 * A stand-in window: a real event target, with the user agent, touch points, standalone flag and
 * display mode under the test's control.
 */
function fakeWindow({
  userAgent = ANDROID_CHROME,
  maxTouchPoints = 0,
  standalone = undefined as boolean | undefined,
  displayMode = 'browser',
} = {}) {
  const target = new EventTarget();
  return Object.assign(target, {
    navigator: { userAgent, maxTouchPoints, standalone },
    matchMedia: (query: string) => ({ matches: query === `(display-mode: ${displayMode})` }),
  }) as unknown as Window;
}

describe('isIosSafari', () => {
  it.each(USER_AGENTS)('%s → %s', (_name, userAgent, maxTouchPoints, expected) => {
    expect(isIosSafari(userAgent, maxTouchPoints)).toBe(expected);
  });
});

describe('isAndroid', () => {
  it('is true on Android, and false on iOS and desktops', () => {
    expect(isAndroid(ANDROID_CHROME)).toBe(true);
    expect(
      isAndroid(
        'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Safari/537.36',
      ),
    ).toBe(true);
    expect(isAndroid(IPHONE_SAFARI)).toBe(false);
    expect(isAndroid(DESKTOP_CHROME)).toBe(false);
  });
});

describe('isStandalone', () => {
  it('is true in the installed app, by display mode or on iOS by navigator.standalone', () => {
    expect(isStandalone(fakeWindow({ displayMode: 'standalone' }))).toBe(true);
    expect(isStandalone(fakeWindow({ standalone: true }))).toBe(true);
  });

  it('is false in a browser tab', () => {
    expect(isStandalone(fakeWindow())).toBe(false);
    expect(isStandalone(fakeWindow({ standalone: false }))).toBe(false);
  });
});

describe('InstallStore', () => {
  /** A listening store over a fake window, with a count of its change notifications. */
  function setUp(options?: Parameters<typeof fakeWindow>[0]) {
    const win = fakeWindow(options);
    const store = new InstallStore(win);
    store.listen();
    const changed = vi.fn();
    store.subscribe(changed);
    return { win, store, changed };
  }

  it('offers nothing until the browser fires beforeinstallprompt', () => {
    const { store } = setUp();
    expect(store.getSnapshot()).toBe('none');
  });

  it('holds the event, stopping the browser’s own prompt', () => {
    const { win, store, changed } = setUp();
    const { event } = installEvent('accepted');
    win.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(store.getSnapshot()).toBe('prompt');
    expect(changed).toHaveBeenCalled();
  });

  it('prompts once, and offers nothing after the player accepts', async () => {
    const { win, store } = setUp();
    const { event, prompt } = installEvent('accepted');
    win.dispatchEvent(event);
    await store.prompt();
    await store.prompt();
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toBe('none');
  });

  it('drops a dismissed event, and offers again when the browser fires a new one', async () => {
    const { win, store } = setUp();
    win.dispatchEvent(installEvent('dismissed').event);
    await store.prompt();
    expect(store.getSnapshot()).toBe('none');
    win.dispatchEvent(installEvent('accepted').event);
    expect(store.getSnapshot()).toBe('prompt');
  });

  it('offers nothing once the app is installed another way', () => {
    const { win, store } = setUp();
    win.dispatchEvent(installEvent('accepted').event);
    win.dispatchEvent(new Event('appinstalled'));
    expect(store.getSnapshot()).toBe('none');
  });

  it('leaves the event to the browser on a desktop, and offers nothing', () => {
    const { win, store, changed } = setUp({ userAgent: DESKTOP_CHROME });
    const { event } = installEvent('accepted');
    win.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(store.getSnapshot()).toBe('none');
    expect(changed).not.toHaveBeenCalled();
  });

  it('offers the instructions on iOS Safari', () => {
    const { store } = setUp({ userAgent: IPHONE_SAFARI, maxTouchPoints: 5 });
    expect(store.getSnapshot()).toBe('ios');
  });

  it('offers nothing when running as the installed app', () => {
    expect(
      setUp({ userAgent: IPHONE_SAFARI, maxTouchPoints: 5, standalone: true }).store.getSnapshot(),
    ).toBe('none');
    const { win, store } = setUp({ displayMode: 'standalone' });
    win.dispatchEvent(installEvent('accepted').event);
    expect(store.getSnapshot()).toBe('none');
  });

  it('listens only once, however often listen is called', () => {
    const { win, store } = setUp();
    store.listen();
    const { event } = installEvent('accepted');
    const preventDefault = vi.spyOn(event, 'preventDefault');
    win.dispatchEvent(event);
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it('stops notifying a listener once it unsubscribes', () => {
    const { win, store } = setUp();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    win.dispatchEvent(installEvent('accepted').event);
    expect(listener).not.toHaveBeenCalled();
  });
});
