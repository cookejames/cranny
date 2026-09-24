import { cellAt, colOf, isValidBlocked, rowOf, uniqueOrientations } from './geometry.ts';
import { BOARD_SIZE, CELL_COUNT, PIECE_IDS, PIECES } from './pieces.ts';
import type { Cell, Orientation, PieceId, Placement } from './types.ts';

type Candidate = {
  orientation: Orientation;
  /** Cell offsets relative to the shape's first (row-major) cell. */
  offsets: ReadonlyArray<readonly [number, number]>;
  /** Offset from the anchor cell back to the bounding-box origin. */
  originOffset: readonly [number, number];
};

const CANDIDATES: ReadonlyArray<readonly Candidate[]> = PIECE_IDS.map((id) =>
  uniqueOrientations(id).map(({ orientation, shape }) => {
    const [ar, ac] = shape[0]!;
    return {
      orientation,
      offsets: shape.map(([r, c]) => [r - ar, c - ac] as const),
      originOffset: [-ar, -ac] as const,
    };
  }),
);

/** Total squares of each subset of pieces, indexed by a bitmask over `PIECE_IDS`. */
const SUBSET_SQUARES = Array.from({ length: 2 ** PIECE_IDS.length }, (_, mask) =>
  PIECE_IDS.reduce((sum, id, p) => (mask & (1 << p) ? sum + PIECES[id].cells.length : sum), 0),
);
const POW2 = Array.from({ length: CELL_COUNT }, (_, i) => 2 ** i);
/** Orthogonally adjacent cells of each cell. */
const NEIGHBOURS: ReadonlyArray<readonly Cell[]> = Array.from({ length: CELL_COUNT }, (_, cell) => {
  const r = rowOf(cell);
  const c = colOf(cell);
  const out: Cell[] = [];
  if (r > 0) out.push(cell - BOARD_SIZE);
  if (r < BOARD_SIZE - 1) out.push(cell + BOARD_SIZE);
  if (c > 0) out.push(cell - 1);
  if (c < BOARD_SIZE - 1) out.push(cell + 1);
  return out;
});
const stack = new Int8Array(CELL_COUNT);
const seen = new Uint8Array(CELL_COUNT);
const regionSizes: number[] = [];

/** Whether the regions can be given disjoint subsets of `available` pieces with matching sizes. */
function assignRegions(sizes: readonly number[], index: number, available: number): boolean {
  if (index === sizes.length) return true;
  for (let sub = available; sub > 0; sub = (sub - 1) & available) {
    if (SUBSET_SQUARES[sub] === sizes[index] && assignRegions(sizes, index + 1, available ^ sub)) {
      return true;
    }
  }
  return false;
}

/**
 * Pruning only (it never changes which solution is found): the connected regions of empty cells
 * must be coverable by disjoint subsets of the unused pieces, going by square counts alone.
 */
function regionsFillable(filled: Uint8Array, usedBits: number): boolean {
  const sizes = regionSizes;
  sizes.length = 0;
  seen.set(filled);
  for (let start = 0; start < CELL_COUNT; start++) {
    if (seen[start]) continue;
    let size = 0;
    let top = 0;
    seen[start] = 1;
    stack[top++] = start;
    while (top > 0) {
      const cell = stack[--top]!;
      size++;
      for (const next of NEIGHBOURS[cell]!) {
        if (!seen[next]) {
          seen[next] = 1;
          stack[top++] = next;
        }
      }
    }
    sizes.push(size);
  }
  // Smallest regions first: they have the fewest matching subsets, so failures show up early.
  sizes.sort((a, b) => a - b);
  return assignRegions(sizes, 0, (2 ** PIECE_IDS.length - 1) ^ usedBits);
}

/**
 * Finds a solution for a set of blocked cells, or null if none exists.
 *
 * Deterministic and exhaustive (no node cap): repeatedly take the first empty cell in row-major
 * order and try each unused piece (in `PIECE_IDS` order) and each unique orientation with the
 * shape's first cell anchored there. Every tiling covers that cell with some piece's first cell,
 * so this is complete. Part of generator v1: changing the result for any input needs a new version.
 *
 * Returns null for invalid input (anything other than 7 distinct integer cells in 0..35).
 */
export function solve(blocked: readonly Cell[]): Record<PieceId, Placement> | null {
  if (!isValidBlocked(blocked)) return null;
  const filled = new Uint8Array(CELL_COUNT);
  for (const cell of blocked) filled[cell] = 1;
  const used = new Uint8Array(PIECE_IDS.length);
  const chosen: Array<{ piece: number; candidate: Candidate; anchor: Cell } | undefined> = [];
  // Positions (filled cells + used pieces) already shown to have no solution. Different placement
  // orders reach the same position, so this skips repeated dead ends without changing the result.
  const deadEnds = new Set<number>();
  // Filled cells as a 36-bit number and used pieces as 9 more bits: 45 bits, exact in a double.
  let filledBits = 0;
  let usedBits = 0;
  for (const cell of blocked) filledBits += POW2[cell]!;
  const cells = new Int8Array(4);

  /**
   * Fills the board from the first empty cell at or after `from`. On success `chosen[0..8]` holds
   * the placements; on failure all state is restored.
   *
   * @param depth - Number of pieces placed so far.
   */
  const search = (from: Cell, depth: number): boolean => {
    let empty = from;
    while (empty < CELL_COUNT && filled[empty]) empty++;
    if (empty === CELL_COUNT) return depth === PIECE_IDS.length;
    const position = usedBits * 2 ** CELL_COUNT + filledBits;
    if (deadEnds.has(position)) return false;
    if (!regionsFillable(filled, usedBits)) {
      deadEnds.add(position);
      return false;
    }
    const er = rowOf(empty);
    const ec = colOf(empty);

    for (let p = 0; p < PIECE_IDS.length; p++) {
      if (used[p]) continue;
      for (const candidate of CANDIDATES[p]!) {
        const { offsets } = candidate;
        let n = 0;
        for (; n < offsets.length; n++) {
          const r = er + offsets[n]![0];
          const c = ec + offsets[n]![1];
          if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE || filled[cellAt(r, c)]) break;
          cells[n] = cellAt(r, c);
        }
        if (n < offsets.length) continue;
        // Copy: `cells` is reused by deeper calls.
        const placed = cells.slice(0, n);
        let cellBits = 0;
        for (const cell of placed) {
          filled[cell] = 1;
          cellBits += POW2[cell]!;
        }
        used[p] = 1;
        filledBits += cellBits;
        usedBits += 1 << p;
        chosen[depth] = { piece: p, candidate, anchor: empty };
        if (search(empty + 1, depth + 1)) return true;
        for (const cell of placed) filled[cell] = 0;
        used[p] = 0;
        filledBits -= cellBits;
        usedBits -= 1 << p;
      }
    }
    deadEnds.add(position);
    return false;
  };

  if (!search(0, 0)) return null;

  const solution = {} as Record<PieceId, Placement>;
  for (const step of chosen) {
    if (!step) continue;
    const [or, oc] = step.candidate.originOffset;
    solution[PIECE_IDS[step.piece]!] = {
      orientation: step.candidate.orientation,
      origin: cellAt(rowOf(step.anchor) + or, colOf(step.anchor) + oc),
    };
  }
  return solution;
}
