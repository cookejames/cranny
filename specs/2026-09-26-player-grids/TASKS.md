# Cranny Player Grids — Tasks

## Phase 0 — Spec

- [x] **T0.1 Spec and task list** (this folder), and pointers from the multiplayer spec §5.1, §5.2 and §9.

## Phase 1 — Protocol (`packages/multiplayer`, §3)

- [x] **T1.1 Board codec.** `src/board.ts`: `encodeBoard`, `decodeBoard`, `isBoardCode`, all exported from `src/index.ts`, with tests in `board.test.ts`.
- [x] **T1.2 Protocol.**
  - In `protocol.ts`, add `RoundResult.grid?` and `places[].board?`, and the `board` client message.
  - Parse and validate them in `parseMessage` and `parseResult`.
  - Add tests.
- [x] **T1.3 Reducer.**
  - In `room.ts`, `endRound` records `grid`.
  - The `board` intent follows the §3.4 rules.
  - Add tests.
- [x] **T1.4 Client.**
  - Add `RoomClient.reportBoard`.
  - `board` is sent and resent through `reconcile`, and a host applies its own board when the round ends.
  - Add tests.

## Phase 2 — Screens (`apps/web`, §4, §5)

- [x] **T2.1 Report the board.**
  - `RoomRound.tsx` calls `client.reportBoard` after every board change.
  - `initialBoard` keeps the saved placements after a finish.
- [x] **T2.2 Grid modal.**
  - Add `src/multiplayer/GridDialog.tsx`, following the `LeaveDialog` pattern: ×, Escape and backdrop close it, and the `Board` inside is read-only.
  - Add its styles to `Room.module.css`.
- [x] **T2.3 Grid button.** `RoundResults` in `Lobby.tsx` gets the icon button and holds which grid is open.
- [x] **T2.4 Tests.**
  - The `Room.test.tsx` and `a11y.test.tsx` cases in §6.
  - _Done when:_ `pnpm lint && pnpm typecheck && pnpm test && pnpm format:check` pass.
- [x] **T2.5 CLAUDE.md.** Add a line to the multiplayer bullet: boards are only shared after a round, in `lastResult`.

## Phase 3 — Check

- [x] **T3.1 Browser check.**
  - Run `pnpm dev` and open two tabs on `/m/<room>?solve`. Finish in one and leave the other partial until time's up.
  - Both result rows open the right grid.
  - Close the modal with ×, with Escape, and with a tap outside.
  - The rows fit at 375 px wide.
- [ ] **T3.2 CSP.** `pnpm build && pnpm --filter @cranny/web preview` shows no violations with the modal open.
- [ ] **T3.3 Ably** (optional). `pnpm --filter @cranny/web dev:ably` shows boards arriving over real Ably.
- [ ] **T3.4 Deploy** (when asked): `scripts/deploy.sh`.
