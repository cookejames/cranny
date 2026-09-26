# Cranny Analytics — Specification

## 1. Summary

Count how often Cranny is played, solo and multiplayer, and which features are used, without cookies or device storage. Events carry the player's name when they have one. Events go to PostHog (EU cloud, free tier) through a reverse proxy on Cranny's own domain.

### Out of scope

Session recording, autocapture, heatmaps, error tracking, feature flags, surveys, and person profiles.

## 2. Privacy

- **Cookieless** (`cookieless_mode: 'always'`): PostHog stores nothing on the device (no cookies, no local or session storage). Its server counts visitors with a hash of IP, user agent and a salt that changes daily, so a visitor can't be followed from one day to the next. The project must have **Cookieless server hash mode** switched on (Project settings → Web analytics), or ingestion drops the events.
- `person_profiles: 'never'`: no person profiles, and `identify()` does nothing.
- URLs are scrubbed before sending (`before_send`): room names become `/m/:room` (a room name is enough to join the room), grid codes `/g/:code`, and query strings and fragments are dropped. This applies to every property whose name contains `url`, `pathname` or `referrer`.
- **Player name**: every event carries `playerName`, the name the player chose or was given for multiplayer (`knownPlayerName` in `src/multiplayer/playerName.ts`: this session's name, else the remembered one). It's left out for someone who has never had a name; a solo player isn't given a random one just for analytics. The user chose this knowing it makes the events personal data: names are free text, often a real name, and link a player's events across days, which the cookieless hash otherwise prevents.
- Other event properties are low-cardinality and never name a room or grid.
- No cookie banner is needed (nothing is stored on the device), but because events carry names, **the site needs a privacy notice** saying what's collected, why, and that PostHog (EU) processes it.

## 3. Transport

- The SDK sends to `/relay` on Cranny's own origin. CloudFront (`infra/cdn.tf`) forwards `/relay/static/*` and `/relay/array/*` to `eu-assets.i.posthog.com`, and all other `/relay/*` paths to `eu.i.posthog.com`. The CloudFront Function `cranny-strip-relay` (`infra/functions/strip-relay.js`) removes the prefix first.
- It's same-origin, so the CSP needs no change (`connect-src 'self'`), and ad blockers don't recognise the path. CloudFront appends the viewer's IP to `X-Forwarded-For`, which cookieless hashing needs.
- `pnpm preview` and `pnpm dev` proxy `/relay` the same way (`vite.config.ts`).
- The SDK is told not to load anything else (`disable_external_dependency_loading`), so the asset routes are there only as a fallback.

## 4. Client

- `src/analytics/analytics.ts`: `track(event)` takes an `AnalyticsEvent`, a union of every event and its properties. To count a new feature, add a member to the union and call `track` where the player acts.
- On only when `VITE_POSTHOG_KEY` is set (`.env.production`; a project token is public by design). Dev and test builds send nothing.
- `posthog-js` is loaded with a dynamic import once the browser is idle (`startAnalytics` from `main.tsx`), so it's a separate chunk, not part of the main bundle. `track` before then waits for the load. Nothing here throws.
- Page views come from `capture_pageview: 'history_change'` (client-side routing).

## 5. Events

| Event                  | When                                                | Properties                         |
| ---------------------- | --------------------------------------------------- | ---------------------------------- |
| `solo_round_started`   | Start pressed                                       | `shared`                           |
| `solo_round_completed` | The drop that fills the grid (once, with the stats) | `shared`, `duration`               |
| `mp_room_created`      | Create a room succeeded                             | `customName`                       |
| `mp_room_joined`       | Join a room (the form) succeeded                    | —                                  |
| `mp_round_started`     | This tab's reveal (not a reload mid-round)          | `players`                          |
| `mp_round_completed`   | This tab filled the grid (once, with the stats)     | `players`, `duration`              |
| `install_clicked`      | Install app pressed                                 | `platform` (`android` / `ios`)     |
| `link_shared`          | Share grid or Share room link                       | `kind` (`grid` / `room`), `result` |

`duration` is a bucket: `<1m`, `1-2m`, `2-5m`, `5-10m`, `10m+`. Opening a room link directly (not through the Join form) isn't counted as `mp_room_joined`; `mp_round_started` counts those players once they play.

## 6. Tests

- `analytics.test.ts`: duration buckets; URL scrubbing; nothing sent without a key; PostHog started once, cookieless, with each event sent; `track` never throws.
- Checked in a production preview: events go to `/relay/e/` (200), no CSP errors, no cookies, and no PostHog keys in local or session storage.
