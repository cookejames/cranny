# Cranny Analytics — Tasks

## Phase 1 — Cookieless PostHog behind CloudFront

- [x] **T1.1 Spec and task list** (this folder).
- [x] **T1.2 Client** (§4). `src/analytics/analytics.ts`, `VITE_POSTHOG_KEY` in `.env.production`, `startAnalytics` in `main.tsx`.
- [x] **T1.3 Events** (§5). Solo, multiplayer, install and share call sites.
- [x] **T1.4 Proxy** (§3). CloudFront origins, behaviours and the `strip-relay` function; the same proxy in `vite.config.ts`.
- [x] **T1.5 CI permissions**. CloudFront Function actions for the deploy role, and `DescribeFunction` for the plan role, in `infra/bootstrap/ci.tf`.
- [x] **T1.6 Tests** (§6).
      _Done when:_ `pnpm lint && pnpm typecheck && pnpm test` pass, and a production preview sends events to `/relay` with no CSP errors or storage.
      _Result:_ all pass; the preview sent `/relay/e/` (200) with no cookies or PostHog storage.
- [x] **T1.7 PostHog project settings**: switch on Cookieless server hash mode (§2), and switch off session recording, which the client doesn't use.
      _Result:_ set with `posthog-cli` at the user's request: cookieless server hash mode Stateful (2), session recording off.
- [x] **T1.8 Bootstrap apply** (by hand): `terraform -chdir=infra/bootstrap apply` before the PR merges, so CI can create the CloudFront Function.
      _Result:_ applied; only the two CI policies changed.
- [ ] **T1.9 After deploy**: play a solo and a multiplayer round in production, and check the events arrive in PostHog with scrubbed URLs.
