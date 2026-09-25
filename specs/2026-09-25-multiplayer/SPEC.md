# Cranny Multiplayer — Specification

## 1. Summary

Multiplayer lets a small group of friends play Cranny together in an ad-hoc **room**. One player creates a room and shares its name (a short phrase that is easy to say aloud or send over WhatsApp or SMS) or a link. Each round, everyone presses **Ready**, the same grid is revealed to all players at once, and they race to fill it. Players see how far along the others are, but never their boards. Once the first player finishes, everyone else has 30 seconds. Points go by finishing order and add up on a scoreboard for as long as the room lasts.

It is built to be **ephemeral and client-side**. There are no accounts, no server-side game logic and no verification of results: cheating by editing the code or sending fake messages is accepted. Rooms must still be **private**: a player can only ever see the names and scores of the room they are in. Nothing is kept once the last player leaves.

The realtime messaging vendor is hidden behind a **vendor-neutral transport layer**. Ably is the first vendor, and a self-hosted AWS transport (API Gateway WebSockets + Lambda, or AWS IoT) must remain possible without touching game code.

### In scope

- Creating a room (generated or custom name), joining by name or link, and leaving.
- A lobby with Ready, a ready timeout, a simultaneous reveal, live progress bars (which the player can hide), the 30 s close-out, round results and a cumulative scoreboard.
- Keeping seats and points across reloads and reconnects, and restoring a mid-round board after a reload.
- A pure-TypeScript multiplayer package (protocol, room logic, scoring, transport and directory interfaces), fake and local (multi-tab) adapters, and an adapter conformance suite.
- An investigation of Ably's capabilities, then the Ably adapter and a small room directory / token endpoint on AWS.

### Out of scope, possibly later

Public matchmaking or room lists, spectator-only links, chat or reactions, persistent leaderboards or accounts, anti-cheat, playing across devices under one identity, a native app, and the self-hosted AWS transport itself (only its feasibility is designed for, §8.4).

## 2. Rules

### Rooms

- A room holds **2–8 present players**. A ninth player trying to join is told the room is full. A room can have more **seats** than present players (§2 Seats), up to 16. A player who would need a 17th seat is told the room is full.
- A room lives while anyone is in it. Once it has been empty for its lease (about 10 minutes, §7), its name can be used again and its scores are gone.

### Rounds

1. **Lobby.** Everyone in the room sees the player list and presses **Ready** when they want to play. The last round's results show here too.
2. **Start.** The round starts as soon as every present player is ready (at least 2), or by the **ready timeout**: once at least 2 players are ready and they are more than half of those present, a 30 s countdown shows. When it reaches zero, the round starts with the players who are ready. If the condition stops holding (someone un-readies or leaves), the countdown is cancelled. A player who drops is no longer ready, and chooses again when they come back. Players who weren't ready **sit out** the round: they score 0 and watch the progress bars.
3. **Reveal.** Whichever way the round starts, there is always a **3 s countdown (3-2-1)** before the reveal. When everyone is ready it begins immediately; after a ready timeout it follows the 30 s countdown. The participants are fixed when the 3 s countdown begins, and it can't be cancelled: un-readying or leaving during it doesn't stop it. The host picks a new random seed, and at the end of the countdown the grid (`generateGrid(seed, CURRENT_VERSION)`) is revealed to every participant at once. Each player's stopwatch starts at their reveal.
4. **Playing.** Players place pieces exactly as in solo play (single-player SPEC §6). Each player sees the others' progress as bars (pieces placed out of 9), never their boards.
5. **Close-out.** The first player to fill the grid starts a **30 s countdown** for everyone else. Before that there is no time limit.
6. **End.** The round ends when the countdown reaches zero, or earlier if every present participant has finished (once someone has finished; before that, a round whose participants are all away keeps waiting). It also ends if every participant has left with Finish. Unfinished boards are locked. Then everyone returns to the lobby with the round's results.

### Scoring

| Finish position   | Points |
| ----------------- | ------ |
| 1st               | 5      |
| 2nd               | 3      |
| 3rd               | 2      |
| 4th onwards       | 1      |
| Didn't finish     | 0      |
| Sat out the round | 0      |

- Finish position is the order in which the host **receives** each player's "finished" message (§5.4).
- Points add up across all rounds for the room's lifetime.

### Seats, reloads and late joins

