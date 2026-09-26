# Cranny Disconnected Marker — Specification

## 1. Summary

In the multiplayer lobby's player list, a seat whose player has disconnected (closed the tab, or lost their connection) shows a **disconnected icon** in place of the ready mark, and its label reads **"disconnected"** instead of "away". Before this, a disconnected seat had the same empty circle as a connected player who wasn't ready yet, so the two looked alike at a glance.

This amends the multiplayer spec (`specs/2026-09-25-multiplayer/SPEC.md`), §9 Room: lobby and §11 Accessibility. Nothing changes in the protocol, the room reducer or `RoomClient`: the lobby already knows who is present (`RoomState.present`), and the reducer already drops a player who goes away from `round.ready`, so a seat is never both ready and disconnected.

### In scope

- The ready mark and the label on each row of the lobby's player list (`Lobby.tsx`, `PlayerList`).

### Out of scope

- The progress strip during a round, and the round results.
- This tab's own connection state, which the connection banner already shows (multiplayer SPEC §9 Connection states).

## 2. The ready mark

Each row's mark is a 24 px circle on the left, in one of three states:

| State        | When                          | Looks like                                           | Text equivalent                  |
| ------------ | ----------------------------- | ---------------------------------------------------- | -------------------------------- |
| Not ready    | present, not in `round.ready` | empty circle, `--color-line` border                  | "Not ready" (visually hidden)    |
| Ready        | present, in `round.ready`     | filled `--piece-s4` circle with a tick               | "Ready" (visually hidden)        |
| Disconnected | not in `RoomState.present`    | dashed `--color-muted` circle with an unplugged icon | the visible "disconnected" label |

The icon is an inline, stroke-only SVG in the tick's style (`aria-hidden`): a broken link, two halves with a gap and a slash through it. The row's name stays muted, as it was for "away".

## 3. The label

The small uppercase label at the end of a disconnected seat's row reads "disconnected" (it was "away"). It is the text equivalent of the icon, so the mark itself has no hidden text for that row, and screen readers hear "disconnected" once.

## 4. Tests

- `Room.test.tsx`: a player who disconnects shows "disconnected" and loses their "Not ready" text; a player who was ready and then disconnects loses the tick.
- `a11y.test.tsx`: axe on a lobby with a disconnected seat.
- No new colour pairs: `--color-muted` on the background is already in `contrast.test.ts`.
