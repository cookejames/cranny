# Cranny — v1 Specification

## 1. Summary

Cranny is a solo timed puzzle game for the web. Each grid is a 6×6 board with 7 blocked squares. The player drags nine pieces (29 squares in total) onto the board to fill it exactly, as fast as possible. v1 is a web app (PWA-ready but online only) hosted on AWS at **https://cranny.cooke.ing**. There are no accounts, no backend and no monetisation; it is a personal project. v1 is solo only, but the rules engine is built so a multiplayer race can be added later without a rewrite.

### In scope (v1)

- Solo "Beat the clock" with a stopwatch and personal stats kept on the device.
- Seeded grid generation, with shareable links to a specific grid.
- Drag-only piece placement, plus Rotate/Flip buttons.
- Home, Play (pre-start → playing → complete) and Results screens.
- AWS infrastructure (S3 + CloudFront + ACM + Route 53) managed by Terraform, with manual deploys.

### Out of scope (v1), planned for later

Multiplayer race, offline/service worker, tap or two-finger rotation, keyboard/screen-reader play, sound, haptics, hints, daily puzzle, difficulty ratings, accounts, and full solve history.

## 2. Game rules

- **Board:** 6×6. Cells are indexed `0..35` in row-major order (`index = row*6 + col`).
- **Blocked squares:** 7 per grid, all distinct.
- **Pieces (9, 29 squares):**

  | id  | name     | squares | unique orientations |
  | --- | -------- | ------- | ------------------- |
  | I4  | Long bar | 4       | 2                   |
  | O4  | Square   | 4       | 1                   |
  | T4  | Tee      | 4       | 4                   |
  | S4  | Zig      | 4       | 4                   |
  | L4  | Ell      | 4       | 8                   |
  | I3  | Bar      | 3       | 2                   |
  | V3  | Corner   | 3       | 4                   |
  | D2  | Domino   | 2       | 2                   |
  | M1  | Single   | 1       | 1                   |

- Pieces may be rotated in 90° steps and flipped (mirrored).
- A placement is valid when every cell of the piece is on the board, not blocked, and not covered by another piece.
- The grid is **solved** when all 9 pieces are placed. Because 29 + 7 = 36, this is the same as every open cell being covered.
- Every grid the game deals is guaranteed to be solvable. About 1 in 40 random 7-blocker layouts can't be solved, so the generator retries (§4).
- There is no difficulty control: any solvable layout is valid. The number of solutions varies a lot between grids, and that luck is accepted.

## 3. Architecture

### Repository layout (pnpm workspaces)

```
cranny/
  packages/engine/     # pure TypeScript rules engine (no DOM, no React)
  apps/web/            # React + TypeScript + Vite app
  infra/               # Terraform (AWS)
  scripts/deploy.sh    # build, upload to S3 and invalidate CloudFront
  design/              # design canvas snapshot (reference only)
  SPEC.md, CLAUDE.md
```

- Node 24 LTS and pnpm. TypeScript `strict` everywhere, pinned to 6.0.x because typescript-eslint does not yet support TypeScript 7. ESLint and Prettier.
- `apps/web` depends on `@cranny/engine` through the workspace.
- The engine must stay framework-free so that a future Node multiplayer server or a native app can import it unchanged.

### Commands (to be created)

- `pnpm install`
- `pnpm dev`: Vite dev server for the web app.
- `pnpm test`: all Vitest suites. `pnpm --filter @cranny/engine test -- -t "<name>"` runs a single test.
- `pnpm build`: production build to `apps/web/dist`.
- `pnpm lint`, `pnpm typecheck`
- `terraform -chdir=infra init|plan|apply`
- `./scripts/deploy.sh`

## 4. Engine (`packages/engine`)

All functions are pure and all state is plain JSON-serialisable data, which matters for multiplayer later.

### Types

```ts
type Cell = number; // 0..35
type PieceId = 'I4' | 'O4' | 'T4' | 'S4' | 'L4' | 'I3' | 'V3' | 'D2' | 'M1';
type Orientation = { rot: 0 | 1 | 2 | 3; flip: boolean };
type Shape = ReadonlyArray<readonly [row: number, col: number]>; // normalised: min row/col = 0, sorted
type Placement = { orientation: Orientation; origin: Cell }; // origin = top-left of the shape's bounding box
type Grid = { version: number; seed: number; blocked: Cell[] }; // blocked: sorted, length 7
type BoardState = { grid: Grid; placements: Partial<Record<PieceId, Placement>> };
```

