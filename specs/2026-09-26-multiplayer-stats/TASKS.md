# Cranny Multiplayer Stats — Tasks

## Phase 1 — Multiplayer stats on Home

- [x] **T1.1 Spec and task list** (this folder), and a cross-reference from multiplayer SPEC §10.
- [x] **T1.2 Storage** (§3). `loadMultiplayerStats` / `saveMultiplayerStats` in `storage.ts`, sharing the solo stats validation.
- [x] **T1.3 Record finishes** (§2). In `RoomRound`, once per finish, with `recordSolve`.
- [x] **T1.4 Home** (§4). The solo and multiplayer block, and Install app moved beside the wordmark.
      _Notes:_ first built as two captioned rows of tiles, as planned; that scrolled on an iPhone SE, so at the user's choice it became one block, and the user asked for Install app to become an icon by the wordmark.
- [x] **T1.5 Tests** (§5).
      _Done when:_ `pnpm lint && pnpm typecheck && pnpm test` pass, and Home fits 375×667 with both rows and Install app.
      _Result:_ all pass; Home fits 375×667 with both kinds of stats, Multiplayer and Install app (board 135 px, no scrolling).
