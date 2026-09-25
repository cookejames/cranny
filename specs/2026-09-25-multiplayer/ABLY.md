# Ably investigation (T4.1)

Findings for the questions in SPEC §8.3, from Ably's current docs (fetched 2026-09-25 via `ably.com/llms.txt`) and experiments against a Free-package app with `ably` 2.29.0. Experiments ran from Node 24 in London, plus headless Chrome for the CSP. Timings are from three runs each unless noted.

## Recommendations

1. **Directory: a stateless Lambda, no DynamoDB** (decided in T4.2). Ably can't claim a name atomically, and occupancy lags (§3 below), but neither matters if the channel is named after the room (`room:<name>`): a missed collision puts both players in the same room, which the host rules already handle. `create` and `join` check `presenceMembers` for a helpful error, and the Lambda signs a token. No leases, `keepAlive` or `roomKey`.
2. **Tokens: JWTs signed by the Lambda**, no call to Ably. Capability `{"room:<name>": ["publish", "subscribe", "presence"]}`, `x-ably-clientId` = the `PlayerId`, lifetime 60 minutes (the maximum for a key with revocation enabled). Use a dedicated API key restricted to `room:*` with publish, subscribe, presence and channel-metadata (the last for the directory's liveness check; client tokens never get it).
3. **Channel names:** `room:<canonical room name>`. No channel rules are needed, so there's no persistence.
4. **Connection settings:** `transportParams: { heartbeatInterval: 10000, remainPresentFor: 5000 }`. With these, a silent drop leaves presence in about 22 s, a crashed or killed client in about 5 s, and a clean close at once. The 30 s bound in SPEC §6.2 holds with room to spare. Ably's defaults do **not** meet it (42 s).
5. **`connect-src`:** `https://main.realtime.ably.net wss://main.realtime.ably.net https://*.ably-realtime.com wss://*.ably-realtime.com`, plus the directory API origin (or `'self'` if it's routed through CloudFront). Nothing else is needed: no `worker-src`, `unsafe-eval` or inline code.
6. **Snapshot rate: keep 100 ms merging.** An 8-player room at 10 worst-case snapshots per second plus progress from everyone used about a third of the per-channel limit with no loss.
7. **Package: stay on Free** for a handful of rooms. Upgrade to Standard ($29/month plus usage) if we approach 200 concurrent connections, which is 25 full rooms.
8. **SDK import: `ably/modular`** (`BaseRealtime` with `WebSocketTransport`, `FetchRequest` and `RealtimePresence`): 40 KB gzipped against 58 KB for the full SDK, loaded only with the multiplayer chunk.

## 1. Token auth

**Can a token be limited to one channel, with a bound `clientId`?** Yes. With a JWT carrying `{"room:X": ["publish", "subscribe", "presence"]}` and `x-ably-clientId: "p1"`:

| Attempt                                      | Result                                           |
| -------------------------------------------- | ------------------------------------------------ |
| Attach, enter presence, publish on `room:X`  | OK                                               |
| Attach `room:Y` (another room)               | 40160 denied                                     |
| Attach `room:X:y` (a sub-channel)            | 40160 denied (an exact name matches only itself) |
| Publish with `clientId: "p2"` on the message | 40012 rejected                                   |
| `presence.enterClient("p2")`                 | 40012 rejected                                   |
| History, channel metadata                    | 40160 denied                                     |

Subscribers receive `message.clientId === "p1"`, set by Ably, not by the sender. SPEC §6.1's "`from` is the transport-authenticated identity" works as written: the adapter passes `message.clientId` as `from`.

**Lifetime:** at most 24 hours in general, and **at most 1 hour when token revocation is enabled on the key** (it is on ours: a 3600 s token connected and a 3660 s one failed with 40003). One hour matches SPEC §11.

**Renewal:** with `authCallback`, the SDK calls it by itself about 30 s before expiry (measured with a 60 s token: calls at 29 s, 59 s, 89 s and so on). The connection re-authenticates in place: the channel stayed attached, presence stayed entered, and all 74 test messages arrived across five renewals. So the adapter doesn't time refreshes itself. Its `authCallback` returns the ticket's credential the first time and calls `refreshCredential` after that. If the callback fails, the SDK retries while the token is still valid, then goes `disconnected` (→ `reconnecting`).

**JWT or Ably TokenRequest:** JWT. The Lambda signs it with the key secret (HS256, `kid` = key name), so there's no call to Ably and no Ably SDK in the Lambda. The capability list is tiny, so JWT size limits don't matter.

## 2. Presence after an abrupt disconnect

Measured from the moment of the drop until another client got the `leave`. "Killed" is `SIGKILL`: the OS closes the socket, as when a tab crashes. "Frozen" is `SIGSTOP`: the socket stays open but nothing answers, as when a phone loses signal or freezes in the background.

| Case                                                     | Leave after |
| -------------------------------------------------------- | ----------- |
| Clean `close()`                                          | 0.02–0.04 s |
| Killed, defaults                                         | 15.0 s      |
| Killed, `remainPresentFor` 5 s                           | 5.0 s       |
| Frozen, defaults                                         | **42.0 s**  |
| Frozen, `heartbeatInterval` 10 s                         | 32.0 s      |
| Frozen, `heartbeatInterval` 10 s, `remainPresentFor` 5 s | 22.0 s      |
| Frozen, `heartbeatInterval` 5 s, `remainPresentFor` 1 s  | 8.0 s       |

The runs were consistent to within 10 ms. A frozen client leaves after about `2 × heartbeatInterval − 3 s + remainPresentFor`. The defaults (15 s heartbeat, 15 s `remainPresentFor`) miss the 30 s bound, so the adapter must set both.

**Why 10 s / 5 s, not shorter:** `remainPresentFor` is also the grace period for a client that reconnects after a network blip. Too short, and a host switching from Wi-Fi to mobile data is dropped from presence, which forces a handover. At 5 s the SDK's immediate reconnect (usually under a second) fits comfortably. A 10 s heartbeat costs one small frame every 10 s.

Other presence behaviour the adapter must allow for:

- **Tab close and reload are clean leaves.** ably-js closes the connection on `beforeunload` by default (`closeOnUnload: true`), so a host that reloads hands over immediately, as `LocalTransport` does with its `pagehide` goodbye. `beforeunload` doesn't always fire (e.g. Chrome Memory Saver discards), and those cases fall back to the killed or frozen timings.
- **Members are keyed by `clientId` + `connectionId`.** If the SDK can't resume and reconnects with a new connection, the same `clientId` can briefly be present twice. The adapter must collapse `presence()` to distinct `clientId`s, and treat a `leave` as removing a player only when no other connection with that `clientId` is left.
- `channel.presence.get()` waits for the presence sync by default, so `connect()` can resolve after entering and calling `get()`, and `presence()` is then complete (SPEC §6.1).
- After `suspended` (offline for more than 2 minutes), the SDK reattaches the channel and re-enters presence automatically.

## 3. Can Ably replace the directory's table?

**"Is this room live?" — not reliably.**

- A channel metadata request (`GET /channels/<id>`, needs the `channel-metadata` capability) activates the channel as a side effect. A never-used channel reported `isActive: true` with 0 connections.
- `isActive` stays true for about a minute after the last client leaves and the last message. It also stayed true for the whole 150 s I polled, because each poll keeps the channel active.
- Occupancy counts are eventually consistent. 3 s after the only member closed, one poll showed `connections: 1, presenceMembers: 1` again, between polls showing 0.
- REST `presence.get` works, but every member returned counts as a message.

So occupancy can say that a room looks empty, a few seconds late. That is too loose for an exact lease, but enough for the best-effort checks the directory uses (below).

**Atomic name claim — not possible.** Ably has no compare-and-set. Two concurrent REST publishes of the same idempotent message id (`id: "claim"`) to a `names:` channel both returned success. Only the first was kept (history showed `chanA`), and the loser got no signal that it had lost. Presence and LiveObjects don't offer a conditional write either.

**What the spike recommended, and what was decided.** The spike first recommended Lambda + DynamoDB (a conditional put for `create`, TTL for leases). T4.2 went further: with the channel named after the room there is nothing to claim. Two simultaneous creators land in the same room, and a `create` that misses an occupied room joins it, so best-effort occupancy checks are enough. Use `presenceMembers` rather than `connections`: a dropped player stays a member for `remainPresentFor`, which gives rooms a short grace period while everyone reconnects. The Lambda calls `GET /channels/room:<name>` with the key (it needs `channel-metadata` on `room:*`). Each call counts against the Free package's HTTP API limit (50/s, 25,000/hour), which is plenty.

## 4. Persistence and rewind

- By default Ably keeps messages in memory for **2 minutes** and never writes them to disk. Persisted history needs a channel rule (24 hours on Free, counted as an extra message per message). "Persist last message" needs a rule too.
- `rewind` works without persistence inside the 2-minute window: a client attaching with `rewind: '1'` 20 s after the only publish received that snapshot. That could give a late joiner the last snapshot before the host answers its `hello`. It isn't needed, because the host replies to `hello` straight away, and SPEC §6.1 says adapters must not depend on history. Leave it out.
- Neither can hold leases: the 2-minute window is too short, and there's no conditional write (§3).

## 5. Rate limits, message size, pricing

Limits that apply (the same on every package unless noted):

| Limit                                          | Value                  | Our worst case                                                                                                                      |
| ---------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Publishes per channel, all publishers together | 50/s                   | 10 snapshots/s + progress (at most a few per second per player)                                                                     |
| Messages received per connection               | 50/s                   | the same as above: every client receives everything                                                                                 |
| Messages published per connection              | 50/s                   | host 10/s                                                                                                                           |
| Message size                                   | 64 KiB (Free/Standard) | 4.2 KB: a worst-case snapshot (16 seats with 32-char names, 8 finishers, a full `lastResult`). SPEC §5.2's 8 KB cap has 2× headroom |
| Presence members per channel                   | 200                    | 16                                                                                                                                  |
| Free: concurrent connections / channels        | 200 / 200              | 8 per room / 1 per room                                                                                                             |
| Free: account message rate                     | 500/s                  | about 20/s for a busy 8-player room (see below)                                                                                     |

**Measured:** 8 clients on one channel, the host publishing a 4.2 KB snapshot every 100 ms and the other 7 each publishing a `progress` every second, for 30 s. All 297 snapshots and 210 progress messages reached all 8 clients, with latency p50 20 ms, p95 27 ms and max 76 ms, and no errors.

**Over the limit:** at 45 snapshots/s plus 2 progress/s from each player (about 59 publishes/s on the channel), Ably rejected the excess with **42913** "Rate limit exceeded; request rejected (nonfatal)", scoped to the channel. The connections stayed up, and every client received the same subset. The adapter should treat a rejected publish as a lost message (SPEC §6.1, at-most-once), which the protocol already recovers from, and not as a connection error.

**Message counting:** a publish counts as 1 inbound plus 1 outbound per subscriber, and echo to the sender counts too. So on an 8-player channel each snapshot or progress message is 9 messages, and each presence enter or leave is 9. Keep `echoMessages` on (the default): SPEC §6.1's `publish` delivers to the sender too, and turning echo off would save only 1 in 9.

**Estimate for one 8-player round of about 2 minutes:** about 120 `progress` messages plus about 140 snapshots, times 9, is roughly 2,500 messages, or about 3,000 with the lobby and presence. That's about 20 messages/s while the round runs.

- **Free** (6M messages a month, 500/s, 200 connections): about 2,000 eight-player rounds a month, or about 25 busy rooms at once before the rate or connection limit. That is plenty for "a handful of rooms". Ably emails when a limit is near, and most limits are soft at first.
- **Standard:** $29/month, plus $2.50 per million messages and $1 per million channel-minutes or connection-minutes.

## 6. Regions and data retention

- Clients connect to `main.realtime.ably.net`, which resolves by latency to the nearest Ably datacentre (all of them in AWS). From London, this account connected to **eu-west-1** (Ireland), according to the `x-ably-serverid` header and `connectionDetails.serverId`. Players in other regions connect to their nearest datacentre, and Ably links the regions for a shared channel. Pinning a region needs an Enterprise package, and we don't need it.
- **Retention:** messages and presence events are kept in memory for 2 minutes (for connection recovery), then dropped. Nothing is written to disk unless a channel rule turns on persistence. **Check in the dashboard that the app has no rules on `room:*`.** Ably keeps aggregate usage stats, not message content.
- **The SDK's own browser storage:** ably-js writes `ably-transport-preference` to `localStorage` when it has to fall back from WebSocket, and uses `sessionStorage` only if the `recover` option is set. We shouldn't set `recover`, because a reload rejoins through `hello`. The CLAUDE.md rule that all storage goes through `storage.ts` covers our code, not vendor SDKs. Mention that exception there when the adapter lands.

## 7. CSP

I served a test page with the production `security-headers.json` policy plus a candidate `connect-src`, loaded it in headless Chrome, and collected `securitypolicyviolation` events.

With `connect-src 'self'` and the main host blocked, the SDK tried, in order:

1. `wss://main.realtime.ably.net/` (the primary WebSocket)
2. `https://internet-up.ably-realtime.com/is-the-internet-up.txt` (connectivity check; if this fails it stops there and retries every 15 s)
3. `wss://main.{a–e}.fallback.ably-realtime.com/` (3 of the 5 fallback hosts, chosen at random)
4. `wss://ws-up.ably-realtime.com/` (WebSocket connectivity check)
5. `https://main.realtime.ably.net/comet/connect` and `https://main.{a–e}.fallback.ably-realtime.com/comet/connect` (the HTTP polling fallback)

The SDK code uses the same hosts: `main.realtime.ably.net` and `main.{a–e}.fallback.ably-realtime.com`. The docs page on the edge network still lists the older `realtime.ably.io` and `rest.ably.io`, which 2.x no longer uses.

With `connect-src 'self' https://main.realtime.ably.net wss://main.realtime.ably.net https://*.ably-realtime.com wss://*.ably-realtime.com`, the page connected over WebSocket, published, received its own message and entered presence, with **no violations**. With the main host left out, it connected through `main.a.fallback.ably-realtime.com` within 2 s. So the wildcard covers the two-label fallback hosts, and fallback works under the policy.

Tokens go in the WebSocket URL (`access_token=…`). That's normal for Ably and fine for 1-hour room-scoped tokens, but it's one more reason not to add a CSP `report-uri` that would log full URLs.

## Spec changes (T4.2)

Applied to SPEC.md: §2 and §4 (names are free once a room is empty; collisions are best effort), §6.2 (the Ably settings and presence de-duplication), §7 (the stateless directory, `rejoin`, the JWT), §8.1 (become host only when nobody else is present), §8.2 (no `keepAlive`), §11 (the dedicated key and the `connect-src` list), §13 (no database), §15 (about 22 s stall; room retention is still open) and the decisions log.

The Ably key for experiments and the conformance run is `ABLY_KEY`, in the git-ignored repo-root `.env`.
