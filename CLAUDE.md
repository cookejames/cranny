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

## Layout

pnpm workspaces: `packages/engine` (`@tessel/engine`, pure TS rules engine, no DOM or React) and `apps/web` (`@tessel/web`, consumes the engine via `workspace:*`; Vite + React not set up yet). The engine is consumed as TypeScript source (`exports` points at `src/index.ts`), so it has no build step.

TypeScript is pinned to 6.0.x: typescript-eslint doesn't support TypeScript 7 yet. Don't upgrade it until typescript-eslint does.
