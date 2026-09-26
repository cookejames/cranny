# Cranny Installable App — Specification

## 1. Summary

Players can install Cranny to their phone's home screen or their desktop, and it opens full-screen like an app, with its own icon and name. It stays **online only**: there is no service worker and no offline cache, so the installed app behaves exactly like the website and always loads the latest deploy. Home gains an **Install app** button where the browser lets us offer one, and short instructions on iPhone and iPad, where it doesn't.

### In scope

- A web app manifest, a letter-mark icon in every size the platforms need, a favicon, and the iOS meta tags.
- An **Install app** button on Home, on phones and tablets only: the browser's own install dialog on Android (Chrome, Edge, Samsung Internet), and "Add to Home Screen" instructions on iOS and iPadOS Safari. It is hidden on desktops, once the app is installed, and when running as the installed app. Desktop Chrome and Edge still offer the install from their own address-bar icon.
- The CSP and deploy changes the manifest needs.

### Out of scope, possibly later

Offline play and a service worker (and with them an update prompt: single-player SPEC §14), push notifications, app-store packaging (TWA or similar), share targets, shortcuts, and opening shared room links in the installed app instead of the browser.

## 2. Behaviour

- **Opening the installed app** starts at Home (`/`) in a standalone window: no address bar or browser tabs. Every screen already has its own back link, so no navigation is lost without the browser's back button.
- **Updates:** nothing new. `index.html` is served with `no-cache` (deploy.sh), so every cold start of the app loads the current deploy, as the website does. A running app keeps its version until it is reloaded or relaunched.
- **Without a connection**, the installed app shows the platform's own offline page, as the website does today.
- **Multiplayer seats** live in session storage (multiplayer SPEC §10), which the installed app keeps for as long as the app is running, so a seat survives a reload but not having the app closed. This is the same as closing a browser tab, so the seat rules don't change.
- **Shared links** (`/g/<code>`, `/m/<room>`) opened from another app still open in the browser, not the installed app. That is the platforms' default for a site without link capturing, and it's fine: the browser and the app share local storage, so solo stats are the same in both on Android and desktop. On iOS the installed app has **its own storage**, separate from Safari's, so stats earned in Safari don't appear in the app, or the other way round. This is a platform limit, noted in the iOS instructions (§5).

## 3. Manifest (`apps/web/public/manifest.webmanifest`)

| Field              | Value                                                           |
| ------------------ | --------------------------------------------------------------- |
| `id`               | `/`                                                             |
| `name`             | `Cranny`                                                        |
| `short_name`       | `Cranny`                                                        |
| `description`      | The page's meta description                                     |
| `start_url`        | `/`                                                             |
| `scope`            | `/`                                                             |
| `display`          | `standalone`                                                    |
| `orientation`      | `portrait` (the game is laid out for a phone held upright)      |
| `background_color` | `#f3efe6` (`--color-ground`, so the splash screen matches Home) |
| `theme_color`      | `#f3efe6` (as the existing `<meta name="theme-color">`)         |
| `icons`            | 192 and 512 px `any`, and 512 px `maskable` (§4)                |

`orientation` only takes effect on Android. Desktop and iPad ignore it.

`index.html` adds:

- `<link rel="manifest" href="/manifest.webmanifest">`
- `<link rel="icon" href="/favicon.svg" type="image/svg+xml">` and a 32 px PNG fallback. Today there is no favicon at all, so `/favicon.ico` requests get `index.html` from CloudFront's error response.
- `<link rel="apple-touch-icon" href="/apple-touch-icon.png">` (180 px).
- `<meta name="apple-mobile-web-app-title" content="Cranny">`, and `<meta name="mobile-web-app-capable" content="yes">`. iOS 26 opens home-screen sites as web apps by default; the meta tag keeps older iOS versions standalone too. The status bar stays the default style, so no content goes under the notch and `viewport-fit` doesn't change.

## 4. Icon

A **letter mark**: a bold capital **C** in the display font (Bricolage Grotesque 800), centred on a square.

