# Cranny Multiplayer — Tasks

## Phase 0 — Spec

- [x] **T0.1 Spec and task list** (this folder).
- [x] **T0.2 CLAUDE.md** points at this spec and names the planned `packages/multiplayer`.

## Phase 1 — `@cranny/multiplayer` package (§3, §5, §6, §7)

- [x] **T1.1 Package scaffold.** `packages/multiplayer` consumed as source (`exports` → `src/index.ts`), strict TS, Vitest, lint and typecheck wired into the root scripts. No DOM, Node or vendor types. It depends on `@cranny/engine` via `workspace:*`.
      _Done when:_ `pnpm lint && pnpm typecheck && pnpm test` pass with the empty package.
- [x] **T1.2 Names** (§2 Names, §4). The room-name word list (about 1,300 words), `generateRoomName(randomInts)`, `normaliseRoomName`, the player-name generator ("Teal Otter") and `cleanPlayerName`.
      _Done when:_ the tests cover normalisation, the length and charset rules, the word list having no duplicates, and its size giving at least 30 bits.
      _Done:_ 1,394 words (about 31.3 bits), filtered for homophones including UK non-rhotic ones. Also `displayNames` for the duplicate-name suffix, and `randomPlayerId`.
- [x] **T1.3 Protocol** (§5.1, §5.2). The state and message types, `PROTOCOL_VERSION = 1`, and validators for every message and snapshot (shape, 8 KB limit, protocol version).
      _Done when:_ malformed, oversized and future-protocol inputs are rejected without throwing.
      _Done:_ the snapshot gained `term` (§8.2).
- [x] **T1.4 Scoring** (§2 Scoring). `pointsFor(place)` and `roundResult(round)`.
- [x] **T1.5 Room reducer** (§2, §5.3). `roomReducer` covering seats and limits, rename, `leave` (seat and score removed), ready and the ready timeout, sitting out, the round start (seed passed in), reveal, progress, the close-out, the round end, scoring into totals, and late or duplicate messages. Deadlines are passed in as local times, so it stays pure.
      _Done when:_ every rule in §2 has a test.
