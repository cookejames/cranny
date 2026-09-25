import {
  cryptoRandom,
  randomPlayerId,
  type PlayerId,
  type RandomSource,
} from '@cranny/multiplayer';
import { clearMultiplayerRound, clearSeat, loadSeat, saveSeat } from '../storage/storage.ts';

// A seat belongs to one tab (specs/2026-09-25-multiplayer/SPEC.md §2, §10). Session storage keeps
// it through reloads, and a Web Lock held while the tab is in the room tells a duplicated tab
// (which gets a copy of session storage) that the seat is already taken.

/** Releases a held lock. Safe to call more than once. */
export type Release = () => void;

/** The part of `navigator.locks` a seat claim uses, so tests can supply their own. */
export type SeatLocks = Pick<LockManager, 'request'>;

/** The browser's Web Locks, or null where they aren't supported. */
function browserLocks(): SeatLocks | null {
  return typeof navigator === 'undefined' ? null : (navigator.locks ?? null);
}

/** The name of the lock that marks a seat as in use by a tab. */
export const seatLockName = (playerId: PlayerId) => `cranny-seat:${playerId}`;

/**
 * Takes the lock `name` if nobody holds it, and keeps it until released.
 *
 * @returns A release function, or null if another tab holds the lock. Without Web Locks (or if
 *   the request fails) the check is skipped: it resolves to a release that does nothing.
 */
export function tryLock(name: string, locks: SeatLocks | null): Promise<Release | null> {
  if (!locks) return Promise.resolve(() => {});
  return new Promise((resolve) => {
    locks
      .request(name, { ifAvailable: true }, (lock) => {
        if (!lock) {
          resolve(null);
          return;
        }
        // The lock is held until this promise settles.
        return new Promise<void>((release) => resolve(() => release()));
      })
      .catch(() => resolve(() => {}));
  });
}

/** A seat this tab holds for one room. */
export type SeatClaim = { room: string; self: PlayerId; release: Release };

export type ClaimOptions = {
  locks?: SeatLocks | null | undefined;
  random?: RandomSource | undefined;
};

/**
 * Claims this tab's seat in `room` (SPEC §10): the saved seat if it is for this room and no other
 * tab holds it, otherwise a new player id. A new seat also discards any saved multiplayer board,
 * which belonged to the old one. The seat is saved to session storage; the lock is held until
 * `release` (or the tab closes).
 */
export async function claimSeat(room: string, options: ClaimOptions = {}): Promise<SeatClaim> {
  const locks = options.locks === undefined ? browserLocks() : options.locks;
  const saved = loadSeat();
  if (saved?.room === room) {
    const release = await tryLock(seatLockName(saved.playerId), locks);
    if (release) return { room, self: saved.playerId, release };
  }
  // A new seat. With 128 random bits its lock can't be held elsewhere, but take it all the same.
  const self = randomPlayerId(options.random ?? cryptoRandom);
  clearMultiplayerRound();
  saveSeat({ room, playerId: self });
  const release = (await tryLock(seatLockName(self), locks)) ?? (() => {});
  return { room, self, release };
}

/**
 * The player id this tab will use in `room`: its saved seat's id if that is for this room,
 * otherwise a new one, saved as the tab's seat. Used before the room screen claims the seat, to
 * create or join the room with the right id; {@link claimSeat} still checks the lock.
 */
export function seatIdFor(room: string, random: RandomSource = cryptoRandom): PlayerId {
  const saved = loadSeat();
  if (saved?.room === room) return saved.playerId;
  const playerId = randomPlayerId(random);
  clearMultiplayerRound();
  saveSeat({ room, playerId });
  return playerId;
}

/** Gives the seat up after leaving on purpose (SPEC §2): forgets it and its board. */
export function forgetSeat(): void {
  clearSeat();
  clearMultiplayerRound();
}
