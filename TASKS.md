# Cranny v1 — Tasks

## Phase 0 — Repo foundation

- [x] **T0.1 Workspace scaffold** (§3). pnpm workspaces (`packages/engine`, `apps/web`), Node 24 (`.nvmrc`, `engines`), a shared `tsconfig.base.json` with strict mode, ESLint + Prettier, and root scripts `dev`, `build`, `test`, `lint`, `typecheck`. Add a `.gitignore` covering `node_modules`, `dist`, `.DS_Store`, `.terraform` and `*.tfstate`.
      _Done when:_ `pnpm install && pnpm lint && pnpm typecheck && pnpm test` all pass on the empty packages.
- [x] **T0.2 Update CLAUDE.md** with the real commands once they exist, including how to run a single test.

## Phase 1 — Engine (`packages/engine`, §4)

- [x] **T1.1 Types and piece definitions.** `Cell`, `PieceId`, `Orientation`, `Shape`, `Placement`, `Grid` and `BoardState`, plus `PIECES` with names, base cells and colour tokens.
- [x] **T1.2 Geometry.** `shapeOf`, `orientationsOf` (unique, precomputed) and `cellsOf`.
      _Done when:_ the orientation counts match §2 (I4 2, O4 1, T4 4, S4 4, L4 8, I3 2, V3 4, D2 2, M1 1).
- [x] **T1.3 Board operations.** `canPlace` (with `ignore`), `place`, `remove`, `clear`, `occupancy` and `isSolved`. All pure, with JSON-serialisable state.
- [x] **T1.4 Solver.** A deterministic `solve(blocked)` that fills the first empty cell in row-major order, with no node cap.
      _Done when:_ it solves known grids, returns null on a known unsolvable grid, and 1,000 generated grids run within the budget (§4, §12).
- [x] **T1.5 Seeded generator v1.** mulberry32 with a 30-bit seed, a partial Fisher–Yates draw of 7 cells, retrying from the same PRNG stream until a layout is solvable, returning the cells sorted, plus `CURRENT_VERSION = 1`. A helper creates random seeds with `crypto.getRandomValues`.
      _Done when:_ the golden-seed tests are recorded and passing. From this point, generator v1 is frozen.
- [x] **T1.6 Grid codes.** `encodeGridCode` / `decodeGridCode`: a version character plus 6 Crockford base32 characters, case-insensitive, with the I/L→1 and O→0 aliases, and distinct errors for a malformed code and an unknown version.
      _Done when:_ round-trip and error tests pass.
- [x] **T1.7 Engine test suite complete** (§12). Covers everything in T1.2–T1.6, with the public API exported from `index.ts`.

## Phase 2 — Web app shell (`apps/web`, §5, §9)

- [x] **T2.1 Vite + React + TS app.** React Router routes `/`, `/play` (generates a seed and replaces the URL with `/g/<code>`), `/g/:code`, and a catch-all redirect to `/`. Includes a Vitest + React Testing Library + jsdom setup.
- [x] **T2.2 Design tokens and fonts** (§9). The palette as CSS variables and self-hosted `@fontsource` fonts (Bricolage Grotesque, Instrument Sans, DM Mono).
- [x] **T2.3 Responsive layout frame** (§9). A `100dvh` column, a maximum width of 480 px on desktop, and board size computed from the viewport.
      _Done when:_ the layout fits 375×667 and 390×844 without scrolling.
- [x] **T2.4 Storage utilities** (§5, §8). Try/catch-wrapped `localStorage` access for the stats (`cranny.stats.v1`) and the in-progress round. The game must work when storage is unavailable.

## Phase 3 — Board rendering

- [x] **T3.1 Board component.** A 6×6 CSS grid with empty and blocked cells (peg dot), and `aria-label`s on the cells.
- [x] **T3.2 Merged piece outlines** (§9, §10). An SVG overlay that draws each placed piece as one path with a darker 2 px outline. The outline path is computed by a pure, unit-tested function.
- [x] **T3.3 Tray** (§5). A 3×3 grid of tiles in the spec order, each showing the piece in its current orientation with its name and size, faded and labelled "Placed" when placed. Tapping a tile selects it (with `aria-pressed`).
- [x] **T3.4 Controls row.** Rotate and Flip act on the selected tray piece and are disabled when nothing is selected. Clear returns all placed pieces to the tray. New grid asks for a second tap ("Tap again to skip") within 3 seconds once any piece is placed.
- [x] **T3.5 Header and progress.** Back link, mode/grid label ("Shared grid" when opened from a link), stopwatch display, "N of 9 placed" and the pips.

## Phase 4 — Drag and drop (§6)

