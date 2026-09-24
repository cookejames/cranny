import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EMPTY_STATS,
  ROUND_KEY,
  STATS_KEY,
  clearRound,
  loadRound,
  loadStats,
  saveRound,
  saveStats,
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
});