### API

- `PIECES`: the definitions (id, name, base cells, colour token).
- `shapeOf(piece, orientation): Shape` and `orientationsOf(piece): Shape[]` (unique, precomputed).
- `cellsOf(piece, placement): Cell[] | null`. Returns null if any cell is off the board.
- `canPlace(state, piece, placement, { ignore?: PieceId }): boolean`. A piece's own current placement never blocks it (placing a placed piece moves it); `ignore` also treats another piece as absent.
- `place(state, piece, placement): BoardState`, `remove(state, piece): BoardState`, `clear(state): BoardState`.
- `occupancy(state): (PieceId | 'X' | null)[]`, where `'X'` means blocked.
- `isSolved(state): boolean`
- `solve(blocked: Cell[]): Record<PieceId, Placement> | null`. A deterministic backtracking search: take the first empty cell in row-major order and try each unused piece and orientation with that shape's first cell anchored there. It has **no node cap**, because solvability must be exact so generation stays reproducible. Budget: worst case under 50 ms on a mid-range phone; this is covered by a test. To stay within it, the search skips positions it has already shown to be dead ends and checks that the empty regions can be covered by the unused pieces' square counts. Neither check changes which solution is found.
- `generateGrid(seed: number, version = CURRENT_VERSION): Grid`
- `encodeGridCode(grid) / decodeGridCode(code): { version, seed } | GridCodeError` (`kind`: `'malformed'` or `'unsupported-version'`).
- Also exported (see `packages/engine/src/index.ts` for the full list): `newBoard(grid)`, `uniqueOrientations(piece)` (each unique shape with an `Orientation` that produces it), `randomSeed()`, cell helpers (`rowOf`, `colOf`, `cellAt`), the board constants, and validators for untrusted data (`isPieceId`, `isValidOrientation`, `isValidCell`, `isValidBlocked`).
- Robustness: state restored from storage can't be trusted. `cellsOf`, `occupancy`, `canPlace` and `isSolved` treat malformed pieces, orientations, origins or blocked lists as invalid rather than throwing, and `solve` returns null unless given 7 distinct cells in `0..35`.

### Seeded generation (version 1, frozen once shipped)

- PRNG: **mulberry32** seeded with a 30-bit unsigned seed.
- Draw 7 distinct cells with a partial Fisher–Yates shuffle of `0..35` using the PRNG. If `solve()` returns null, keep drawing from the **same PRNG stream** until a solvable layout appears. Return the blocked cells sorted.
- A random new grid uses `seed = crypto.getRandomValues` masked to 30 bits.
- **Versioning:** version 1 = mulberry32 + this drawing procedure + this piece set + exact solver. Any change to any of these requires `CURRENT_VERSION = 2`, and version 1 must be kept in the code permanently so old links keep working. Golden-seed tests lock the behaviour (§12).

### Grid codes

- Format: 1 version character followed by 6 Crockford base32 characters (30-bit seed), e.g. `1K7QX2M`. Case-insensitive; `I/L` read as `1` and `O` as `0`. The single version character caps the scheme at version 31.
- URL: `https://cranny.cooke.ing/g/1K7QX2M`
- Decode errors: malformed code → "That grid link isn't valid". Unknown version → "This grid needs a newer version of Cranny. Refresh to update." Both offer "Play a new grid".

## 5. Screens and flow

Visual reference: `design/` (Home, Main, Complete). The Race screen is not built in v1.

### Routes (React Router)

- `/`: Home.
- `/play`: generates a random seed and **replaces** the URL with `/g/<code>`, so every grid is shareable.
- `/g/:code`: Play screen for that grid.
- Anything else: redirect to `/`.

### Home

- Wordmark "Cranny", the tagline "Nine pieces. Seven blocked squares. One grid to fill." and the decorative solved board from the design.
- A primary **Play** button (goes to `/play`).
- A stats row with Best, Average and Solved (§8), hidden until there is at least one solve.
- No Race or multiplayer card at all.
- On phones the stats and Play sit at the bottom of the screen, in thumb reach. On desktops (a mouse pointer) they follow the board directly, with the spare height below them; the page stays top-aligned.

### Play screen: pre-start

- Same layout as the prototype: back link, "Beat the clock / Grid <code>" header, stopwatch showing 0:00, progress pips, board, controls row, 3×3 tray.
- The **board is hidden**: empty cells with no blockers shown, overlaid with a large **Start** button. The blocked squares must not be in the DOM until Start is pressed.
- A grid opened from a shared link shows "Shared grid" in the header label.

