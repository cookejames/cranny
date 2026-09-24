import {
  BOARD_SIZE,
  cellAt,
  isPieceId,
  shapeOf,
  type BoardState,
  type Cell,
  type Orientation,
  type PieceId,
  type Placement,
} from '@tessel/engine';

/** Every orientation, in the engine's order. */
const ORIENTATIONS: Orientation[] = [false, true].flatMap((flip) =>
  ([0, 1, 2, 3] as const).map((rot) => ({ rot, flip })),
);

/**
 * Builds a board from a text layout: one string per row, cells separated by spaces, each a
 * piece id or `X` for a blocked square. Each piece's placement is found by matching its cells
 * against its orientations.
 *
 * @throws Error if a row is the wrong length, a cell is unknown, or a piece's cells aren't one of
 *   its shapes.
 */
export function boardFromRows(rows: readonly string[]): BoardState {
  const blocked: Cell[] = [];
  const cellsOf = new Map<PieceId, Array<[number, number]>>();
  rows.forEach((line, row) => {
    const keys = line.trim().split(/\s+/);
    if (rows.length !== BOARD_SIZE || keys.length !== BOARD_SIZE) {
      throw new Error(`Expected a ${BOARD_SIZE}×${BOARD_SIZE} layout`);
    }
    keys.forEach((key, col) => {
      if (key === 'X') blocked.push(cellAt(row, col));
      else if (isPieceId(key)) cellsOf.set(key, [...(cellsOf.get(key) ?? []), [row, col]]);
      else throw new Error(`Unknown cell "${key}"`);
    });
  });

  const placements: Partial<Record<PieceId, Placement>> = {};
  for (const [piece, cells] of cellsOf) {
    const top = Math.min(...cells.map(([r]) => r));
    const left = Math.min(...cells.map(([, c]) => c));
    const key = cells.map(([r, c]) => `${r - top},${c - left}`).join(' ');
    const orientation = ORIENTATIONS.find(
      (o) =>
        shapeOf(piece, o)
          .map(([r, c]) => `${r},${c}`)
          .join(' ') === key,
    );
    if (!orientation) throw new Error(`${piece} cells are not one of its shapes`);
    placements[piece] = { orientation, origin: cellAt(top, left) };
  }
  return { grid: { version: 1, seed: 0, blocked }, placements };
}

/** The solved board shown on Home, as in the design (`design/Home.dc.html`). */
export const SHOWCASE_BOARD = boardFromRows([
  'D2 V3 V3 X  O4 O4',
  'D2 V3 X  T4 O4 O4',
  'M1 X  L4 T4 T4 I4',
  'X  X  L4 T4 S4 I4',
  'X  L4 L4 S4 S4 I4',
  'I3 I3 I3 S4 X  I4',
]);
