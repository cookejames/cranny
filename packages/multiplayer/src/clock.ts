/** An opaque timer handle from {@link Clock.setTimeout}. */
export type TimerHandle = unknown;

/**
 * Time and timers, injected because the package has no DOM or Node types. Times are milliseconds
 * on this device's clock and are never sent to other players (SPEC §5.4).
 */
export type Clock = {
  now(): number;
  setTimeout(callback: () => void, ms: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
};

type Timers = {
  setTimeout(callback: () => void, ms: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
};

/** The platform clock. Globals are looked up on every call, so test fake timers apply. */
export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => (globalThis as unknown as Timers).setTimeout(callback, ms),
  clearTimeout: (handle) => (globalThis as unknown as Timers).clearTimeout(handle),
};
