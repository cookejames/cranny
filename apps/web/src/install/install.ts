import { useSyncExternalStore } from 'react';

/**
 * Installing the app (specs/2026-09-25-installable/SPEC.md §5), offered on phones and tablets
 * only. Chromium browsers fire `beforeinstallprompt` when the app can be installed, possibly
 * before React mounts, so {@link listenForInstall} runs from main.tsx and, on Android, holds the
 * event until the Install app button uses it. Safari on iPhone and iPad has no such event, only
 * Share → Add to Home Screen, so there the button shows instructions instead. Desktops get no
 * button: their browsers' own install icon in the address bar is left alone.
 */

/** Chromium's `beforeinstallprompt` event, which TypeScript's DOM types don't include. */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<unknown>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

/**
 * What the Install app button can do here: open the browser's install dialog (`prompt`), show
 * the Add to Home Screen instructions (`ios`), or nothing, so it isn't shown (`none`).
 */
export type InstallOption = 'prompt' | 'ios' | 'none';

/**
 * Whether a user agent is Safari on an iPhone, iPad or iPod, which can add the app to the home
 * screen but has no install event. iPadOS reports itself as a Mac, so a Mac with a touch screen
 * counts too. Other browsers on iOS (Chrome, Firefox, Edge, in-app browsers) are excluded: they
 * either lack Add to Home Screen or, on older iOS, can't use it.
 *
 * @param maxTouchPoints - `navigator.maxTouchPoints`: 0 on a Mac, 5 on an iPad.
 */
export function isIosSafari(userAgent: string, maxTouchPoints: number): boolean {
  const ios =
    /\b(iPhone|iPad|iPod)\b/.test(userAgent) ||
    (/\bMacintosh\b/.test(userAgent) && maxTouchPoints > 1);
  // Safari says `Version/…` and `Safari/…`; Chrome and Firefox on iOS leave out Version, and
  // most in-app browsers leave out Safari. Edge and the rest say both, so they're named.
  const safari = /\bVersion\/[\d.]+.*\bSafari\//.test(userAgent);
  const otherBrowser = /\b(CriOS|FxiOS|EdgiOS|OPiOS|OPT|GSA|DuckDuckGo|YaBrowser)\//.test(
    userAgent,
  );
  return ios && safari && !otherBrowser;
}

/** Whether a user agent is on Android, where the Install app button uses the browser's dialog. */
export function isAndroid(userAgent: string): boolean {
  return /\bAndroid\b/.test(userAgent);
}

/** Whether the page is running as the installed app rather than in a browser tab. */
export function isStandalone(win: Window): boolean {
  const iosStandalone = (win.navigator as Navigator & { standalone?: boolean }).standalone;
  return iosStandalone === true || win.matchMedia?.('(display-mode: standalone)').matches === true;
}

/** Holds the install event and the installed state for one window, for `useSyncExternalStore`. */
export class InstallStore {
  readonly #win: Window;
  #held: BeforeInstallPromptEvent | null = null;
  #installed = false;
  #listening = false;
  readonly #listeners = new Set<() => void>();

  /** A store for `win`, not yet listening for its install events. */
  constructor(win: Window) {
    this.#win = win;
  }

  /**
   * Starts listening for `beforeinstallprompt` and `appinstalled`. Safe to call again: it only
   * listens once. The install event is held only on Android; elsewhere the browser keeps it, so
   * desktop browsers go on offering the install their own way.
   */
  listen(): void {
    if (this.#listening) return;
    this.#listening = true;
    this.#win.addEventListener('beforeinstallprompt', (event) => {
      if (!isAndroid(this.#win.navigator.userAgent)) return;
      // Stop the browser's own mini-infobar, and keep the event for the Install app button.
      event.preventDefault();
      this.#held = event as BeforeInstallPromptEvent;
      this.#emit();
    });
    this.#win.addEventListener('appinstalled', () => {
      this.#installed = true;
      this.#held = null;
      this.#emit();
    });
  }

  /** Registers a change listener, and returns the function that removes it. */
  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  /** What the Install app button can do now. */
  getSnapshot = (): InstallOption => {
    if (this.#installed || isStandalone(this.#win)) return 'none';
    if (this.#held) return 'prompt';
    const { userAgent, maxTouchPoints } = this.#win.navigator;
    return isIosSafari(userAgent, maxTouchPoints) ? 'ios' : 'none';
  };

  /**
   * Opens the browser's install dialog with the held event. The event works only once, so it is
   * dropped straight away and the button hides until the browser fires another. Does nothing
   * without a held event.
   */
  async prompt(): Promise<void> {
    const event = this.#held;
    if (!event) return;
    this.#held = null;
    this.#emit();
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === 'accepted') {
      this.#installed = true;
      this.#emit();
    }
  }

  /** Forgets the held event and the installed state (tests only; listeners stay). */
  reset(): void {
    this.#held = null;
    this.#installed = false;
    this.#emit();
  }

  /** Tells every subscriber the snapshot may have changed. */
  #emit(): void {
    for (const listener of this.#listeners) listener();
  }
}

/**
 * The app's one store, for the page's window. Through `globalThis`, which is the window in a
 * browser, so importing this in a test without a DOM doesn't throw (test/setup.ts does).
 */
export const install = new InstallStore(globalThis as unknown as Window);

/** Starts holding the browser's install event; called from main.tsx before React renders. */
export function listenForInstall(): void {
  install.listen();
}

/**
 * What the Install app button can do now, updating when the browser offers or completes an
 * install. Starts listening if main.tsx hasn't already (as in component tests).
 */
export function useInstallOption(): InstallOption {
  install.listen();
  return useSyncExternalStore(install.subscribe, install.getSnapshot);
}