### Play screen: playing

- Pressing Start reveals the blocked squares and starts the stopwatch at the same moment (§7).
- Header: stopwatch in `m:ss`.
- Progress: "N of 9 placed" plus 9 pips coloured by piece.
- Controls row (4 buttons, as in the prototype): **Rotate**, **Flip**, **Clear**, **New grid**.
  - Rotate and Flip act on the **selected tray piece** (§6). They are disabled when nothing is selected.
  - **Clear** returns every placed piece to the tray. The timer keeps running.
  - **New grid** goes to `/play`. If at least one piece is placed, the first tap changes the label to "Tap again to skip" for 3 seconds, to stop accidental skips. Skipped grids are not recorded.
- Tray: 3×3 grid of piece tiles in the order I4, O4, T4, S4, L4, I3, V3, D2, M1. Each tile shows the piece in its current orientation and its name and size. Placed pieces show as faded tiles labelled "Placed".

### Play screen: complete

- The drop that places the 9th piece stops the stopwatch at the time of the drop.
- **Completion celebration** (about 700 ms): a sweep of light across the filled board and a brief scale-pulse of the pieces. With `prefers-reduced-motion`, this becomes a simple 200 ms fade.
- Then the Results view.

### Results

Based on `design/Complete.dc.html`:

- "Grid complete" and the final time in `m:ss.s`, with "New personal best" if applicable.
- A thumbnail of the solved board.
- Stat cards: **Previous best** (or "—"), **Average** (last 10) and **Solved** (total). This replaces the design's "Streak".
- **Next grid** (primary, goes to `/play`), **Share grid**, and **Home**.
- **Share grid:** uses `navigator.share({ title: 'Cranny', text: 'I solved this Cranny grid in 1:08.4 — can you beat it?', url })` where supported, otherwise copies the same text and URL to the clipboard and shows a "Link copied" toast.

### Reload and interruptions

- The in-progress round (`code`, `startedAt`, `placements`, `orientations`) is saved to `localStorage` after every change. Reopening `/g/<code>` restores the round with the clock still running, because the clock keeps running when the page is hidden or closed.
- Only one round in progress is kept. Opening a different grid discards it.

## 6. Input and interaction (drag only)

Pointer Events are used throughout, handling only the primary pointer. The board and tray have `touch-action: none`, and the app sets `overscroll-behavior: none` to stop pull-to-refresh and page scrolling during a drag.

- **Tap vs drag:** a pointer down followed by less than 6 px of movement before pointer up is a **tap**. More than that is a **drag**.
- **Tap on a tray piece** selects it (highlighted as in the prototype). A tap on a placed piece does nothing. Selection is cleared when the selected piece is placed.
- **Rotate/Flip** change the selected tray piece's orientation in the tray. Each piece keeps its orientation when placed and when returned to the tray.
- **Dragging from the tray:** the piece is drawn at board-cell size as a floating overlay that follows the pointer.
  - **Touch:** the piece is lifted about 1.5 cells above the touch point so the finger doesn't cover it. At the top edge of the board the lift is reduced so the piece can still reach row 0.
  - **Mouse or pen:** the piece stays exactly where it was grabbed.
  - The cell of the piece that was grabbed stays under the pointer (plus the lift).
- **Snap preview:** while the floating piece overlaps the board, the target origin is found by rounding the piece's top-left position to the nearest cell.
  - A valid target shows a tinted ghost of the piece in its colour.
  - An invalid target (overlapping, off the board or on a blocker) shows a red outline on the cells that are on the board.
  - The preview only re-renders when the target cell changes; the floating piece moves with a CSS transform on a ref, not React state.
- **Drop:**
  - Valid target: the piece is placed and settles with a short 120 ms animation.
  - Invalid target over the board: the piece animates back to where it came from (its tray slot, or its previous grid position if it was being moved).
  - Released outside the board: the piece returns to the **tray**. A piece counts as outside once the cell being held would land off the board, even if other cells still overlap it, so a placed piece comes off by dragging it past any edge. No preview is shown then.
  - `pointercancel` (for example an incoming call or the system taking over a gesture): the piece returns to where it came from.
- **Moving placed pieces:** dragging a placed piece picks it up (its cells count as free during the move). The drop rules above apply. Rotating a piece while it is on the board is not supported in v1.
- There is no undo stack; picking pieces up is the undo.

