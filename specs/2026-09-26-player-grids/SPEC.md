# Cranny Player Grids — Specification

## 1. Summary

After a multiplayer round, each row of the lobby's **round results** has a small grid icon beside the player's name. It opens a modal showing that player's grid as it was when the round ended: solved if they finished, partial if they didn't. The modal closes with a × button, with Escape, or with a click or tap outside the grid.

This amends the multiplayer spec (`specs/2026-09-25-multiplayer/SPEC.md`) in §5.1 State, §5.2 Messages, §5.3 The room reducer, §9 Room: lobby and §11 Accessibility.

Until now no boards crossed the network: `progress` carries a count (0–9) and `finished` a time. This adds one client message and two optional result fields.

### In scope

- Sending each participant's board to the host once the round is over, and keeping it in `lastResult`.
- The grid button in the round results (`Lobby.tsx`, `RoundResults`) and the grid modal.

### Out of scope

- Seeing other boards during a round. That would show a solution during the close-out, and the progress strip already shows how far each player has got.
- Grids from earlier rounds: only `lastResult` is kept.
- Solo mode.

## 2. Rules

- The room keeps the board of every **participant** (outcome `finished` or `dnf`) in the last round. Players who sat out have no board and no button.
- A board is shared only **after the round ends**. No snapshot carries a board while a round is being played.
- The board is what the player had on screen when the round ended for them. For a finisher, that is the full grid at the finish. For everyone else, it is whatever they had placed when the round closed.
- A player's own row has the button too ("Your grid").
- If a board never reaches the host, the row simply has no button. This happens when the player closed the tab mid-round and didn't come back before the next round ended, or when the host is running an older version.
- Boards are replaced with the next round's result. A player who leaves takes their board with them, because `leave` already removes their place from `lastResult`.

## 3. Protocol

### 3.1 Board encoding

```ts
/** 9 entries in `PIECE_IDS` order: `origin * 8 + orientationIndex` (0–287), or null if unplaced. */
type BoardCode = (number | null)[];
// orientationIndex = rot + (flip ? 4 : 0)
```

It is compact so that snapshots stay well under the 8 KB message limit: eight participants add about 500 bytes. The grid itself isn't part of the code. It comes from `lastResult.grid`.

`@cranny/multiplayer` gets `src/board.ts` with three functions:

- `encodeBoard(placements)` returns a `BoardCode`.
- `isBoardCode(raw)` checks the shape: length `PIECE_COUNT`, and each entry null or an integer 0–287.
- `decodeBoard(grid, code)` returns a `BoardState`. It places the pieces in `PIECE_IDS` order with the engine's `canPlace`/`place` and drops any piece that doesn't fit (out of bounds, on a blocked cell, or overlapping). A malformed or hostile board therefore still renders.

### 3.2 State (amends multiplayer §5.1)

```ts
type RoundResult = {
  number: number;
  grid?: { version: number; seed: number }; // the round's grid; absent from older hosts
  places: {
    id: PlayerId;
    ms: number | null;
    points: number;
    outcome: 'finished' | 'dnf' | 'sat-out';
    board?: BoardCode; // once the player has sent it
  }[];
};
```

### 3.3 Messages (amends multiplayer §5.2)

| From → to     | `type`  | Payload                        | Meaning                                  |
| ------------- | ------- | ------------------------------ | ---------------------------------------- |
| client → host | `board` | `round`, `board` (`BoardCode`) | My board as it was when the round ended. |

- The board has to reach `RoomClient` before the round ends. `RoomRound` calls `client.reportBoard(round, placements)` after every change to the board. This records the board locally and sends nothing.
- A client sends `board` once `lastResult` is for the round it recorded, the result gives it a `finished` or `dnf` place, and that place has no `board` yet. The existing resend check (`reconcile`, at most once a second) covers this, so a lost message is sent again. A host applies its own `board` directly when it ends the round.
- **No protocol version bump.** Both new fields are optional, and parsers copy known fields only, so an older client ignores them. An older host drops `board` as malformed, and no buttons appear. A client stops resending `board` once the next round starts.

