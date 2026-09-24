# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Tessel is a puzzle game. Each round, place nine polyomino pieces on a 6×6 grid with 7 randomly blocked squares. Modes: solo against the clock, and later a multiplayer race where the first player to fill their grid wins. Every player in a race gets the same blocked squares.

Piece set (29 squares = 36 − 7 blocked, so a solved grid has no gaps): five 4-square pieces (I, O, T, S, L), two 3-square pieces (straight bar, corner), one domino, one single square. Pieces can be rotated and flipped.

Build spec: see SPEC.md. Task list and progress: TASKS.md.

## Commands

Node 24 (`.nvmrc`), pnpm 12 (installed globally; version recorded in `packageManager`).

- `pnpm install`
- `pnpm lint` / `pnpm typecheck` / `pnpm test` (all workspace packages)
- `pnpm format` / `pnpm format:check` (Prettier)
- Single package: `pnpm --filter @tessel/engine test`
- Single test by name: `pnpm --filter @tessel/engine test -- -t "<name>"`
- Solver timing: `pnpm --filter @tessel/engine bench` (plain Node; exits non-zero if over the desktop proxy for the phone budget)

## Layout

pnpm workspaces: `packages/engine` (`@tessel/engine`, pure TS rules engine, no DOM or React) and `apps/web` (`@tessel/web`, consumes the engine via `workspace:*`; Vite + React not set up yet). The engine is consumed as TypeScript source (`exports` points at `src/index.ts`), so it has no build step.

TypeScript is pinned to 6.0.x: typescript-eslint doesn't support TypeScript 7 yet. Don't upgrade it until typescript-eslint does. Imports use explicit `.ts` extensions (`allowImportingTsExtensions`), and the engine has no DOM or Node types, so it can't use `performance`, `process` and similar globals.

## Code conventions

- **Every function you write or change gets a TSDoc comment** (`/** … */`): exported and top-level functions, class methods, and exported arrow functions (`export const f = () => …`). Inline callbacks, small inner closures and test cases (`it(...)`) don't need one.
  - Start with a one-line summary of what it does. Add more only for what the signature doesn't say: side effects, invariants, units, when it throws or returns null.
  - Use TSDoc syntax: `@param name - description` (with the hyphen), `@returns`, `@throws`. Add `@param`/`@returns` only when they say more than the types do.
  - When you edit an existing function that lacks one, add it.

## Engine rules that are easy to break

- **Generator v1 is frozen.** Grid codes in share links are `(version, seed)`, so `generateGrid(seed, 1)` must return the same layout forever. Anything that changes its output needs a new version with v1 kept alongside it: the PRNG (`random.ts`), the draw in `generator.ts`, `PIECE_IDS`/`PIECES`, or which layouts `solve` accepts. The golden seeds in `generator.test.ts` catch this; never update them to make a test pass.
- `solve` must stay exact (no node cap) because generation depends on its yes/no answer. Its pruning (dead-end memo, region square-count check) only discards branches that can't succeed. Any new pruning must meet the same bar, and must pass the reference-solver cross-check in `solver.test.ts` and the seeds 0–4999 checksum in `generator.test.ts`.
- Timing: the 50 ms phone budget is checked by `bench/solver.ts`, not Vitest. Vitest runs the solver ~2.5× slower, so the test suite only has a loose regression guard. The slowest known layout is `[0,19,21,23,31,33,35]`.
- Engine functions are pure and state is plain JSON (`BoardState`), for the future multiplayer server.