## 7. Timer

- Wall-clock based: `elapsed = Date.now() - startedAt`, rendered on `requestAnimationFrame` (or every 250 ms), and stored in milliseconds.
- It starts when Start is pressed, the same moment the blockers appear.
- It keeps running when the tab is hidden, the phone is locked or the page is reloaded (§5). There is no pause.
- It stops at the time of the drop that completes the grid.
- Display: `m:ss` while playing and `m:ss.s` on Results. Times of an hour or more display as `h:mm:ss`.

## 8. Stats (on the device only)

- `localStorage['cranny.stats.v1'] = { solved: number, bestMs: number | null, recentMs: number[] }`, where `recentMs` holds the last 10 solve times, newest last.
- Only completed solves count. Skipped or abandoned grids are not recorded, and solves on shared grids count the same as any other.
- **Average** is the mean of `recentMs`, shown once there is at least 1 solve.
- **Best** is the minimum time over all solves.
- All reads and writes are wrapped in try/catch. If storage is unavailable, the game still works and stats aren't kept.
- Clearing browser data wipes the stats. This is accepted for v1.

## 9. Visual design

- Follow `design/` for layout, spacing and palette:
  - Ground `#F3EFE6`, ink `#1D1B18`, muted text `#5E574C`, board frame `#D6CCB9`, empty cell `#EAE3D5`, blocked cell `#26231F` with a peg dot.
  - Piece colours: I4 `#3F6FA8`, O4 `#EE7E2F`, T4 `#8C5BA6`, S4 `#2F8F85`, L4 `#C4557A`, I3 `#D1604B`, V3 `#6E9E6A`, D2 `#E0A43A`, M1 `#7FA7C9`.
- Fonts: Bricolage Grotesque (display), Instrument Sans (UI) and DM Mono (timer), self-hosted with `@fontsource` packages rather than loaded from Google Fonts.
- **Placed pieces are drawn as one merged shape** with a 2 px darker outline (the piece colour darkened about 25%), not as separate squares. This makes pieces readable without relying on colour. It is implemented as an SVG overlay above the board's CSS grid, with the path computed from the piece's cells.
- **Responsive:** the layout was designed at 390×844. Board size = `min(viewport width − 40px, available height after the header, controls and tray)`. Tray tiles scale with it. It must fit an iPhone SE (375×667) without scrolling, and use `100dvh`. On desktop, the column is centred with a maximum width of 480 px.

## 10. Accessibility (v1)

- Pieces are distinguished by merged outlines and shapes, not only colour (§9).
- Real `<button>` elements for all controls, and `aria-label`s on the board cells ("Row 2, column 5: Tee") and tray tiles ("Tee, 4 squares", plus ", placed"). The selected tile is marked with `aria-pressed`, which screen readers announce as pressed.
- Text contrast of at least 4.5:1 and touch targets of at least 44 px.
- Keyboard and screen-reader play is **deferred**, because drag-only input isn't operable without a pointer. This is a known v1 gap.

## 11. Infrastructure (AWS, Terraform in `infra/`)

