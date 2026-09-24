# Cranny design

The game was called Tessel when this was designed; the canvas and these files still use that name.

Snapshot of the Tessel design canvas: https://claude.ai/artifact/8pro3gGQWsqro4nYQyjXVz

| File | Screen |
| --- | --- |
| `Home.dc.html` | Home / mode select |
| `Main.dc.html` | Beat the clock (playable prototype) |
| `Complete.dc.html` | Round complete |
| `Race.dc.html` | Race (multiplayer) |
| `canvas.json` | Canvas layout, board sizes and notes |

These are Design Component files. They render inside the canvas, not when opened directly in a browser. The canvas is the source of truth; re-copy these files after changing it there.
