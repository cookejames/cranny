# Cranny Installable App — Tasks

## Phase 0 — Spec

- [x] **T0.1 Spec and task list** (this folder).
- [ ] **T0.2 CLAUDE.md** points at this spec, the install module and the icon script.

## Phase 1 — Manifest and icons (§3, §4, §6)

- [x] **T1.1 Chrome check** (§8). Serve a build with only a manifest and placeholder icons through `pnpm preview`, and confirm the current Chrome fires `beforeinstallprompt` and offers to install without a service worker.
      _Done when:_ recorded here, with the Chrome version. If it doesn't fire, update §5 before T2.
      _Result:_ Chrome 154.0.8037.57 (headless, macOS), with the real icons, checked over the DevTools protocol: `beforeinstallprompt` fired on load, `Page.getInstallabilityErrors` and the manifest errors were both empty, and nothing hit the CSP. §5 stands.
- [x] **T1.2 Icon script** (§4). `apps/web/scripts/icons.ts` and `pnpm --filter @cranny/web icons`: the `C` outline from Bricolage Grotesque 800 via `opentype.js`, SVGs written, PNGs rendered with `@resvg/resvg-js`. Generated files committed to `apps/web/public/`.
      _Done when:_ every file in the §4 table exists, and the maskable icon passes a check at maskable.app (or the same circle-mask test by eye).
      _Notes:_ the glyph comes from the `latin-800` WOFF (opentype.js can't read WOFF2), and opentype.js loads through `createRequire` because it ships as UMD. The script writes the SVG path itself, since opentype.js's `toPathData` optimisation dropped some of the C's straight edges. The maskable C is 46% of the side, and passes the circle-mask test by eye. `scripts/tsconfig.json` typechecks the script with Node types, as part of `pnpm typecheck`.
- [x] **T1.3 Manifest and head tags** (§3). `manifest.webmanifest` and the `index.html` links and meta tags.
- [x] **T1.4 CSP and deploy** (§6). `manifest-src 'self'` in `security-headers.json`; `scripts/deploy.sh` uploads the manifest as `application/manifest+json`.
      _Note:_ CloudFront's CSP comes from this file through Terraform (`infra/cdn.tf`), so production only gets `manifest-src` after a `terraform apply` (T3.1).
- [x] **T1.5 Tests** (§7). Manifest fields, every referenced file exists with its claimed PNG size, and the CSP allows the manifest.
      _Done when:_ `pnpm lint && pnpm typecheck && pnpm test` pass, and Chrome DevTools shows the manifest with no warnings under `pnpm preview`.
      _Result:_ `src/manifest.test.ts` (9 tests) reads `public/` through `import.meta.glob`, and each PNG's size from its header. `pnpm preview` serves the manifest as `application/manifest+json` with the new CSP, and Chrome reports no manifest errors (T1.1).

## Phase 2 — Install button (§5)

- [ ] **T2.1 Install module.** `src/install/install.ts`: holds `beforeinstallprompt` from startup (`main.tsx`), `appinstalled`, standalone detection, iOS Safari detection, and a `useSyncExternalStore` hook.
      _Done when:_ the module tests in §7 pass, including the user-agent table.
- [ ] **T2.2 Home button and iOS dialog.** The Install app button, the browser prompt, and the Add to Home Screen instructions dialog.
      _Done when:_ the Home component tests and the a11y tests in §7 pass, and Home still fits an iPhone SE with the button showing (`computeLayout` and CSS checked in a 375×667 viewport).

## Phase 3 — Launch

- [ ] **T3.1 Deploy**: `terraform -chdir=infra apply` first (only the CSP in the response headers policy should change), then `scripts/deploy.sh`, then check `curl -sI https://cranny.cooke.ing/manifest.webmanifest` shows `application/manifest+json`, and the CSP includes `manifest-src`.
- [ ] **T3.2 Real devices** (§7): install on Android Chrome, desktop Chrome and iPhone Safari, and play solo and multiplayer in the installed app.
- [ ] **T3.3 README** gains a short "Install it" note under How to play.