- **State:** S3 backend with `use_lockfile = true` (Terraform ≥ 1.10 native S3 locking). The state bucket (`cranny-terraform-state-<account id>`, eu-west-2: private, versioned, encrypted) is created once by a small separate configuration in `infra/bootstrap/`, whose own state stays local. Its `backend_config` output becomes `infra/backend.hcl` (git-ignored, since the bucket name includes the account ID; `infra/backend.hcl.example` shows the format), used as `terraform init -backend-config=backend.hcl`. Terraform is applied manually.
- **Variables:** `domain_name = "cranny.cooke.ing"`, `zone_name = "cooke.ing"` (an existing Route 53 hosted zone, looked up with a `data` source), `region = "eu-west-2"`.
- **Resources:**
  - A private S3 site bucket: all public access blocked, versioning on (old versions expire after 30 days), SSE-S3 encryption, and a policy denying non-HTTPS access (the state bucket has the same).
  - A CloudFront distribution using **Origin Access Control**, a bucket policy that allows only that distribution, `default_root_object = index.html`, HTTP → HTTPS redirect, the managed CachingOptimized cache policy (which honours each file's `Cache-Control`) and `PriceClass_100`.
  - **SPA deep links:** custom error responses map 403 and 404 to `/index.html` with status **200**, so `/g/<code>` works.
  - An ACM certificate for `cranny.cooke.ing` in **us-east-1** (aliased provider), validated through Route 53 DNS.
  - Route 53 A and AAAA alias records pointing to the distribution, and a CAA record on the subdomain allowing only Amazon to issue certificates.
  - A response headers policy with HSTS, `X-Content-Type-Options`, `Referrer-Policy` and a CSP allowing only self-hosted assets. The exact headers live in `apps/web/security-headers.json`, which `pnpm preview` also sends, so the policy is tested against the production build before deploying. The plan fails if that file gains a header the CloudFront policy doesn't map.
- **Outputs:** bucket name and distribution ID (used by the deploy script).
- **`scripts/deploy.sh` (manual):**
  1. Refuses to run with uncommitted changes, prints the AWS identity, and refuses the root user unless `CRANNY_ALLOW_ROOT=1`.
  2. `pnpm install --frozen-lockfile`, `pnpm lint`, `typecheck`, `test`, then `pnpm build`.
  3. Upload `assets/*` first with `Cache-Control: public, max-age=31536000, immutable`, keeping old assets for browsers still on the previous `index.html`. Then sync the rest (`index.html`) with `no-cache` and `--delete`.
  4. `aws cloudfront create-invalidation --paths "/*"`, which also clears `/` and cached deep-link responses.
  - The bucket and distribution IDs are read from `terraform -chdir=infra output`.

## 12. Testing

- **Engine unit tests (Vitest):**
  - Orientation counts match the table in §2.
  - `cellsOf`, `canPlace` (including `ignore`), `place`, `remove` and `isSolved`.
  - `solve()` finds a valid solution on known grids and returns null on a known unsolvable grid.
  - **Golden seeds:** a fixed list of seeds must produce exactly these blocked layouts, which freezes generator version 1.
  - Grid code encode/decode round-trip, case-insensitivity, the I/L/O aliases, and the malformed and unknown-version errors.
  - Performance guard: `solve()` over 1,000 generated grids stays within budget.
- **Component tests (Vitest + React Testing Library + jsdom):**
  - Tapping a tray piece selects it, and Rotate/Flip change its orientation.
  - The board hides the blockers before Start, and Start reveals them and starts the clock.
  - The New grid skip confirmation.
  - Results show "New personal best" and update the stats correctly.
  - Invalid and unknown-version code screens.
  - Restoring an in-progress round from storage.
- The snapping maths (pointer position → origin cell) is a pure function in `apps/web/src/drag/` and has its own unit tests. Real drag gestures are tested by hand on an iPhone, an Android phone and a desktop browser. There are no end-to-end tests in v1.

## 13. Multiplayer readiness (not built in v1)

- The engine is pure and shared, `BoardState` is plain JSON, and grids are identified by `(version, seed)`. A race room only needs to share a grid code, so every player gets the same blockers.
- Trust model when it's built: clients are trusted (private rooms with friends only), so there is no server-side validation.
- The AWS home for real-time rooms (for example API Gateway WebSockets or AppSync) is decided later.

## 14. Risks and notes

- **Frozen generator:** any change to the PRNG, the drawing procedure, the piece set or the solver breaks existing share links unless the version number is bumped. The golden tests enforce this.
- **Mobile drag pitfalls:** iOS Safari scroll and bounce, pull-to-refresh, and `pointercancel` all need handling (§6). Test on real devices early.
- **Stats live only on the device** and are lost if browser data is cleared. This is accepted. Export/backup is a possible later addition.
- **No offline support in v1.** Adding a service worker later needs an update prompt so players don't get stuck on an old version.

## 15. Decisions log (from the interview)

Web first (PWA-ready, online only) · React + TS + Vite · pure TS engine package · solo only for v1, multiplayer-ready · trusted clients for the future race mode · no accounts · stats limited to best, average and solved, on the device · seeded random grids, no daily · no difficulty control · no hints or give-up · stopwatch with personal bests · clock starts on reveal and keeps running when the page is hidden · drag-only placement with the piece lifted above the finger · tap selects a tray piece for the Rotate/Flip buttons (tap or two-finger rotation later) · bad drops return the piece · placed pieces can be dragged to move them · picking pieces up is the undo · share links use seed + version codes, and all solves count toward stats · only solves count, skips aren't recorded · merged piece outlines for accessibility · completion celebration only (no sound or haptics) · keep the prototype layout · hide Race entirely · AWS S3 + CloudFront + ACM + Route 53 at cranny.cooke.ing, Terraform with S3 state, manual deploys · engine unit tests and component tests.
