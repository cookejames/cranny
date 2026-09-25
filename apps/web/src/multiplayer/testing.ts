import type { SeatLocks } from './seat.ts';

/**
 * An in-memory stand-in for `navigator.locks`, shared by the "tabs" of one test the way a
 * browser's locks are. `held` lists the locks currently held.
 */
export function fakeLocks(): SeatLocks & { held: Set<string> } {
  const held = new Set<string>();
  const request = (async (
    name: string,
    options: LockOptions,
    callback: (lock: Lock | null) => unknown,
  ) => {
    if (held.has(name)) {
      if (options.ifAvailable) return callback(null);
      throw new Error('Only ifAvailable requests are faked');
    }
    held.add(name);
    try {
      return await callback({ name, mode: 'exclusive' } as Lock);
    } finally {
      held.delete(name);
    }
  }) as SeatLocks['request'];
  return { held, request };
}