- [x] **T1.6 Transport and directory interfaces** (§6.1, §7; `create` and `join` also take the player's id), plus `FakeTransport` (in memory, deterministic, with a way to simulate abrupt drops) and `FakeDirectory` (leases and credential expiry on an injected clock, kept separate: `keepAlive` extends the lease, `refreshCredential` never does).
- [x] **T1.7 Room client** (§5.2, §5.4, §8). A framework-free `RoomClient` that owns a connection: it sends `hello` and resends it, applies snapshots by `rev`, turns remaining times into local deadlines, runs the reducer and the deadlines while host, handles handover and the split-brain guard, merges snapshots to one per 100 ms, and re-sends progress and finishes after reconnecting, and runs the host-only `keepAlive` timer (starting at once on becoming host, and showing the lost-name notice on `lost`). It exposes a subscribable view state for React.
      _Done when:_ the §14 simulations pass: a 3-player round, the host leaving mid-round (countdown kept), two hosts settling, a reload mid-round, and a player dropping and returning during the next round.
      _Done:_ also resends intents a snapshot shows were lost (§5.2), and the 15 s term-0 fallback host (§8.1).
- [x] **T1.8 Conformance suite** (§6.3). `describeTransportConformance(name, makeHarness)`, run against `FakeTransport`. Exported with the fakes from `@cranny/multiplayer/testing`.

## Phase 2 — Local adapters (§3, §7)

- [x] **T2.1 `LocalTransport`** (`apps/web/src/net/`): BroadcastChannel per channel id, with presence by heartbeat (10 s / 25 s, §6.2) and a goodbye on close.
      _Done when:_ it passes the conformance suite.
      _Done:_ the suite runs twice, over an in-memory bus with fake timers (the real 10 s / 25 s) and over the real BroadcastChannel at 20× speed. Also a goodbye on `pagehide` (so a closed tab hands over at once), re-announcing on a back/forward-cache `pageshow` or after a long timer gap (a frozen tab), and the ticket's credential must be for this channel and player. An integration test runs two `RoomClient`s over the local adapters.
- [x] **T2.2 `LocalDirectory`**: leases in local storage through `storage.ts`, with a random channel id and room key per room; `keepAlive` and `refreshCredential` as in §7.
      _Done:_ `cranny.localRooms.v1`, with room keys kept a day past their lease so a late `keepAlive` can re-claim the name. Calls hold a Web Lock where the browser has them, so two tabs can't claim one name at once.
- [x] **T2.3 Adapter selection.** `VITE_ROOM_TRANSPORT` (`local` | `ably` | unset) picks the adapters in one module, and the multiplayer routes and entry are absent when it's unset (§9 Routes). `pnpm dev` defaults to `local`.
      _Done:_ `src/net/adapters.ts` (`multiplayerEnabled`, `roomAdapters()`), `local` from `apps/web/.env.development`, and the build fails on any other value (`ably` is added in Phase 6). A build without it leaves the adapters out of the bundle. The routes and Home button use `multiplayerEnabled` in T3.2.

## Phase 3 — Web UI (§9, §10, §12)

- [x] **T3.1 Storage** (§10). Session-storage access in `storage.ts` (never throws, validates reads). `cranny.player.v1` in local storage, and `cranny.seat.v1` and `cranny.multiplayerRound.v1` in session storage, all validated on read. The Web Lock seat claim for duplicated tabs. Update the CLAUDE.md storage rule to cover `sessionStorage`.
  - Done: `storage.ts` takes a storage area (`local` | `session`). Seat claim in `src/multiplayer/seat.ts` (`claimSeat`, `cranny-seat:<playerId>`); the Hide progress choice is `cranny.multiplayerPrefs.v1` (added to §10).
- [x] **T3.2 Routes and the Multiplayer screen.** `/multiplayer` and `/m/:room` (with the canonical redirect) in `AppRoutes`, and the Home **Multiplayer** button. Create (generated or custom name, with the warning), Join, and the inline errors.
  - Done: `src/multiplayer/` (`MultiplayerPage`, `RoomPage`, `RoomScreen`, `session.ts`). The Multiplayer screen hands its ticket to the room screen in memory (`handOff`); a reload or a pasted link joins through the directory. Failed joins (not found, full, invalid) send the player back to `/multiplayer` with the error inline. Both routes are lazy-loaded, and the adapters come from `RoomAdaptersContext` so tests can supply fakes.
- [x] **T3.3 Shared play area.** Extract the board, tray, drag and controls out of `PlayScreen.tsx` so solo and multiplayer share them. Controls take the set of buttons to show (no New grid in multiplayer).
  - Done: `src/play/PlayArea.tsx`; `Controls` shows New grid only when given `onNewGrid`, and takes `disabled` for a locked board.
    _Done when:_ the existing solo tests pass unchanged.
- [x] **T3.4 Lobby.** The room header with Share (generalise `shareGrid`), the player list (score, ready, away, You, rename), the Ready toggle, the ready countdown, and Finish and the back link, both behind the leave confirmation dialog (§9).
  - Done: `Lobby.tsx`, `LeaveDialog.tsx`; `shareGrid` is now `shareLink`.
    _Done when:_ tests cover Stay (nothing sent), Leave (`leave` sent, seat and saved board deleted, Home), the leaver's name and score disappearing from everyone else's scoreboard, and a rejoin getting a new seat at 0.
- [x] **T3.5 Reveal and playing.** The 3-2-1 over the hidden board (no blockers in the DOM before the reveal), the stopwatch from the local reveal, progress messages on board changes, and the finish message and celebration.
  - Done: `RoomRound.tsx`. Development only: `/m/<room>?solve` reveals one drop from solved.
- [x] **T3.6 Progress strip** ordered by completeness, most complete on the left (§9: finishers first in finishing order, then by pieces placed, ties stable), with the slide animation and the hide toggle (remembered), and `LAYOUT` updated. The ordering is a pure, unit-tested function.
  - Done: `orderProgress` in `progress.ts`, `ProgressStrip.tsx` (FLIP slide), `stripHeight` and `computeLayout(viewport, progress)` in `layout.ts`; 7 opponents fit an iPhone SE with a 255 px board.
    _Done when:_ the layout test fits 375×667 and 390×844 with 7 opponents shown.
- [x] **T3.7 Close-out, the waiting view and time's up.** The banner countdown, the locked board, and the sitting-out / next-round view.
  - Done: the close-out banner replaces the header title while it runs, so the layout doesn't move.
- [x] **T3.8 Results and totals** in the lobby after a round (placings, times, points, outcomes, and totals sorted by score).
  - Done: results table, then Totals (the player list sorted by score).
- [x] **T3.9 Reload and reconnect.** Restore the tab's seat and multiplayer board (via `resumeRound`), a duplicated tab joining as a new player, the Reconnecting banner, the lost-connection screen, and the protocol and engine-version messages.
  - Done: `RoomRound` restores through `resumeRound`; Reconnecting… pill; lost after 60 s with Try again; newer protocol and newer grid version messages.
- [x] **T3.10 Accessibility.** The progress-bar roles, the live-region announcements, `aria-pressed` on Ready, axe on the new screens, and contrast pairs for any new colours.
  - Done: axe covers the Multiplayer screen, lobby, leave dialog, playing with the strip and close-out, sitting out, and results; new contrast pairs added.
- [x] **T3.11 Multi-tab check.** Play a full multi-round game across 3–4 tabs with the local adapter, including closing the host tab mid-round, reloading a player mid-round, opening the same room in two tabs (two players), duplicating a tab (new player), and two rooms in two tabs.
  - Done in headless Chrome (four tabs over the local adapters, driven through the DevTools protocol): two rounds, host tab closed mid-round (handover, close-out carried on), a player reloaded mid-round (board and stopwatch restored), same room in several tabs (separate players), a duplicated tab (new seat), a second room in another tab (separate), and Finish (seat removed). Worth repeating by hand on a phone.

## Phase 4 — Ably investigation (§8.3)

- [x] **T4.1 Spike.** Answer every question in §8.3 with small experiments against a free Ably account. Write `ABLY.md` with the findings and a recommendation for the directory (Ably-only or Lambda + DynamoDB), the token capability and TTL, the `connect-src` hosts, and any change to the 30 s presence bound or the snapshot rate.
  - Done: `ABLY.md`. Ably has no atomic claim, and occupancy lags and activates channels. 60-minute JWTs scoped to one channel with the `clientId` bound. `heartbeatInterval` 10 s + `remainPresentFor` 5 s gives about 22 s for a silent drop (the defaults take 42 s). 100 ms snapshots fit the limits. The `connect-src` list was checked in Chrome.
- [x] **T4.2 Update this spec** (§7, §11, §13) with the decisions from T4.1 before starting Phase 5.
  - Done: a stateless directory with no DynamoDB. Channels are `room:<name>`, `create`/`join` check presence as best effort, and a new `rejoin` serves tabs that already have a seat. A client becomes host only when nobody else is present (§8.1). Leases, `keepAlive`, `roomKey` and the lost-name notice are gone. Also §2, §4, §6.2 (the Ably settings), §11 (the key and `connect-src`), §15 and the decisions log.

## Phase 5 — Directory / token endpoint (§7, §11, §13)

- [x] **T5.0 Stateless directory in the package and local adapters** (§7, §8.1). Drop `keepAlive`, `roomKey` and leases from `RoomDirectory`, `RoomTicket`, `FakeDirectory` and `LocalDirectory`. Remove the host `keepAlive` timer and the lost-name notice from `RoomClient` and the lobby, and the `cranny.localRooms.v1` storage key. Add `rejoin`. Derive the channel from the name. Base liveness on transport presence (`FakeTransport`, and `LocalTransport` for `LocalDirectory`). Become host only when `connect` finds nobody else present, whichever call made the ticket. Use `rejoin` for a reload and for Try again when the tab has a seat for the room.
      _Done when:_ tests cover two simultaneous creates ending in one room with one host, a create into an occupied room joining it without resetting its state, and the last player's reload rejoining.
  - Done: `StatelessDirectory` (and `roomChannel`) in `@cranny/multiplayer` holds the rules, and `FakeDirectory` and `LocalDirectory` wrap it (the Lambda will too). `LocalTransport.occupied` sends a `probe` frame that members answer without counting the prober as present. `SeatClaim.returning` picks `rejoin` over `join`. Checked in Chrome over the dev server: create, join by name, name in use, name free once the tabs close, lone reload, and a link to an empty room.
- [x] **T5.1 `apps/rooms-api`.** The Lambda handler for `create`, `join`, `rejoin` and `refreshCredential`, with name validation shared from `@cranny/multiplayer`. It reads `presenceMembers` from Ably's REST channel metadata for `create` and `join`, and signs the JWT without an Ably SDK. Unit tests with the Ably request mocked.
  - Done: `apps/rooms-api`: `api.ts` (routes, body validation), `ably.ts` (presence from channel metadata, HS256 JWT via `node:crypto`), `handler.ts` (Lambda, the key from SSM once per container). Directory answers are always 200 with `{ error }` in the body, and only `unavailable` is 503, because CloudFront turns 403/404 into the app shell. The signer and presence read were checked live against Ably. Bundled with esbuild (`pnpm --filter @cranny/rooms-api build`), SSM client included.
- [x] **T5.2 Terraform.** The HTTP API with throttling (overall, no WAF), the Lambda, its IAM role (least privilege), and the SSM parameter for the Ably key (a dedicated key: `room:*`, publish/subscribe/presence/channel-metadata, revocation on). Route `/api/*` through the CloudFront distribution (same origin). No database. Plan only until asked to apply.
  - Done (applied 2026-09-25): `infra/rooms.tf`, plus the `/api/*` origin and behaviour in `cdn.tf` (caching off, all headers but Host). The SSM parameter's value is set out of band (`aws ssm put-parameter`), so the key never enters state. The Lambda starts as a placeholder, and the deploy script uploads the code. Plan: 10 to add, 3 to change (the distribution, the headers policy's CSP, and the bucket policy, recomputed but unchanged), 0 to destroy. Throttling is per stage (10/s, burst 20), with no per-IP limit and no WAF (§7).
