# Cranny Search and Sharing — Tasks

- [x] **T1 Crawler files** (§2). `robots.txt` and `sitemap.xml` in `public/`.
- [x] **T2 Head tags** (§3). Title, description (manifest too), canonical, Open Graph/Twitter, JSON-LD; `usePageMeta`.
- [x] **T3 How to play** (§4). Route, page, Home link, `how_to_play_opened`.
- [x] **T4 Static intro** (§5). `.prerender` in `index.html` and `global.css`.
- [x] **T5 Images** (§6). New board icon in every size, and `og-image.png`, from `scripts/icons.ts`.
- [x] **T6 Tests** (§7). `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test` pass.
      _Result:_ under `pnpm preview`, robots.txt is `text/plain` and sitemap.xml `text/xml`, with no console errors on `/` or `/how-to-play`. At 375×667 (DevTools emulation), Home is 667 px tall with and without both stats rows. With both, the link first overflowed by 5 px, fixed by the -6 px margin. The intro renders styled with scripts disabled.
- [ ] **T7 Deploy and submit** (§8). Deploy, then do the Search Console and Bing steps and the post-deploy checks.