- Colours: a cream `C` (`--color-ground`, `#f3efe6`) on ink (`--color-ink`, `#1d1b18`). This is my suggestion, because it stands out on light and dark home screens and matches the dark Results screen. Easy to change at review.
- The glyph is an **outline path**, not text, so it renders the same everywhere without the font (an SVG used as an icon can't load web fonts).
- `any` icons: rounded square, `C` filling about 60% of the height.
- `maskable` icon: full-bleed ink, `C` inside the central 80% safe zone, so Android's circle, squircle and teardrop masks never clip it.
- `apple-touch-icon`: full-bleed square (iOS rounds the corners itself).
- Favicon: the same mark as SVG, plus a 32 px PNG.

Files, all in `apps/web/public/` so Vite copies them to the root of the build unhashed:

| File                    | Size   | Purpose                |
| ----------------------- | ------ | ---------------------- |
| `favicon.svg`           | vector | tab icon               |
| `favicon-32.png`        | 32     | tab icon fallback      |
| `apple-touch-icon.png`  | 180    | iOS home screen        |
| `icon-192.png`          | 192    | manifest `any`         |
| `icon-512.png`          | 512    | manifest `any`, splash |
| `icon-maskable-512.png` | 512    | manifest `maskable`    |

**Generation.** One script, `pnpm --filter @cranny/web icons` (`apps/web/scripts/icons.ts`), builds every file from one definition: it reads the `C` outline from the Bricolage Grotesque font file in `@fontsource/bricolage-grotesque` with `opentype.js`, writes the SVGs, and renders the PNGs with `@resvg/resvg-js` (prebuilt binaries, no install scripts, so no change to pnpm's `allowBuilds`). Both are dev dependencies. The generated files are committed, and the script only runs when the icon changes, never in the build or deploy.

## 5. Install button (Home)

A small secondary button, **Install app**, just under the decorative board (above the stats, Play and Multiplayer), shown only when installing is possible:

| Where                                                                             | What the button does                                                                                                                                                                      |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Android: Chrome, Edge, Samsung Internet                                           | Shown once the browser fires `beforeinstallprompt`. Opens the browser's own install dialog (`prompt()`). Hidden after the player accepts it.                                              |
| Safari on iPhone and iPad (not yet installed)                                     | Always shown. Opens a dialog: "Tap **Share** (in Safari's toolbar, or its ⋯ menu), then **Add to Home Screen**", with the Share icon, and the note that the app keeps its own stats (§2). |
| Already running as the installed app                                              | Hidden (`display-mode: standalone`, or `navigator.standalone` on iOS).                                                                                                                    |
| Desktops (Chrome, Edge, Firefox, Safari), and anything else (iOS in-app browsers) | Hidden (the user's decision). On a desktop the app doesn't hold `beforeinstallprompt`, so Chrome and Edge keep their own install icon in the address bar.                                 |

- `beforeinstallprompt` can fire before React mounts, so a small module (`src/install/install.ts`) listens from `main.tsx` at startup and, on Android (`Android` in the user agent), calls `preventDefault()` to hold the event for the button, and exposes it through `useSyncExternalStore`. It also listens for `appinstalled` to hide the button.
- iOS Safari is detected from the user agent (iPhone, iPad, or a Mac with touch, since iPadOS reports itself as a Mac), excluding in-app browsers (`CriOS`, `FxiOS`, `EdgiOS` and similar), which can't add to the home screen themselves on older iOS. This is the one place the app sniffs the user agent, and it only decides whether to show a hint.
- If the player dismisses the browser's install dialog, the event can't be reused. The button hides until the browser fires a new one, as it does on a later visit.
- No "don't show again" setting: the button is quiet, and players who don't want it can ignore it.
- **Layout:** Home must still fit an iPhone SE with the button showing (on iOS Safari it always shows). The decorative board takes whatever height the rest of Home leaves, less the button's 48 px when it shows (a size container; the board is between 120 and 300 px), so it fits with any mix of stats, Multiplayer and Install app.
- The instructions dialog uses the same `<dialog>` pattern as the multiplayer leave dialog (`LeaveDialog.tsx`), with focus handling and Escape to close.

## 6. Security headers and hosting

- **CSP:** `default-src 'none'` blocks the manifest today, so the policy gains `manifest-src 'self'`. Icons are already covered by `img-src 'self'`. No other directive changes.
- **Content types:** `aws s3 sync` doesn't know `.webmanifest` and would upload it as `binary/octet-stream`. The deploy script uploads it separately as `application/manifest+json`. Everything in `public/` is outside `assets/`, so it already gets `no-cache`, which is what we want: a changed icon or manifest is picked up straight away.
- **Missing files:** CloudFront answers any missing path with `index.html` and 200, so a broken icon path would silently serve HTML. A test checks every file the manifest and `index.html` reference exists in `public/` (§7).
- **Preview:** Vite's preview server serves `.webmanifest` correctly, so `pnpm preview` is enough to test installs locally over `http://localhost`, which browsers treat as secure.
- No Terraform file changes, but CloudFront reads the CSP from `security-headers.json` through Terraform (`infra/cdn.tf`), so the new directive reaches production only after a `terraform apply`.

## 7. Testing

- **Unit:** the manifest parses and has the fields in §3; every icon it lists, and every icon `index.html` links, exists in `public/` with the size its entry claims (read from the PNG header).
- **CSP:** a test that `security-headers.json` allows `manifest-src 'self'`.
- **Install module:** holds `beforeinstallprompt`, prompts once, clears on accept, dismiss and `appinstalled`; reports standalone mode; detects iOS Safari from a table of real user-agent strings (iPhone Safari, iPad Safari as Mac with touch, CriOS, FxiOS, desktop Safari, Android Chrome).
- **Home component tests:** the button is hidden by default, appears on a fake `beforeinstallprompt`, calls `prompt()`, and hides afterwards; on an iOS user agent it opens the instructions dialog; it is hidden in standalone mode.
- **Accessibility:** `a11y.test.tsx` covers Home with the button and the open instructions dialog.
- **Real devices (by hand):** install from Chrome on Android, Chrome on desktop, and Safari on iPhone; check the icon, name, splash colour, standalone window, portrait lock on Android, and that solo and multiplayer both work in the installed app. Check the manifest in Chrome DevTools (Application → Manifest) shows no warnings.

## 8. Risks and notes

- **Chrome without a service worker.** Chrome has not required a service worker for installability since 2024, so `beforeinstallprompt` should fire with only a manifest. T1.1 confirms this on the current Chrome before the button is built; if it doesn't fire, the fallback is to show the button only on iOS and leave Chrome to its own menu (not to add a service worker, which the user ruled out).
- **iOS storage is separate** between Safari and the home-screen app (§2). Nothing to fix, but players may ask where their stats went.
- **Portrait lock** may annoy Android tablet players; it's one manifest field to drop if so.
- **User-agent sniffing** for iOS can go stale; the failure is only a missing or unnecessary hint.

## 9. Decisions log

Installable but online only, with no service worker or offline play · updates arrive silently on the next launch (automatic, since `index.html` is `no-cache`) · letter-mark icon, a capital C in the display font · an Install app button on Home, on Android and iOS only (not desktops), using the browser's dialog on Android and instructions on iOS Safari, hidden once installed · no Terraform file changes (the CSP change needs an apply).
