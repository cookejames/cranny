# Cranny Search and Sharing — Specification

## 1. Summary

Searches for "cranny game" or "cranny puzzle game" don't find the site. "Cranny" is an ordinary word, the page title was just "Cranny", there was no robots.txt or sitemap, and the page had almost no text before its scripts ran. This feature gives search engines and link previews something to work with: crawler files, head tags that say what the game is, a How to play page, a static intro in `index.html`, a social preview card and structured data. It also replaces the letter-mark icon with a colourful one.

### In scope

- `robots.txt` and `sitemap.xml` (§2).
- Title, description, canonical link, Open Graph/Twitter tags and JSON-LD in `index.html` (§3).
- A per-page title and canonical link (§3).
- A How to play page at `/how-to-play`, linked from Home (§4).
- A static intro inside `#root` (§5).
- A generated social preview image and a new app icon (§6).

### Out of scope

Server-side rendering or prerendering routes, a dedicated domain, Search Console verification (done by hand), and backlinks.

## 2. Crawler files (`apps/web/public/`)

- **Problem:** CloudFront answers every missing path with `index.html` and a 200 (`infra/cdn.tf`), so `/robots.txt` and `/sitemap.xml` used to return HTML.
- **`robots.txt`:** allows everything except `/api/` (rooms API) and `/relay/` (analytics), and names the sitemap.
- **`sitemap.xml`:** lists `/` and `/how-to-play`.
- **Upload:** `deploy.sh` uploads both with the other `public/` files, with `no-cache`. The AWS CLI sends them as `text/plain` and `application/xml`.

## 3. Head tags

- **Title:** `Cranny – a quick block puzzle game`. The description, which the manifest repeats, calls Cranny a free block puzzle game and names both modes.
- **Canonical link and `og:url`:** both point at Home. Pages that don't set their own keep that, so the endless `/g/<code>` and `/m/<room>` links count towards Home rather than as thin duplicates. `usePageMeta` (`src/seo/pageMeta.ts`) gives a page its own title and canonical URL while it's mounted. Only How to play uses it.
- **Open Graph and Twitter:**
  - `og:image` is `/og-image.png` at 1200×630, as an absolute URL.
  - `twitter:card` is `summary_large_image`.
  - These matter most for shared grid and room links.
- **JSON-LD:** a schema.org `VideoGame`, with true facts only: no ratings or reviews. It's an inline `<script type="application/ld+json">`. That's a data block that browsers never run, so the CSP's `script-src 'self'` doesn't block it or report it. It's the one inline `<script>` the app has.
- **The address:** `https://playcranny.com` is written out in `index.html`, `robots.txt`, `sitemap.xml` and `SITE_ORIGIN`. `src/seo.test.ts` checks they agree. If `domain_name` in `infra/variables.tf` changes, change all of them.

## 4. How to play (`/how-to-play`)

- **Content:** the rules, the nine pieces drawn with `PieceShape`, the controls, and the ways to play. Multiplayer appears only in builds that have it.
- **Links:** a Play a grid link and a back link to Home.
- **On Home:** a small "How to play" text link sits under Play and Multiplayer. It's 6 px closer to them than they are to each other, so Home with both stats rows still fits 375×667.
- **Analytics:** clicking the Home link sends `how_to_play_opened`.

## 5. Static intro (`index.html`)

- **What it is:** `<main class="prerender">` inside `#root`, with the wordmark, a paragraph about the game and links to Play and How to play. `createRoot().render` replaces it.
- **Who sees it:** crawlers and link unfurlers that don't run scripts, and players for the moment before the app starts.
- **Styling:** from `global.css`, which Vite links in the head and so blocks rendering. The intro is never shown unstyled.
- **Content rule:** it says the same as How to play. Text that differs from what players see would count as cloaking.

## 6. Images (`scripts/icons.ts`)

`pnpm --filter @cranny/web icons` generates every image from the design tokens. Don't edit the output by hand.

- **App icon:** this replaces the cream-on-ink C in specs/2026-09-25-installable/SPEC.md §4 with a solved 3×3 board.
  - Layout: a green Corner, a yellow Domino and a red Bar around one blocked square with its peg.
  - The board sits on a board-frame tile. Pieces are drawn as merged outlines (`outline.ts`) at the game's cell gap and corner radius (`metrics.ts`).
  - Favicons get a wider gap (0.16 of a cell), so the pieces stay apart at 16–32 px.
  - The maskable icon keeps the board inside the central 80% circle.
- **Social preview (`og-image.png`):** Home's solved showcase board beside the wordmark and tagline, on the cream ground.
  - Text is drawn as outlines from the Bricolage and Instrument Sans WOFFs, laid out glyph by glyph: opentype.js's whole-string layout throws on Bricolage's substitution tables.

## 7. Testing

- **`src/seo.test.ts`:**
  - robots.txt rules and its sitemap line.
  - Sitemap URLs.
  - Title and description.
  - The canonical link and `og:url`.
  - The og image's size against its tags.
  - The JSON-LD.
  - The static intro's links.
- **`src/seo/pageMeta.test.tsx`:** sets the tags while mounted and puts them back on unmount.
- **`src/routes/HowToPlayPage.test.tsx`:** content, the multiplayer condition, the tab title and the link from Home.
- **Elsewhere:**
  - `a11y.test.tsx` covers How to play.
  - `manifest.test.ts` still checks the icon sizes. Its `public/` glob skips `.txt` and `.xml`, because Vite can't inline them.
- **By hand, under `pnpm preview`:**
  - Both crawler files are served as text.
  - No CSP errors.
  - The canonical link changes per page.
  - At 375×667 (DevTools emulation), Home fits with and without both stats rows, and the intro is styled with scripts off.

## 8. After deploying

- Verify the domain in Google Search Console and Bing Webmaster Tools, submit the sitemap, and request indexing of `/`.
- Check `/` and `/how-to-play` with Google's Rich Results Test and URL Inspection, and the card with a link-preview debugger.
