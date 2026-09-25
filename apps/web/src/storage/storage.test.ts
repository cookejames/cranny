import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EMPTY_STATS,
  LOCAL_ROOMS_KEY,
  MULTIPLAYER_PREFS_KEY,
  MULTIPLAYER_ROUND_KEY,
  PLAYER_KEY,
  ROUND_KEY,
  SEAT_KEY,
  STATS_KEY,
  clearMultiplayerRound,
  clearRound,
  clearSeat,
  loadLocalRooms,
  loadMultiplayerPrefs,
  loadMultiplayerRound,
  loadPlayerName,
  loadRound,
  loadSeat,
  loadStats,
  saveLocalRooms,
  saveMultiplayerPrefs,
  saveMultiplayerRound,
  savePlayerName,
  saveRound,
  saveSeat,
  saveStats,
  type SavedMultiplayerRound,
  type SavedRound,
} from './storage.ts';

const round: SavedRound = {
  code: '1XDWT5H',
  startedAt: 1_760_000_000_000,
  placements: { D2: { origin: 0, orientation: { rot: 0, flip: false } } },
  orientations: { D2: { rot: 0, flip: false }, L4: { rot: 3, flip: true } },
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('stats', () => {
  it('returns empty stats when nothing is stored', () => {
    expect(loadStats()).toEqual(EMPTY_STATS);
  });

  it('round-trips', () => {
    const stats = { solved: 3, bestMs: 61_200, recentMs: [70_000, 61_200, 83_500] };
    expect(saveStats(stats)).toBe(true);
    expect(loadStats()).toEqual(stats);
  });

  it('ignores invalid JSON', () => {
    localStorage.setItem(STATS_KEY, '{not json');
    expect(loadStats()).toEqual(EMPTY_STATS);
  });

  it('replaces invalid fields individually', () => {
    localStorage.setItem(
      STATS_KEY,
      JSON.stringify({ solved: 4, bestMs: -5, recentMs: [1000, 'x', null, 2000, Infinity] }),
    );
    expect(loadStats()).toEqual({ solved: 4, bestMs: null, recentMs: [1000, 2000] });
  });

  it('keeps only the last 10 recent times', () => {
    localStorage.setItem(
      STATS_KEY,
      JSON.stringify({ solved: 12, bestMs: 1, recentMs: Array.from({ length: 12 }, (_, i) => i) }),
    );
    expect(loadStats().recentMs).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });
});

describe('round in progress', () => {
  it('round-trips and can be cleared', () => {
    expect(saveRound(round)).toBe(true);
    expect(loadRound()).toEqual(round);
    clearRound();
    expect(loadRound()).toBeNull();
  });

  it('rejects a round with an invalid grid code or start time', () => {
    localStorage.setItem(ROUND_KEY, JSON.stringify({ ...round, code: 'nope' }));
    expect(loadRound()).toBeNull();
    localStorage.setItem(ROUND_KEY, JSON.stringify({ ...round, startedAt: 'yesterday' }));
    expect(loadRound()).toBeNull();
  });

  it('drops malformed placements and orientations but keeps the rest', () => {
    localStorage.setItem(
      ROUND_KEY,
      JSON.stringify({
        ...round,
        placements: {
          D2: { origin: 0, orientation: { rot: 0, flip: false } },
          T4: { origin: 99, orientation: { rot: 0, flip: false } },
          XX: { origin: 1, orientation: { rot: 0, flip: false } },
          M1: { origin: 2, orientation: { rot: 7, flip: false } },
        },
        orientations: { L4: { rot: 3, flip: true }, I4: { rot: 1, flip: 'yes' } },
      }),
    );
    expect(loadRound()).toMatchObject({
      placements: { D2: { origin: 0, orientation: { rot: 0, flip: false } } },
      orientations: { L4: { rot: 3, flip: true } },
    });
    expect(Object.keys(loadRound()!.placements)).toEqual(['D2']);
  });
});

describe('local rooms', () => {
  it('is empty when nothing is stored', () => {
    expect(loadLocalRooms()).toEqual({ leases: {}, keys: {} });
  });

  it('round-trips', () => {
    const rooms = {
      leases: { 'otter-bramble': { channel: 'local-x', expiresAt: 5 } },
      keys: { 'local-x': { roomKey: 'k', keepUntil: 9 } },
    };
    expect(saveLocalRooms(rooms)).toBe(true);
    expect(loadLocalRooms()).toEqual(rooms);
  });

  it('drops entries that don’t validate and keeps the rest', () => {
    localStorage.setItem(
      LOCAL_ROOMS_KEY,
      JSON.stringify({
        leases: {
          'good-name': { channel: 'local-x', expiresAt: 5 },
          'Bad Name!': { channel: 'local-y', expiresAt: 5 },
          'no-time': { channel: 'local-z' },
          'wrong-type': 'local-w',
        },
        keys: {
          'local-x': { roomKey: 'k', keepUntil: 9 },
          'local-y': { roomKey: 3, keepUntil: 9 },
        },
      }),
    );
    expect(loadLocalRooms()).toEqual({
      leases: { 'good-name': { channel: 'local-x', expiresAt: 5 } },
      keys: { 'local-x': { roomKey: 'k', keepUntil: 9 } },
    });
  });

  it('is empty when the stored value is not an object', () => {
    localStorage.setItem(LOCAL_ROOMS_KEY, '[1,2]');
    expect(loadLocalRooms()).toEqual({ leases: {}, keys: {} });
  });
});

describe('player name', () => {
  it('round-trips in local storage', () => {
    expect(loadPlayerName()).toBeNull();
    expect(savePlayerName('Teal Otter')).toBe(true);
    expect(loadPlayerName()).toBe('Teal Otter');
    expect(localStorage.getItem(PLAYER_KEY)).not.toBeNull();
  });

  it('ignores a stored name that isn’t clean', () => {
    localStorage.setItem(PLAYER_KEY, JSON.stringify({ name: '  Teal\u0007 Otter ' }));
    expect(loadPlayerName()).toBeNull();
    localStorage.setItem(PLAYER_KEY, JSON.stringify({ name: 'x'.repeat(17) }));
    expect(loadPlayerName()).toBeNull();
  });
});

describe('seat', () => {
  const seat = { room: 'amber-otter-quilt', playerId: 'A'.repeat(22) };

  it('round-trips in session storage, not local storage, and can be cleared', () => {
    expect(saveSeat(seat)).toBe(true);
    expect(loadSeat()).toEqual(seat);
    expect(sessionStorage.getItem(SEAT_KEY)).not.toBeNull();
    expect(localStorage.getItem(SEAT_KEY)).toBeNull();
    clearSeat();
    expect(loadSeat()).toBeNull();
  });

  it('rejects a seat with a bad room name or player id', () => {
    sessionStorage.setItem(SEAT_KEY, JSON.stringify({ ...seat, room: 'Not A Room' }));
    expect(loadSeat()).toBeNull();
    sessionStorage.setItem(SEAT_KEY, JSON.stringify({ ...seat, playerId: 'short' }));
    expect(loadSeat()).toBeNull();
  });
});

describe('multiplayer round', () => {
  const saved: SavedMultiplayerRound = {
    room: 'amber-otter-quilt',
    round: 3,
    version: 1,
    seed: 42,
    revealedAt: 1_760_000_000_000,
    orientations: { L4: { rot: 3, flip: true } },
    placements: { D2: { origin: 0, orientation: { rot: 0, flip: false } } },
    finishedMs: null,
  };

  it('round-trips in session storage, separately from the solo round, and can be cleared', () => {
    saveRound(round);
    expect(saveMultiplayerRound(saved)).toBe(true);
    expect(loadMultiplayerRound()).toEqual(saved);
    expect(saveMultiplayerRound({ ...saved, finishedMs: 61_200 })).toBe(true);
    expect(loadMultiplayerRound()?.finishedMs).toBe(61_200);
    expect(loadRound()).toEqual(round);
    expect(localStorage.getItem(MULTIPLAYER_ROUND_KEY)).toBeNull();
    clearMultiplayerRound();
    expect(loadMultiplayerRound()).toBeNull();
  });

  it('rejects a board whose room, round, grid or times don’t validate', () => {
    for (const bad of [
      { room: 'NOPE' },
      { round: -1 },
      { version: 1.5 },
      { seed: 'x' },
      { revealedAt: null },
      { finishedMs: -1 },
    ]) {
      sessionStorage.setItem(MULTIPLAYER_ROUND_KEY, JSON.stringify({ ...saved, ...bad }));
      expect(loadMultiplayerRound()).toBeNull();
    }
  });

  it('drops malformed placements but keeps the rest', () => {
    sessionStorage.setItem(
      MULTIPLAYER_ROUND_KEY,
      JSON.stringify({ ...saved, placements: { ...saved.placements, XX: 3 } }),
    );
    expect(loadMultiplayerRound()?.placements).toEqual(saved.placements);
  });
});

describe('multiplayer preferences', () => {
  it('shows progress by default and remembers hiding it', () => {
    expect(loadMultiplayerPrefs()).toEqual({ hideProgress: false });
    saveMultiplayerPrefs({ hideProgress: true });
    expect(loadMultiplayerPrefs()).toEqual({ hideProgress: true });
    localStorage.setItem(MULTIPLAYER_PREFS_KEY, JSON.stringify({ hideProgress: 'yes' }));
    expect(loadMultiplayerPrefs()).toEqual({ hideProgress: false });
  });
});

describe('when storage is unavailable', () => {
  it('reads defaults and reports failed writes without throwing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(loadStats()).toEqual(EMPTY_STATS);
    expect(loadRound()).toBeNull();
    expect(saveStats({ solved: 1, bestMs: 1, recentMs: [1] })).toBe(false);
    expect(saveRound(round)).toBe(false);
    expect(() => clearRound()).not.toThrow();
  });

  it('copes with localStorage itself throwing on access', () => {
    vi.spyOn(globalThis, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(loadStats()).toEqual(EMPTY_STATS);
    expect(saveRound(round)).toBe(false);
  });

  it('copes with sessionStorage itself throwing on access', () => {
    vi.spyOn(globalThis, 'sessionStorage', 'get').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(loadSeat()).toBeNull();
    expect(saveSeat({ room: 'amber-otter-quilt', playerId: 'A'.repeat(22) })).toBe(false);
    expect(() => clearMultiplayerRound()).not.toThrow();
  });
});
