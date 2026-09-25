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

- [ ] **T3.1 Storage** (§10). Session-storage access in `storage.ts` (never throws, validates reads). `cranny.player.v1` in local storage, and `cranny.seat.v1` and `cranny.multiplayerRound.v1` in session storage, all validated on read. The Web Lock seat claim for duplicated tabs. Update the CLAUDE.md storage rule to cover `sessionStorage`.
- [ ] **T3.2 Routes and the Multiplayer screen.** `/multiplayer` and `/m/:room` (with the canonical redirect) in `AppRoutes`, and the Home **Multiplayer** button. Create (generated or custom name, with the warning), Join, and the inline errors.
- [ ] **T3.3 Shared play area.** Extract the board, tray, drag and controls out of `PlayScreen.tsx` so solo and multiplayer share them. Controls take the set of buttons to show (no New grid in multiplayer).
      _Done when:_ the existing solo tests pass unchanged.
- [ ] **T3.4 Lobby.** The room header with Share (generalise `shareGrid`), the player list (score, ready, away, You, rename), the Ready toggle, the ready countdown, and Finish and the back link, both behind the leave confirmation dialog (§9).
      _Done when:_ tests cover Stay (nothing sent), Leave (`leave` sent, seat and saved board deleted, Home), the leaver's name and score disappearing from everyone else's scoreboard, and a rejoin getting a new seat at 0.
- [ ] **T3.5 Reveal and playing.** The 3-2-1 over the hidden board (no blockers in the DOM before the reveal), the stopwatch from the local reveal, progress messages on board changes, and the finish message and celebration.
- [ ] **T3.6 Progress strip** ordered by completeness, most complete on the left (§9: finishers first in finishing order, then by pieces placed, ties stable), with the slide animation and the hide toggle (remembered), and `LAYOUT` updated. The ordering is a pure, unit-tested function.
      _Done when:_ the layout test fits 375×667 and 390×844 with 7 opponents shown.
- [ ] **T3.7 Close-out, the waiting view and time's up.** The banner countdown, the locked board, and the sitting-out / next-round view.
- [ ] **T3.8 Results and totals** in the lobby after a round (placings, times, points, outcomes, and totals sorted by score).
- [ ] **T3.9 Reload and reconnect.** Restore the tab's seat and multiplayer board (via `resumeRound`), a duplicated tab joining as a new player, the Reconnecting banner, the lost-connection screen, and the protocol and engine-version messages.
- [ ] **T3.10 Accessibility.** The progress-bar roles, the live-region announcements, `aria-pressed` on Ready, axe on the new screens, and contrast pairs for any new colours.
- [ ] **T3.11 Multi-tab check.** Play a full multi-round game across 3–4 tabs with the local adapter, including closing the host tab mid-round, reloading a player mid-round, opening the same room in two tabs (two players), duplicating a tab (new player), and two rooms in two tabs.

## Phase 4 — Ably investigation (§8.3)

- [ ] **T4.1 Spike.** Answer every question in §8.3 with small experiments against a free Ably account. Write `ABLY.md` with the findings and a recommendation for the directory (Ably-only or Lambda + DynamoDB), the token capability and TTL, the `connect-src` hosts, and any change to the 30 s presence bound or the snapshot rate.
- [ ] **T4.2 Update this spec** (§7, §11, §13) with the decisions from T4.1 before starting Phase 5.

## Phase 5 — Directory / token endpoint (§7, §11, §13)

- [ ] **T5.1 `apps/rooms-api`.** The Lambda handler for `create`, `join`, `keepAlive` and `refreshCredential` (per T4.2; `roomKey` checked on the last two), with name validation shared from `@cranny/multiplayer`, and unit tests with the vendor and storage mocked.
- [ ] **T5.2 Terraform.** The HTTP API with throttling, the Lambda, its IAM role (least privilege), the SSM parameter for the Ably key, the DynamoDB table only if T4.2 says so, and the routing or domain decision. Plan only until asked to apply.
- [ ] **T5.3 `HttpDirectory` adapter** in `apps/web/src/net/`.
- [ ] **T5.4 CSP.** Add `connect-src` for the API origin and the Ably hosts to `security-headers.json`, and confirm with `pnpm build && pnpm --filter @cranny/web preview`.
- [ ] **T5.5 Deploy script** builds and deploys the Lambda too.

## Phase 6 — Ably transport and launch

- [ ] **T6.1 `AblyTransport`** using token auth from the ticket (`authCallback` → `refreshCredential` near expiry), presence, and status mapping.
      _Done when:_ it passes the conformance suite with `ABLY_TEST_KEY` set.
- [ ] **T6.2 Production switch.** Build with `VITE_ROOM_TRANSPORT=ably`, and the Home Multiplayer button appears.
- [ ] **T6.3 Real-device test.** A 3+ phone game over mobile data and Wi-Fi: lock the host's phone mid-round, reload a player mid-round, and join late. Check that another room's players are never visible.
- [ ] **T6.4 Update CLAUDE.md and the README** with multiplayer commands, adapter selection and conventions.
