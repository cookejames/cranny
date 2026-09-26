# Cranny Disconnected Marker — Tasks

## Phase 0 — Spec

- [x] **T0.1 Spec and task list** (this folder), and a pointer from the multiplayer spec §9.

## Phase 1 — Build (§2, §3, §4)

- [x] **T1.1 Lobby.** `PlayerList` in `Lobby.tsx` renders the disconnected mark and the "disconnected" label; `Room.module.css` styles `.readyMark[data-away]`.
- [x] **T1.2 Tests.** The `Room.test.tsx` and `a11y.test.tsx` cases in §4.
      _Done when:_ `pnpm lint && pnpm typecheck && pnpm test` pass.

## Phase 2 — Check

- [ ] **T2.1 Browser check.** `pnpm dev`, two tabs in one room: close one and its row shows the disconnected mark; reload it and the row is back to not ready. The row still fits at 375 px wide with a long name, the You tag and a score.
- [ ] **T2.2 Deploy** (when asked): `scripts/deploy.sh`.