### 3.4 The room reducer (amends multiplayer §5.3)

- `endRound` copies `round.grid` into `lastResult.grid`.
- `board` is accepted only when `lastResult.number === round`, the sender has a `finished` or `dnf` place, and that place has no board yet. Anything else is ignored, including a repeat, so `rev` doesn't change.

## 4. Screens (amends multiplayer §9 Room: lobby)

### 4.1 The grid button

- Each results row with a `board` gets an icon button after the name, and after the "You" tag on your own row. Its `lastResult.grid` version must also be in `SUPPORTED_VERSIONS`.
- The icon is an inline, stroke-only SVG in the tick's style: a 2×2 grid. It is `aria-hidden`, and the button has `aria-label="Show {name}’s grid"` ("Show your grid" on your own row).
- It uses the existing icon-button size, so the row still fits at 375 px with a long name, the You tag, the time and the points.

### 4.2 The grid modal

- It is a native modal `<dialog>` opened with `showModal()`, like the leave confirmation (`LeaveDialog.tsx`). The browser traps focus and gives it back to the grid button on close.
- Content, top to bottom:
  - A × close button at the top right (`aria-label="Close"`), which has focus when the modal opens.
  - The heading "{name}’s grid" or "Your grid".
  - A line under it: "1st · 0:42.3" for a finisher, or "Didn’t finish · 6 of 9 pieces".
  - The board, drawn by the shared `Board` component with no pointer handlers, so it can't be changed. Blocked cells are dark, placed pieces are drawn as usual, and any gaps are empty cells.
- Size: `--board-size: min(360px, 86vw, 70dvh)`, set through React's `style` prop (CSP). The dialog body sits close around the board so that "outside the grid" means the backdrop.
- It closes three ways: the × button, Escape (the dialog's `cancel` event), or a click or tap on the backdrop (a click whose target is the `<dialog>` element itself).
- It also closes if its player's place disappears: they left, or a newer result replaced it. It goes away with the lobby when the next round starts.
- The layout comes from `generateGrid(seed, version)`, computed once per result (`useMemo`).

## 5. Accessibility (amends multiplayer §11)

- The grid button has a text label naming the player.
- The modal has `aria-labelledby` pointing at its heading and `aria-describedby` pointing at the outcome line.
- The board's cells already have labels ("Row 2, column 5: Tee"), so a screen reader can read the grid.
- No new colours: the modal reuses the leave dialog's tokens, so `contrast.test.ts` has no new pairs.

## 6. Tests

- `packages/multiplayer`:
  - `board.test.ts`: round trip, an empty board, a solved board (from `solve`), and out-of-range, blocked and overlapping pieces dropped.
  - `protocol.test.ts`: the `board` message (good and bad codes), and `lastResult` with and without `grid` and `board`.
  - `room.test.ts`: `endRound` sets `grid`. `board` is accepted from a finisher and from a dnf. It is ignored from a player who sat out, a player without a seat, the wrong round, and as a repeat. `leave` removes it.
  - `client.test.ts`: the board is sent once the round ends, resent while the snapshot lacks it, and applied directly by a host.
- `apps/web`:
  - `Room.test.tsx`: after a round, participants' rows have the button and a sat-out row doesn't. Opening it shows the board's cell labels and the outcome line. It closes with ×, with Escape, and with a backdrop click.
  - `a11y.test.tsx`: axe on the lobby with the modal open.
  - A reload after finishing still reports the finished board: `initialBoard` keeps the saved placements.

## 7. Decisions

- **Boards sent after the round, not with `progress`.** Sending them with `progress` would put every board in every snapshot during play, and a finished board is a solution the others could read during the close-out. Sending after the round costs one message per player per round, and keeping the boards in `lastResult` means they survive a host handover.
- **No protocol bump.** The change is additive. A room with an older host just shows no grid buttons.