- [x] **T5.3 `HttpDirectory` adapter** in `apps/web/src/net/`.
  - Done: `apps/web/src/net/httpDirectory.ts`: POSTs to `/api/rooms/<action>`, checks every answer (ticket for the right room, credential shape, errors the call can have), and treats anything else as `unavailable`. Wired in by T6.2.
- [x] **T5.4 CSP.** Add the `connect-src` from §11 to `security-headers.json`, and confirm with `pnpm build && pnpm --filter @cranny/web preview`.
  - Done: `connect-src 'self'` plus the Ably hosts from §11. Checked with `pnpm build` + `preview` in Chrome: no violations on Home or the play screen.
- [x] **T5.5 Deploy script** builds and deploys the Lambda too.
  - Done: Uploads `apps/rooms-api/dist` with `aws lambda update-function-code` and waits for it, before the web files.

## Phase 6 — Ably transport and launch

- [ ] **T6.1 `AblyTransport`** (`ably/modular`: `BaseRealtime` with `WebSocketTransport`, `FetchRequest` and `RealtimePresence`) using token auth from the ticket (`authCallback` returns the ticket's credential first, then calls `refreshCredential`), `transportParams: { heartbeatInterval: 10000, remainPresentFor: 5000 }`, presence de-duplicated by `clientId`, `from` = `message.clientId`, rejected publishes (42913) treated as lost messages, and status mapping.
      _Done when:_ it passes the conformance suite with `ABLY_KEY` set.
- [ ] **T6.2 Production switch.** Build with `VITE_ROOM_TRANSPORT=ably`, and the Home Multiplayer button appears.
- [ ] **T6.3 Real-device test.** A 3+ phone game over mobile data and Wi-Fi: lock the host's phone mid-round, reload a player mid-round, and join late. Check that another room's players are never visible.
- [ ] **T6.4 Update CLAUDE.md and the README** with multiplayer commands, adapter selection and conventions.
