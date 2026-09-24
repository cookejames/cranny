import { describe, expect, it } from 'vitest';
import { EMPTY_STATS, RECENT_LIMIT } from '../storage/storage.ts';
import { averageMs, recordSolve } from './stats.ts';

describe('recordSolve', () => {
  it('counts the first solve as a new best', () => {
    const { stats, outcome } = recordSolve(EMPTY_STATS, 68_400);
    expect(stats).toEqual({ solved: 1, bestMs: 68_400, recentMs: [68_400] });
    expect(outcome).toEqual({
      ms: 68_400,
      previousBestMs: null,
      newBest: true,
      averageMs: 68_400,
      solved: 1,
    });
  });

  it('keeps the best time and reports whether it was beaten', () => {
    const before = { solved: 2, bestMs: 60_000, recentMs: [60_000, 80_000] };
    const slower = recordSolve(before, 70_000);
    expect(slower.stats.bestMs).toBe(60_000);
    expect(slower.outcome).toMatchObject({ newBest: false, previousBestMs: 60_000, solved: 3 });
    expect(slower.outcome.averageMs).toBe(70_000);
    const faster = recordSolve(before, 50_000);
    expect(faster.stats.bestMs).toBe(50_000);
    expect(faster.outcome.newBest).toBe(true);
  });

  it('does not call equalling the best a new best', () => {
    const before = { solved: 1, bestMs: 60_000, recentMs: [60_000] };
    expect(recordSolve(before, 60_000).outcome.newBest).toBe(false);
  });

  it('averages only the most recent solves', () => {
    const before = { solved: 50, bestMs: 1, recentMs: Array(RECENT_LIMIT).fill(1_000) as number[] };
    const { stats } = recordSolve(before, 11_000);
    expect(stats.recentMs).toHaveLength(RECENT_LIMIT);
    expect(stats.recentMs.at(-1)).toBe(11_000);
    expect(averageMs(stats)).toBe(2_000);
  });

  it('has no average before the first solve', () => {
    expect(averageMs(EMPTY_STATS)).toBeNull();
  });
});
