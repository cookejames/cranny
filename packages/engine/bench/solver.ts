// Solver timing benchmark for the specs/2026-09-25-single-player/SPEC.md §4 budget (worst case under 50 ms on a mid-range phone).
// Run with `pnpm --filter @cranny/engine bench`. Plain Node, not Vitest: Vitest's module runner
// makes the solver ~2.5× slower, which would distort the numbers.
import { BLOCKED_COUNT, CELL_COUNT, generateGrid, mulberry32, solve } from '../src/index.ts';

// The engine has no Node or DOM types, so declare the few globals this script uses.
const { performance, process, console } = globalThis as unknown as {
  performance: { now(): number };
  process: { exitCode?: number };
  console: { log(message: string): void };
};

/** Desktop limit: a mid-range phone is assumed to be about 3× slower than an Apple M-series Mac. */
const DESKTOP_LIMIT_MS = 50 / 3;
const SLOWEST_KNOWN = [0, 19, 21, 23, 31, 33, 35];

/** Runs `fn` once and returns how long it took in milliseconds. */
const time = (fn: () => void) => {
  const start = performance.now();
  fn();
  return performance.now() - start;
};

// Cold: the first solve in a fresh process, as on a phone that has just loaded the game.
const cold = time(() => solve(SLOWEST_KNOWN));

// Warm: worst case over many random layouts plus all golden-seed style generations.
const rand = mulberry32(2024);
let worst = { ms: 0, blocked: [] as number[] };
for (let i = 0; i < 20000; i++) {
  const cells = new Set<number>();
  while (cells.size < BLOCKED_COUNT) cells.add(Math.floor(rand() * CELL_COUNT));
  const blocked = [...cells].sort((a, b) => a - b);
  const ms = time(() => solve(blocked));
  if (ms > worst.ms) worst = { ms, blocked };
}
let slowestKnown = Infinity;
for (let run = 0; run < 5; run++)
  slowestKnown = Math.min(
    slowestKnown,
    time(() => solve(SLOWEST_KNOWN)),
  );
const generate1000 = time(() => {
  for (let seed = 0; seed < 1000; seed++) generateGrid(seed * 7919);
});

/** Formats milliseconds for the report, e.g. `12.34 ms`. */
const fmt = (ms: number) => `${ms.toFixed(2)} ms`;
console.log(`cold solve, slowest known layout:   ${fmt(cold)}`);
console.log(`warm solve, slowest known layout:   ${fmt(slowestKnown)}`);
console.log(
  `warm worst of 20,000 random:        ${fmt(worst.ms)}  ${JSON.stringify(worst.blocked)}`,
);
console.log(`generate 1,000 grids:               ${fmt(generate1000)}`);
console.log(`desktop limit (phone budget / 3):   ${fmt(DESKTOP_LIMIT_MS)}`);

if (Math.max(slowestKnown, worst.ms) > DESKTOP_LIMIT_MS) {
  console.log('OVER BUDGET');
  process.exitCode = 1;
}
