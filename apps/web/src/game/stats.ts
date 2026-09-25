import { RECENT_LIMIT, type Stats } from '../storage/storage.ts';

/** What a solve did to the player's stats, for the Results view (specs/2026-09-25-single-player/SPEC.md §5, §8). */
export type SolveOutcome = {
  /** The solve's time. */
  ms: number;
  /** The best time before this solve; null if it's the first. */
  previousBestMs: number | null;
  /** Whether this solve set a new best (always true for the first solve). */
  newBest: boolean;
  /** Mean of the recent times, including this one. */
  averageMs: number;
  /** Total solves, including this one. */
  solved: number;
};

/** Mean of the recent solve times, or null before the first solve. */
export const averageMs = (stats: Stats): number | null =>
  stats.recentMs.length === 0
    ? null
    : stats.recentMs.reduce((sum, ms) => sum + ms, 0) / stats.recentMs.length;

/**
 * Adds a solve to the stats (specs/2026-09-25-single-player/SPEC.md §8): one more solved, the best time so far, and the last
 * `RECENT_LIMIT` times for the average.
 *
 * @returns The new stats, and the outcome to show on Results.
 */
export function recordSolve(stats: Stats, ms: number): { stats: Stats; outcome: SolveOutcome } {
  const next: Stats = {
    solved: stats.solved + 1,
    bestMs: stats.bestMs === null ? ms : Math.min(stats.bestMs, ms),
    recentMs: [...stats.recentMs, ms].slice(-RECENT_LIMIT),
  };
  return {
    stats: next,
    outcome: {
      ms,
      previousBestMs: stats.bestMs,
      newBest: stats.bestMs === null || ms < stats.bestMs,
      averageMs: averageMs(next)!,
      solved: next.solved,
    },
  };
}