- Each player has a **seat** in the room, identified by a random player id. A seat belongs to **one browser tab** (§10), and each tab is an independent player.
- **Kept:** reloading, locking the phone, losing signal or reconnecting in the same tab keeps the seat and its points.
- **Not kept:** opening the room link in another tab, or again after closing the tab, joins as a **new player at 0**. The old seat stays on the scoreboard as "away", with its score, until the room ends.
- One browser can be in **several rooms at once**, one per tab, without them affecting each other.
- **Leaving on purpose** (Finish, or the lobby's back link, after confirming, §9) gives the seat up. The seat is **removed from the room**: the player's name and score disappear from the scoreboard and from the last round's results for everyone still there. Leaving mid-round also takes the player out of that round, so later finishers move up a place. The tab forgets the seat (§10), so if they rejoin they get a **new seat starting at 0**.
- **Reload during a round you are playing:** the board is restored from the tab's session storage with the stopwatch still running, and you carry on.
- **Return during a round you're not in** (you joined late, or you dropped and came back during a later round): you wait in the lobby, watching the progress bars, and play from the next Ready.

### Names

- **Room names:** see §4.
- **Player names:** a player starts with a random name (for example "Teal Otter"). They can draw another random name or type their own at any time, including in the lobby. The name they end up with is remembered on the device for next time. Names are 1–16 characters after trimming, with control characters removed. Duplicates are allowed; if two seats in the room (present or away) share a name, the one who joined later is shown with a number (for example "Teal Otter 2"), skipping any label another seat already uses. This matters most for a player who reopens the room in a new tab: their old, away seat and their new one have the same name.

## 3. Architecture

```
apps/web  ──uses──▶  @cranny/multiplayer  ──uses──▶  @cranny/engine
   │                  (protocol, room logic,
   │                   scoring, interfaces,
   │                   fakes, conformance suite)
   └── src/net/  adapters: LocalTransport, LocalDirectory, (later) AblyTransport, HttpDirectory
```

- **`packages/multiplayer` (`@cranny/multiplayer`)**: pure TypeScript, no DOM, no Node types and no vendor SDKs, consumed as source like the engine (`exports` → `src/index.ts`, no build step). Test doubles and the conformance suite are a second entry point, `@cranny/multiplayer/testing`, so Vitest never reaches the app bundle. It holds everything that decides what happens in a room, so the game logic can be tested without a network and reused by any future server.
- **Adapters** live in `apps/web/src/net/`. They implement the package's `RoomTransport` and `RoomDirectory` interfaces (§6, §7) and are the only code that imports a vendor SDK or touches `BroadcastChannel` or `fetch`.
- The adapter is chosen at build time by `VITE_ROOM_TRANSPORT` (`local` or `ably`), in one module (`src/net/adapters.ts`). `pnpm dev` uses `local` (from `apps/web/.env.development`), and the build fails on any other value. Production uses `ably` once Phase 6 is done; before that, the Multiplayer entry is hidden in production builds.
- **Trust model:** every client is trusted. The host's decisions are accepted as they are, and nothing is checked server-side. Every incoming message is still **validated for shape** (as data read back from storage is), so a malformed message can't crash a client.
- **The engine is unchanged.** Generator v1 stays frozen, and a round's grid is identified by `(version, seed)` as in share links.

## 4. Room names

- **Generated (the default):** three words from a curated list, joined with hyphens, e.g. `amber-otter-quilt`. The list has about 1,300 short (3–6 letter), common, inoffensive, easy-to-spell words with no homophones, giving about 31 bits (roughly 2 billion names). The list lives in `@cranny/multiplayer` and is drawn with `crypto.getRandomValues` (supplied by the caller, since the package has no DOM types).
- **Custom:** the creator may type their own name instead. It is normalised to lowercase, runs of spaces, underscores and hyphens become one hyphen, and leading and trailing hyphens are trimmed. The result must be 3–32 characters of `[a-z0-9-]`. The form warns: "Short or common names are easy to guess. Anyone who knows the name can join."
- **Canonical form:** the normalised name is used everywhere (link, directory, display). `/m/<name>` with a non-canonical name redirects to the canonical one, as `/g/:code` does.
- **Collisions:** creating a room claims the name through the directory (§7). If a live room already has it, the creator sees "That name is in use" and, for a generated name, the app silently draws another.
- **Reuse:** a name is free again once its room's lease has expired (§7).

## 5. Room state and protocol

### 5.1 State

The host owns the room state and sends all of it to everyone after every change. All of it is plain JSON.

```ts
type PlayerId = string; // 22 chars, base64url of 128 random bits

type Seat = {
  id: PlayerId;
  name: string;
  joinOrder: number; // assigned by the host, increasing; lowest present = next host
  score: number;
};

type RoundStatus = 'lobby' | 'countdown' | 'playing' | 'closing';

type Round = {
  number: number; // 0 before the first round
  status: RoundStatus;
  grid: { version: number; seed: number } | null; // null in the lobby
  participants: PlayerId[]; // fixed when the round starts
  ready: PlayerId[]; // lobby only
  progress: Record<PlayerId, number>; // pieces placed, 0..9
  finishes: { id: PlayerId; ms: number }[]; // in the order received; ms = the player's own stopwatch
  // Time remaining when this snapshot was sent. Each receiver turns it into a local deadline.
  readyClosesInMs: number | null;
  revealInMs: number | null;
  closesInMs: number | null;
};

type RoundResult = {
  number: number;
  places: {
    id: PlayerId;
    ms: number | null;
    points: number;
    outcome: 'finished' | 'dnf' | 'sat-out';
  }[];
};

type RoomSnapshot = {
  protocol: 1;
  room: string; // canonical name
  term: number; // increases by one at every host handover (§8.2)
  rev: number; // increases with every change within a term; clients ignore anything older
  hostId: PlayerId;
  hostJoinOrder: number;
  seats: Seat[];
  round: Round;
  lastResult: RoundResult | null;
};
```

"Present" isn't part of the state. It comes from transport presence (§6.2), which every client sees for itself.

### 5.2 Messages

Every message is JSON with `protocol: 1`, a `type`, and the sender's `from: PlayerId`. The transport also tells the receiver who sent it; the two must match, or the message is dropped. Messages over 8 KB are dropped.

| From → to       | `type`     | Payload                              | Meaning                                                          |
| --------------- | ---------- | ------------------------------------ | ---------------------------------------------------------------- |
| client → host   | `hello`    | `name`                               | I'm here (new seat, or returning to mine); please send the state |
| client → host   | `rename`   | `name`                               | Change my display name                                           |
| client → host   | `ready`    | `ready: boolean`                     | Ready / not ready for the next round                             |
| client → host   | `progress` | `round`, `placed` (0–9)              | My board changed                                                 |
| client → host   | `finished` | `round`, `ms`                        | I filled the grid; my stopwatch read `ms`                        |
| client → host   | `leave`    | —                                    | I'm leaving for good; remove my seat and score                   |
| host → everyone | `snapshot` | `RoomSnapshot`                       | The whole current state                                          |
| host → one      | `reject`   | `to`, `reason: 'full' \| 'protocol'` | You can't join                                                   |

- Clients send **intents**; only the host changes state. A snapshot replaces the client's copy if it comes from a later **reign** (§8.2), or from the same reign with a higher `rev`.
- **Resending:** delivery is at most once (§6.1), so a client compares each snapshot with what it has sent: its seat, name, ready choice, progress count and finish. Anything missing is sent again, at most once a second. This also recovers intents lost during a reconnect or a handover.
- Snapshots are sent after every change, merged to at most one every 100 ms. `progress` messages are only sent when the count changes.
- A client reads everything from snapshots: its own score, whether it's a participant, when the reveal happens. It never works state out on its own, except when it becomes host.
- **Protocol versioning:** a client that receives `protocol` greater than its own shows "This room needs a newer version of Cranny. Refresh to update." A host that receives an older one replies `reject` with `reason: 'protocol'`.

### 5.3 The room reducer

`roomReducer(state, event) → state` in `@cranny/multiplayer` is pure, like `roundReducer`. Its events are the client intents above plus the host's own `presence` changes and `tick` (a deadline passing). The host runs it, and a new host carries on running it from the last snapshot. It implements §2 exactly:

- `hello` from an unknown id creates a seat (if under 8 present and 16 seats; otherwise the host sends `reject` `full`). From a known id it updates the name. Either way it prompts a snapshot.
- `leave` deletes the sender's seat: from the seats, the ready set and `lastResult`. If the host itself leaves, it applies its own `leave`, sends the snapshot and closes; presence then hands over as usual (§8.2).
- Ready rules, the ready timeout, starting a round (seed from the caller, so the reducer stays pure), sitting out, the close-out, ending the round, and scoring.
- A `finished` for the wrong round, from a non-participant, or a repeat is ignored. So is a `progress` or `finished` that arrives after the round has ended.
- If a participant is absent when the close-out ends, they get 0. If every present participant has finished, the round ends immediately.

### 5.4 Timing without shared clocks

Device clocks can differ by seconds, so no wall-clock time is ever sent.

- Snapshots carry the **time remaining** on each countdown at the moment they are sent. A client sets its local deadline to `receivedAt + remaining` using its own clock, and counts down from that. Network delay makes clients a little late (by about the latency), and that is accepted.
- The host also keeps its deadlines on its own clock and acts on them (`tick`). A new host continues from the deadlines it computed when it received the last snapshot, so countdowns keep running through a host handover.
- **Reveal:** at the start of the round, the snapshot carries `revealInMs = 3000`. Each client reveals at its local deadline and starts its stopwatch then.
- **Finish order** is the order the host receives `finished` messages. The `ms` a player reports is their own stopwatch and is shown for interest only; it doesn't decide the order.

## 6. Transport (`RoomTransport`)

### 6.1 Interface

```ts
interface RoomTransport {
  connect(ticket: RoomTicket, self: PlayerId): Promise<RoomConnection>;
}

interface RoomConnection {
  publish(message: unknown): Promise<void>; // to everyone in the room, including the sender
  onMessage(cb: (message: unknown, from: PlayerId) => void): Unsubscribe;
  presence(): PlayerId[]; // who is connected now
  onPresence(cb: (present: PlayerId[]) => void): Unsubscribe;
  status(): ConnectionStatus; // 'connecting' | 'connected' | 'reconnecting' | 'closed'
  onStatus(cb: (status: ConnectionStatus) => void): Unsubscribe;
  close(): Promise<void>;
}
```

- `connect` resolves once the connection is in presence and `presence()` already lists everyone else there, because a client alone in a room becomes its host (§8.1). `publish` rejects while not connected.
- The only ordering guarantee assumed is that **messages from one sender arrive in the order sent**. There is no guarantee across senders, which the protocol doesn't need.
- Delivery is at-most-once from the game's point of view. Lost messages are recovered because the next snapshot carries the whole state. A client that reconnects sends `hello` again.
- Adapters must not depend on message history or persistence being there.
- `from` must be the identity the transport authenticated (for example the Ably `clientId` bound into the token), not a field the sender wrote. Where the vendor can't bind identity, the adapter uses the message's `from` field, which is accepted under the trust model.

### 6.2 Presence and liveness

Presence is the **only** way the game knows who is online, and providing it is the adapter's job.

- An adapter must report a member as gone within **30 s** of an abrupt drop (closed tab, lost signal, killed app), and at once after a clean `close()`.
- **Vendors with presence** use it natively: Ably presence, or AWS IoT lifecycle events.
- **Vendors without it** (e.g. API Gateway WebSockets, where `$disconnect` doesn't fire reliably on silent drops) implement presence inside the adapter. Each connection publishes a heartbeat every 10 s, a member silent for 25 s counts as gone, and a clean close publishes a goodbye. `LocalTransport` also says goodbye on `pagehide`, so closing a tab hands over at once. Browsers throttle timers in tabs hidden for a long time, so a background tab's heartbeats can come too late and it drops out of presence until they resume; that's accepted for a development adapter.
- The game runs **no heartbeat of its own**. Two liveness signals could disagree and elect two hosts.
- A locked or backgrounded phone usually loses its socket and shows as gone. That is fine, because seats and points survive (§2).

### 6.3 Conformance suite

`@cranny/multiplayer` exports `describeTransportConformance(name, makeHarness)`, a Vitest suite that every adapter must pass: fan-out to all members including the sender, per-sender ordering, `from` identity, presence join, clean leave, abrupt drop within the 30 s bound (with fake timers where the adapter allows it, or a time-scaled harness otherwise), reconnect and status changes, and isolation (a member of one room never sees another room's messages or presence). Swapping vendors means writing an adapter that passes this suite, and nothing else.

## 7. Room directory (`RoomDirectory`)

The directory is the only part that needs something outside the browser. It stops name collisions, lets names be reused, and hands out credentials that only work for one room.

It does two separate jobs, renewed on different schedules, which must not be combined:

- **Room keep-alive:** keeps the room's **name** claimed. Only the host does this, on a fixed timer.
- **Credential refresh:** keeps one **player's** transport credential valid. Each client does this for itself, only when its credential is about to expire. Credential lifetimes are set by the vendor (Ably defaults to 1 hour) and are longer than most games, so most clients never refresh at all.

```ts
interface RoomDirectory {
  create(
    name: string,
    self: PlayerId,
  ): Promise<RoomTicket | { error: 'taken' | 'invalid' | 'unavailable' }>;
  join(
    name: string,
    self: PlayerId,
  ): Promise<RoomTicket | { error: 'not-found' | 'invalid' | 'unavailable' }>;
  /** Host only: extend the room's lease. */
  keepAlive(ticket: RoomTicket): Promise<'ok' | 'lost' | 'unavailable'>;
  /** Any client: a fresh credential for its own seat, same channel. */
  refreshCredential(
    ticket: RoomTicket,
    self: PlayerId,
  ): Promise<RoomCredential | { error: 'not-found' | 'unavailable' }>;
}

type RoomTicket = {
  room: string; // canonical name
  channel: string; // opaque transport channel id, random, not derived from the name
  roomKey: string; // random per-room secret from the directory; proves membership for keepAlive and refreshCredential
  credential: RoomCredential;
};

type RoomCredential = {
  value: unknown; // adapter-specific, e.g. an Ably token; scoped to `channel` only
  expiresInMs: number; // set by the vendor/directory, independent of the lease
};
```

- **Leases:** a room is live while its lease hasn't expired. `create` claims a name only if it has no live lease; `join` succeeds only if it does. Both return the same `channel` and `roomKey` to everyone in the room. The **host** calls `keepAlive` about every 4 minutes, and at once on becoming host (§8.2), and each call pushes the lease to 10 minutes from then. When everyone has gone, nobody is host, the lease runs out and the name is free again. A handover takes at most about 30 s (§6.2), well inside the 10 minutes, so the lease doesn't lapse in between. How long the lease lasts, and any maximum room lifetime, depends on the open retention question (§15).
- **Lost name:** if the lease lapsed anyway (for example the host was offline for over 10 minutes) and the name is still free, `keepAlive` re-claims it for the same channel and returns `ok`. If another room has taken the name meanwhile, it returns `lost`. The room keeps playing on its channel, and the lobby shows "This room's name has been reused, so new players can't join. Everyone here can keep playing." Seat ids and credentials are unaffected.
- **Credential refresh:** the transport adapter asks for a new credential when the current one is within about 2 minutes of expiring (vendor SDKs usually do this through an auth callback, e.g. Ably's `authCallback`). The adapter calls `refreshCredential`, which never changes the lease. A client whose refresh fails keeps trying until the credential expires, then shows as `reconnecting` (§9 Connection states).
- **Scoped credentials:** a credential lets its holder publish, subscribe and use presence on **its own channel only**, bound to its own `PlayerId` where the vendor supports that (which is why `create` and `join` take the player's id). The channel id is random, so knowing a room's name gets you in only through the directory. `roomKey` stops anyone outside the room calling `keepAlive` or `refreshCredential` for it.
- **Directory state:** if the Ably spike shows that channel occupancy can tell the directory whether a room is live (§8.3), then `keepAlive` can be a no-op and the lease comes from occupancy. The interface stays the same either way.
- **No listing:** nothing enumerates rooms or reveals anything about a room except whether `join` succeeds.
- **Rate limits:** `create` and `join` are throttled per IP address (e.g. through API Gateway) to slow down guessing names.
- **Implementations:**
  - `FakeDirectory` (in `@cranny/multiplayer`, in memory, for tests).
  - `LocalDirectory` (`apps/web/src/net/`, development only: leases kept in local storage via `storage.ts` as `cranny.localRooms.v1`, shared by tabs on the same origin).
  - `HttpDirectory` (Phase 5), which calls the AWS endpoint. The server design is decided by the Ably spike (§8.3): either a Lambda that checks Ably channel occupancy and signs tokens with no table, or a Lambda plus a DynamoDB table with a TTL for leases. Either way a server piece is needed, because vendor API keys can't be shipped to the browser.

## 8. Host

### 8.1 Who is host

- The **creator** starts as host, with a fresh state (round 0, lobby, term 1), and starts the `keepAlive` timer (§7).
- A client joining a room with **no other members present** (it emptied while its lease was still live) also becomes host, with a fresh state in term 1, and starts the `keepAlive` timer (§7). The old scores are gone, as §1 allows.
- Otherwise the client sends `hello` and waits for a snapshot. If none arrives within 5 s, it shows "Still connecting…" and keeps trying (it resends `hello` every 5 s).
- **Fallback:** if a joining client has had no snapshot at all after 15 s (for example two players opened an empty room together and each saw the other, so neither became host), it starts the room itself in **term 0**. Any real host is in term 1 or later and outranks it (§8.2), so a slow host can't be overridden this way; the fallback host just steps down when the real one is heard.

### 8.2 Handover

- When presence drops the host, every client works out the next host from its latest snapshot: the **present** seat with the lowest `joinOrder` (ties to the lower `PlayerId`). That client becomes host in a **new term** (`term + 1`), applies the presence change, sends a snapshot and calls `keepAlive` (§7). If no seat is present, a present client without a seat takes over the same way, keeping the away seats and their scores.
- **Reigns:** a snapshot's reign is its `term` and host. Reigns are ordered by `term` (later wins), then by the host's `joinOrder` (lower wins), then by `PlayerId` (lower wins). Within one reign, a higher `rev` wins. Every client orders snapshots this way, so they all agree on one host.
- **Split-brain guard:** a client acting as host that receives a snapshot from a **higher-ranked** reign steps down, takes that snapshot and re-announces itself (resending, §5.2). One that receives a snapshot from a **lower-ranked** reign stays host and sends its own snapshot straight away, so the other host steps down. This settles two players becoming host at once (same term, so `joinOrder` decides) without either depending on the other's `rev`.
- A former host that comes back after being replaced holds an older term, so it steps down as soon as it hears the new host. Handover happens only when presence drops the current host.

### 8.3 Ably investigation (Phase 4, before building the Ably adapter)

Answer these and write the findings to `specs/2026-09-25-multiplayer/ABLY.md`:

- Token auth: can a token be limited to one channel's publish, subscribe and presence, with a bound `clientId`? What are the lifetime and renewal rules?
- How quickly does an abrupt disconnect remove a presence member? Does it meet the 30 s bound (§6.2)? Which connection settings affect it?
- Occupancy, presence REST queries or channel metadata: can the directory answer "is this room live?" without its own table? And can it claim a name atomically (two players creating `pizza` at the same moment)?
- Could persistence or rewind hold state or leases, and does that remove the need for DynamoDB?
- Rate limits (messages per second per channel and per connection, message size), whether 100 ms snapshot batching fits them, and pricing at the expected scale (a handful of rooms).
- Which regions are used, and the data-retention defaults (no message persistence wanted).
- CSP: which hosts the SDK connects to (`connect-src`), and whether it needs `worker-src` or anything else.

### 8.4 Future self-hosted AWS transport (design check only)

API Gateway WebSocket API + Lambda + DynamoDB (connections by channel). `$connect` checks the directory credential. Messages fan out through the `@connections` API. Presence comes from the adapter heartbeat (§6.2). AWS IoT Core is an alternative, with MQTT topics per channel, lifecycle events for presence, and a custom authoriser scoped to one topic. Neither is built in this spec; the interfaces in §6 and §7 must allow both.

## 9. Screens and flow

### Routes

- `/multiplayer`: the Multiplayer screen (create or join).
- `/m/:room`: a room (lobby, playing, results). A non-canonical name redirects to the canonical one.
- Home gains a **Multiplayer** button next to Play. This replaces the v1 rule "no Race or multiplayer card".
- While `VITE_ROOM_TRANSPORT` is unset (production before Phase 6), the button and both routes are absent: they redirect to `/`. The multiplayer screens are loaded on first use (`React.lazy`), so solo play never downloads them.
- Development only: `/m/<room>?solve` reveals every round with all pieces but the Single placed, as `?solve` does for solo grids, so a round can be finished with one drop.

### Multiplayer screen (`/multiplayer`)

- **Your name:** shows a random name (the remembered name if this device has one). The player can keep it, press **New random name** to draw another, or type their own in the text field.
- **Create a room:** the primary button. It creates a room with a generated name and goes to `/m/<name>`. A "Choose the room name" disclosure opens a text field with the guessability warning (§4).
- **Join a room:** a text field for the room name (normalised as it's typed) and a Join button. Errors are shown inline: "No room called amber-otter-quilt. Check the name, or create a room.", "That room is full (8 players).", "Couldn't reach the server. Check your connection and try again."

### Room: lobby (`/m/:room`, round status `lobby`)

- The header has a back link, which leaves the room the same way as **Finish** (with the same confirmation), the room name in large type, and **Share**, which uses `navigator.share` with "Join my Cranny room: amber-otter-quilt" and the URL, or copies them with a "Link copied" toast (reuse `shareGrid`, generalised).
- The player list shows each seat's name, total score, a ready tick and an "away" marker for absent seats, with your own row marked "You" and your name editable in place.
- A **Ready** toggle (primary). It is disabled with "Waiting for another player" while you're alone.
- The ready countdown, when running: "Starting in 0:24 · 1 player not ready".
- After a round: the **round results** (placings, time, points, outcome), then the **totals**, sorted by score. **Play another** is the Ready button; **Finish** leaves the room and goes Home, after a confirmation.
- **Leave confirmation:** a modal dialog: "Leave amber-otter-quilt? You'll leave the game and your score will be removed from the scoreboard. If you rejoin, you'll start again from 0." The buttons are **Leave** and **Stay**, with Stay focused; Escape or tapping outside also means Stay. On Leave, the client sends `leave`, waits for a snapshot without its seat (at most 2 s), closes the connection, deletes its seat and any saved multiplayer board (§10) and goes Home. Closing the tab or navigating away with the browser doesn't show the dialog and isn't a leave: the seat stays on the scoreboard as "away" with its score (§2).

### Room: countdown and playing

- The 3-2-1 reveal countdown is drawn over the hidden board (reusing the solo pre-start board, without the Start button). The blocked cells aren't in the DOM until the reveal, as in solo play.
- The play area is the solo one (board, tray, drag), shared with `PlayScreen` rather than copied (T3.3). The controls are **Rotate, Flip and Clear**; there is no New grid.
- The header shows the room name, your stopwatch and a **progress strip**: one bar per other participant, each with their name and "5/9". A finished player's bar shows their place ("1st").
- **Order:** the bars are sorted by how complete each player is, the most complete on the left and the least on the right, so the leaders are always in view. Finished players come first, in finishing order, then everyone else by pieces placed, most first. Ties keep their current order, so bars don't swap without a reason; for the first ordering, ties go by `joinOrder`. When a bar changes position it slides to its new place (about 200 ms; an instant move with `prefers-reduced-motion`). If the strip wraps onto more than one row, the order runs left to right, then top to bottom.
- **Hide progress:** a toggle removes the strip altogether (no line or message is left, and the board gets the space), remembered on the device. The layout must still fit an iPhone SE (375×667) with the strip showing for 7 opponents, so `LAYOUT` in `src/layout/layout.ts` is updated.
- **Close-out:** a banner "Teal Otter finished first · 0:23 left", counting down.
- **You finish:** the solo celebration, then a waiting view with your place, your time, the progress strip and the close-out countdown.
- **Round ends before you finish:** your board locks, "Time's up" shows briefly, then the lobby shows the results.
- **Sitting out or waiting for the next round:** no board. The progress strip is shown with "You'll play from the next round".

### Connection states

- `reconnecting`: a small banner "Reconnecting…". Play carries on locally; progress and finish messages are sent once the connection is back (the last `progress` and any `finished` are re-sent after reconnecting).
- Can't reconnect for 60 s: "Lost connection to the room" with **Try again** and **Home**.
- Engine version not supported (the host's grid version is newer than this client's): "This round needs a newer version of Cranny. Refresh to update." The player sits out.

## 10. Storage (through `src/storage/storage.ts` only)

Tabs are independent (§2), so everything about a seat is kept in **session storage**, which is private to one tab and survives reloads. Only the player name is shared across tabs. `storage.ts` gains session-storage access with the same guarantees as today (it never throws, and validates everything it reads back), and nothing else touches `sessionStorage` directly.

- `cranny.player.v1 = { name: string }` (**local** storage): the name offered by default next time. Tabs that change it just overwrite it; last write wins.
- `cranny.seat.v1 = { room, playerId }` (**session** storage): this tab's seat. A tab is in one room at a time, so opening a different room in the tab replaces it with a new seat. It is deleted when the player leaves with Finish (§2).
- `cranny.multiplayerRound.v1 = { room, round, version, seed, revealedAt, orientations, placements, finishedMs | null }` (**session** storage): this tab's board for the multiplayer round in progress, saved after every change like the solo round. Tabs in different rooms can't overwrite each other's boards, and it is separate from `cranny.round.v1`, so it never overwrites a solo round in progress. It is restored through `resumeRound` (which re-checks every placement) only if the snapshot says the same round is still being played and you're a participant, and cleared when that round ends.
- **Duplicated tabs:** the browser's "Duplicate tab" copies session storage, which would give two tabs the same seat. So each tab holds a **Web Lock** named `cranny-seat:<playerId>` (`navigator.locks.request` with `ifAvailable: true`) for as long as it's in the room. If the lock is already held when a tab starts, the tab discards the copied seat and board and joins as a new player. The browser releases the lock when a tab closes or crashes, so a reload gets it back. Where Web Locks isn't supported, the check is skipped and a duplicated tab shares the seat; that is accepted.
- `cranny.multiplayerPrefs.v1 = { hideProgress }` (**local** storage): the Hide progress choice (§9).
- Multiplayer solves **don't** count toward solo stats (`cranny.stats.v1`).
- Everything read back is validated, as today.

## 11. Security and privacy

- **Room isolation** is the main requirement. A credential only works on one room's random channel (§7). There is no room listing. Presence and messages are scoped to the channel. The conformance suite checks isolation.
- **Knowing the name is the key.** Generated names have about 31 bits of entropy, and custom names are weaker; the UI says so (§4). Directory rate limits slow guessing.
- **Only the room's members see its data:** player names, scores and progress counts. Boards are never sent. The only thing sent about a board is the count of pieces placed.
- **Untrusted input:** every message is shape-validated. Names are length-limited, have control characters stripped, and are rendered as text only (React escaping, never `innerHTML`).
- **Short-lived credentials:** tokens last at most an hour and are refreshed per client, separately from the room lease (§7). The directory keeps no personal data, and no message persistence is configured on the vendor.
- **CSP:** production `security-headers.json` is `default-src 'none'` today, so it blocks websockets and `fetch`. Phase 5/6 adds `connect-src` for exactly the directory API origin and the vendor's hosts found in the spike, and nothing else. The CloudFront policy and `pnpm preview` pick it up as they do now.
- **Tabs and browsers:** every tab is an independent player holding credentials for only the room it joined. No tab can see another room's players or scores, even in the same browser. One person can hold several seats in a room (tabs, private windows, other browsers). That is accepted under the trust model, and the 8-present and 16-seat limits cap it.
- **Cheating is out of scope:** a modified client can fake finishes or scores, and that is accepted (§3).

## 12. Accessibility

- Progress bars use `role="progressbar"` with `aria-valuenow`/`aria-valuemax=9` and a label ("Teal Otter, 5 of 9 pieces").
- A polite live region announces "Teal Otter finished first", "30 seconds left" and "10 seconds left" (not every second), and the reveal.
- The Ready toggle uses `aria-pressed`. The ready tick and the "away" marker have text equivalents. The leave confirmation is a native `<dialog>` opened with `showModal()`, so focus is trapped and returned properly, with a title and description linked through `aria-labelledby`/`aria-describedby`.
- `a11y.test.tsx` covers the new screens (Multiplayer, lobby, playing with the strip, waiting, results). Any new text or background colour pair is added to `contrast.test.ts`.
- Keyboard and screen-reader play of the board itself stays out of scope, as in solo (single-player SPEC §10).

## 13. Infrastructure (Phases 5–6)

- A directory/token endpoint: an API Gateway HTTP API with per-route throttling, and one Lambda (Node 24, TypeScript, bundled). Its code lives in a new workspace package `apps/rooms-api` (`@cranny/rooms-api`), which reuses name normalisation from `@cranny/multiplayer`. Whether there's a DynamoDB table with TTL depends on the spike.
- The Ably API key goes in SSM Parameter Store (SecureString), read by the Lambda only. It never appears in Terraform state as a literal or in the web build.
- Terraform in `infra/` as today. A custom domain (e.g. `rooms.cranny.cooke.ing`) or the CloudFront distribution routing `/api/*` to the API. Pick the same-origin option if the spike finds no reason against it, because that keeps `connect-src` smaller.
- `scripts/deploy.sh` also deploys the Lambda. Applying Terraform changes real AWS resources, so only when asked.

## 14. Testing

- **`@cranny/multiplayer` unit tests (Vitest):**
  - Scoring table and ties impossible by construction (finishes are ordered).
  - `roomReducer`: ready-all start, ready-timeout start and cancel, sitting out, minimum 2 players, reveal, progress, first finish opens the close-out, the round ends at the deadline and early when everyone present has finished, late and duplicate finishes are ignored, seat creation, the 8-present and 16-seat limits, returning seats keep points, `leave` removes the seat and its score (including from `lastResult`) and a later `hello` from that device makes a new seat at 0, and late joiners wait.
  - Message validators reject malformed, oversized and wrong-protocol messages.
  - Room-name normalisation and generation (word-list size and entropy check, no duplicate words in the list).
- **Simulations:** several simulated clients over `FakeTransport` with fake timers. A full round with 3 players. The host leaves mid-round, the next host takes over and the countdown carries on. Two hosts at once settle to one, and a replaced host that comes back steps down. A reload mid-round resumes. A player drops and returns during the next round.
- **Conformance suite** runs against `FakeTransport`, `LocalTransport` (twice: over an in-memory bus with fake timers, and over the real BroadcastChannel with time scaled) and, in Phase 6, `AblyTransport`. The Ably run needs a key, so it is skipped unless `ABLY_TEST_KEY` is set.
- **Web component tests** with `FakeTransport`/`FakeDirectory`: the create and join flows and their errors, lobby Ready and the countdown, the reveal hides blockers until the deadline, the progress strip (ordered by completeness, stable ties) and the hide toggle, the close-out banner, the results and totals, reload restoring the board, per-tab seats (two tabs on one room are two players, a reload keeps the seat and board, a duplicated tab gets a new seat with Web Locks mocked, and two rooms in two tabs keep separate boards).
- **Manual:** several tabs with `VITE_ROOM_TRANSPORT=local`. After Phase 6, real devices (an iPhone, an Android phone and a desktop), including locking a phone mid-round.

## 15. Risks and notes

- **Host on a sleeping phone:** a backgrounded host stalls the room until presence drops it (at most 30 s). That is accepted; handover then carries on.
- **Latency decides close finishes:** the order is the order of arrival at the host, so the host has a small advantage. Accepted for a casual game.
- **Vendor limits:** snapshot batching (100 ms) keeps message rates low. The spike confirms Ably limits.
- **Custom names are guessable.** This is the user's choice, with a warning.
- **Tab-bound seats:** closing the tab by mistake loses the player's seat (a new tab starts at 0). This is the user's choice: it keeps tabs independent, with no syncing between them.
- **Open: room retention.** How long a room can last is still to be decided: at most about 8 hours, and probably much less. This sets whether a room has a maximum lifetime even while occupied; the 10-minute empty-room lease (§7) has to fit inside it. Decide before Phase 5 (directory leases). (Seats need no retention rule: session storage ends with the tab.)

## 16. Decisions log

Ad-hoc rooms shared by a phrase or link · generated 3-word names by default, custom allowed, collision-checked, reusable after the room empties · the host client is authoritative, with handover by presence and hosts ordered by term then join order · a new random grid every round · all players Ready, with a 30 s ready timeout once more than half are ready, and the rest sit out · simultaneous reveal after a 3-2-1 · other players' progress as bars (pieces placed), which can be hidden · 30 s close-out after the first finish, otherwise unlimited · scoring 5/3/2/1/0, cumulative for the room's life · late joiners wait for the next round · a seat belongs to one tab and keeps its points through reloads and reconnects, while opening the room in a new tab joins as a new player at 0 · one browser can be in several rooms at once in different tabs · leaving with Finish gives the seat up after a confirmation, removing the score from the scoreboard, and a rejoin starts from 0, and a mid-round reload restores the board · 2–8 players · random editable player names, duplicates suffixed · no server-side verification, but rooms isolated by scoped credentials · a vendor-neutral transport and directory with a conformance suite · Ably first, after a capability spike that decides whether DynamoDB is needed · the feature is called "multiplayer" (routes `/multiplayer`, `/m/:room`) · multiplayer solves don't count toward solo stats.