- [x] **T4.1 Snap maths (pure).** Turns the pointer position, the grabbed cell and the lift into a target origin cell and validity. Lives in `apps/web/src/drag/`, with unit tests including the edge where the lift is reduced near the top of the board.
- [x] **T4.2 Pointer handling.** Primary pointer only, with a 6 px tap-versus-drag threshold, `touch-action: none` and `overscroll-behavior: none`. The floating piece moves with a CSS transform on a ref (no React re-render per frame). The piece is lifted about 1.5 cells on touch and not lifted for mouse or pen.
- [x] **T4.3 Snap preview.** A tinted ghost for a valid target and a red outline on the cells over the board for an invalid one. It only re-renders when the target cell changes.
- [x] **T4.4 Drop rules.** Valid drop: place the piece with a 120 ms settle. Invalid drop over the board: return the piece to where it came from. Drop outside the board: return it to the tray. `pointercancel`: return it to where it came from.
- [x] **T4.5 Moving placed pieces.** Dragging a placed piece picks it up (using `ignore` from T1.3) and applies the same drop rules.
- [ ] **T4.6 Real-device check.** Test on an iPhone (Safari), an Android phone (Chrome) and a desktop browser. Watch for scroll or bounce, pull-to-refresh and pointer cancellation.

## Phase 5 — Game flow and timer (§5, §7)

- [x] **T5.1 Round state.** A reducer over `BoardState` plus the selection, orientations, `startedAt` and status (`pre-start` | `playing` | `complete`).
- [x] **T5.2 Pre-start screen.** A Start overlay, with the blocked squares **not rendered in the DOM** before Start is pressed.
- [x] **T5.3 Wall-clock stopwatch** (§7). `Date.now() - startedAt`, displayed as `m:ss` (and `h:mm:ss` from an hour), with no pause. It stops at the time of the drop that completes the grid.
- [x] **T5.4 Save and restore the round** (§5). Save the round to `localStorage` on every change. Reopening `/g/<code>` restores it with the clock still running. Only one round is kept.
- [x] **T5.5 Invalid code screens** (§4). "That grid link isn't valid" for a malformed code and the "newer version" message for an unknown version, both with "Play a new grid".
- [x] **T5.6 Completion celebration** (§5). A light sweep and a scale-pulse lasting about 700 ms, reduced to a 200 ms fade with `prefers-reduced-motion`, then the Results view.

## Phase 6 — Results, stats and sharing (§5, §8)

- [x] **T6.1 Stats update.** When a grid is solved, update `solved`, `bestMs` and `recentMs` (last 10). Skips are not recorded, and shared grids count the same as any other.
- [x] **T6.2 Results view.** The time as `m:ss.s`, "New personal best" when applicable, a solved-board thumbnail, cards for Previous best, Average and Solved, and Next grid, Share grid and Home buttons.
- [x] **T6.3 Share.** `navigator.share` where available, otherwise copy to the clipboard and show a "Link copied" toast.
- [x] **T6.4 Home screen.** Wordmark, tagline, the decorative board, a Play button, and a stats row that stays hidden until the first solve. No Race card.

## Phase 7 — Tests and polish (§10, §12)

- [x] **T7.1 Component tests.** Tray selection with Rotate/Flip, blockers hidden before Start and the clock starting, the skip confirmation, the results personal best and stats, the invalid-code screens, and round restore.
- [x] **T7.2 Accessibility pass** (§10). Contrast of at least 4.5:1, touch targets of at least 44 px, real buttons, and labels on the tray tiles and cells.
- [x] **T7.3 Security headers compatibility.** Check that the built app works under the planned CSP: fonts, assets and inline styles are all self-hosted.

## Phase 8 — Infrastructure and deploy (§11)

- [ ] **T8.1 Terraform backend.** Point the S3 backend at the existing state bucket with `use_lockfile = true`. Providers: the default region, plus a `us-east-1` alias for ACM.
- [ ] **T8.2 Site bucket.** Private, with public access blocked, versioning and SSE-S3 encryption.
- [ ] **T8.3 CloudFront distribution.** Origin Access Control, a bucket policy that only allows the distribution, `index.html` as the default root, HTTP→HTTPS redirect, 403/404 → `/index.html` with status 200, and a response headers policy (HSTS, nosniff, Referrer-Policy, CSP).
- [ ] **T8.4 Certificate and DNS.** An ACM certificate for `cranny.cooke.ing` in us-east-1, validated through the existing `cooke.ing` Route 53 zone, plus A and AAAA alias records. Outputs: the bucket name and distribution ID.
- [ ] **T8.5 `scripts/deploy.sh`.** Build, then sync to S3 with long-lived immutable caching for `assets/*` and `no-cache` for `index.html`, then invalidate `/index.html`. It reads the bucket and distribution IDs from `terraform output`.
- [ ] **T8.6 First deploy and smoke test.** Check that https://cranny.cooke.ing loads, that a deep link to `/g/<code>` opens that grid after a refresh, that caching headers are correct, and play a full round on a phone.

## Later (out of v1 scope, §1, §13)

Multiplayer race rooms · offline service worker with update prompt · tap or two-finger rotation · keyboard and screen-reader play · sound and haptics · stats export/backup.
