import { isPlayerId } from '@cranny/multiplayer';
import { describe, expect, it } from 'vitest';
import {
  loadMultiplayerRound,
  loadSeat,
  saveMultiplayerRound,
  saveSeat,
} from '../storage/storage.ts';
import { claimSeat, forgetSeat, seatIdFor, seatLockName, tryLock } from './seat.ts';
import { fakeLocks } from './testing.ts';

const A = 'A'.repeat(22);

const board = {
  room: 'amber-otter-quilt',
  round: 2,
  version: 1,
  seed: 42,
  revealedAt: 1_000,
  orientations: {},
  placements: {},
  finishedMs: null,
};

describe('claimSeat', () => {
  it('keeps this tab’s seat for the same room, and holds its lock until released', async () => {
    const locks = fakeLocks();
    saveSeat({ room: 'amber-otter-quilt', playerId: A });
    saveMultiplayerRound(board);
    const claim = await claimSeat('amber-otter-quilt', { locks });
    expect(claim.self).toBe(A);
    expect(locks.held).toEqual(new Set([seatLockName(A)]));
    expect(loadMultiplayerRound()).toEqual(board);
    claim.release();
    await Promise.resolve();
    await Promise.resolve();
    expect(locks.held.size).toBe(0);
  });

  it('takes a new seat, and forgets the old board, when the saved seat is for another room', async () => {
    saveSeat({ room: 'other-room', playerId: A });
    saveMultiplayerRound({ ...board, room: 'other-room' });
    const claim = await claimSeat('amber-otter-quilt', { locks: fakeLocks() });
    expect(claim.self).not.toBe(A);
    expect(isPlayerId(claim.self)).toBe(true);
    expect(loadSeat()).toEqual({ room: 'amber-otter-quilt', playerId: claim.self });
    expect(loadMultiplayerRound()).toBeNull();
  });

  it('takes a new seat in a duplicated tab, whose copied seat another tab holds', async () => {
    const locks = fakeLocks();
    saveSeat({ room: 'amber-otter-quilt', playerId: A });
    saveMultiplayerRound(board);
    const original = await claimSeat('amber-otter-quilt', { locks });
    // The duplicate starts with a copy of the original's session storage.
    const duplicate = await claimSeat('amber-otter-quilt', { locks });
    expect(original.self).toBe(A);
    expect(duplicate.self).not.toBe(A);
    expect(loadSeat()?.playerId).toBe(duplicate.self);
    expect(loadMultiplayerRound()).toBeNull();
  });

  it('keeps the seat without Web Locks, as a duplicated tab then shares it', async () => {
    saveSeat({ room: 'amber-otter-quilt', playerId: A });
    expect((await claimSeat('amber-otter-quilt', { locks: null })).self).toBe(A);
    expect((await claimSeat('amber-otter-quilt', { locks: null })).self).toBe(A);
  });
});

describe('tryLock', () => {
  it('skips the check if the lock request fails', async () => {
    const locks = { request: () => Promise.reject(new Error('SecurityError')) };
    await expect(tryLock('x', locks as never)).resolves.toBeTypeOf('function');
  });
});

describe('seatIdFor', () => {
  it('reuses the saved seat for the same room and makes a new one otherwise', () => {
    saveSeat({ room: 'amber-otter-quilt', playerId: A });
    expect(seatIdFor('amber-otter-quilt')).toBe(A);
    const other = seatIdFor('other-room');
    expect(other).not.toBe(A);
    expect(loadSeat()).toEqual({ room: 'other-room', playerId: other });
  });
});

describe('forgetSeat', () => {
  it('forgets the seat and its board', () => {
    saveSeat({ room: 'amber-otter-quilt', playerId: A });
    saveMultiplayerRound(board);
    forgetSeat();
    expect(loadSeat()).toBeNull();
    expect(loadMultiplayerRound()).toBeNull();
  });
});
