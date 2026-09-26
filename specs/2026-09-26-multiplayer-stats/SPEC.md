# Cranny Multiplayer Stats — Specification

## 1. Summary

Home shows the player's solo stats (Best, Average, Solved) once they have solved a grid (single-player SPEC §5, §8). Multiplayer rounds don't count toward them (multiplayer SPEC §10). This feature keeps the same three stats for multiplayer, separately, and shows them on Home below the solo ones once the player has finished a multiplayer round.

### Out of scope

Placings, wins or points across rooms, per-room history, and anything kept anywhere but the device.

## 2. What counts

- A multiplayer round counts as **solved** when this tab fills the grid. Its time is the player's own stopwatch reading, the time shown in the waiting view (`finishedMs`, multiplayer SPEC §5.4).
- Rounds that were sat out, or that ended before the player filled the grid, don't count. Finishing position doesn't matter.
- A finish is recorded **once**, at the completing drop, as a solo solve is. Reloading after finishing (the saved board already has `finishedMs`) doesn't record it again.
- **Best** is the fastest finish, **Average** the mean of the last 10 finishes, **Solved** the number of finishes: the same rules and code as solo (`recordSolve`, `averageMs` in `src/game/stats.ts`).
- Multiplayer finishes still don't count toward solo stats, and solo solves don't count here.

## 3. Storage

- `cranny.multiplayerStats.v1 = { solved, bestMs | null, recentMs }` (**local** storage): the same shape and validation as `cranny.stats.v1`. Stats belong to the device, not the tab, so every tab adds to the same record.

## 4. Home

- With solo solves only, Home shows the row of tiles as before.
- Once the player has a multiplayer finish, the tiles become **one block**: Best, Average and Solved headed once, then a **Solo** row (if they have solo solves) and a **Multiplayer** row, each labelled on the left. It's a table for screen readers ("Your stats", with column and row headers).
- Why one block: two captioned rows of tiles added about 116 px, and Home scrolled on an iPhone SE (375×667) by about 50 px, or 100 px with Install app. The block adds about 30 px.
- To make room, **Install app** moves from under the board to a 44 px icon button at the end of the wordmark's line, named "Install app" (installable SPEC §5). The board no longer gives up 48 px for it.
- Measured in headless Chrome at 375×667 with both kinds of stats, Multiplayer, and Install app (iPhone user agent): no scrolling, with the board at 135 px (it was 119 px with solo stats and the old Install app button).

## 5. Tests

- Storage: load/save, invalid fields replaced individually, recent times trimmed, and the solo and multiplayer keys independent.
- Room: finishing a round records one multiplayer solve and no solo one; a reload after finishing doesn't record again; a round that ends before the player finishes records nothing.
- Home: the tiles without multiplayer stats; the block with both rows; the block with the multiplayer row alone.
- Accessibility: axe on Home with the block, and with Install app.
