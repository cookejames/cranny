/**
 * Outline paths for pieces drawn as one merged shape (SPEC.md §9).
 *
 * Units: a cell is 1×1 and cells are separated by a gap of `gap` units, so a grid of n cells spans
 * `n + (n - 1) * gap`. Within a piece the gaps between its own cells are filled in, so the piece
 * reads as one shape while gaps between different pieces stay visible.
 *
 * Method: work on a doubled lattice where even lattice indices are cells and odd ones are gaps.
 * Fill the lattice squares the piece covers (cells, gaps between adjacent cells, and the gap
 * junction where four cells meet), cancel edges shared by two filled squares, and chain the
 * remaining edges into a loop. Pieces are orthogonally connected with no holes, so there is
 * exactly one loop.
 */

type Point = readonly [x: number, y: number];

/** Position of lattice line `line` in piece units: even lines start a cell, odd lines end one. */
const linePosition = (line: number, gap: number) => Math.floor(line / 2) * (1 + gap) + (line % 2);

/** Rounds to 3 decimal places for compact, stable path strings. */
const fmt = (n: number) => String(Math.round(n * 1000) / 1000);

/**
 * The corner points of the merged outline of `cells`, clockwise, with collinear points removed.
 *
 * @param cells - The piece's cells as `[row, col]`, orthogonally connected.
 * @param gap - Gap between cells, in cell units.
 */
export function outlinePoints(
  cells: ReadonlyArray<readonly [number, number]>,
  gap: number,
): Point[] {
  const has = new Set(cells.map(([r, c]) => `${r},${c}`));
  const filled: Array<[number, number]> = [];
  for (const [r, c] of cells) {
    filled.push([2 * r, 2 * c]);
    const right = has.has(`${r},${c + 1}`);
    const down = has.has(`${r + 1},${c}`);
    if (right) filled.push([2 * r, 2 * c + 1]);
    if (down) filled.push([2 * r + 1, 2 * c]);
    if (right && down && has.has(`${r + 1},${c + 1}`)) filled.push([2 * r + 1, 2 * c + 1]);
  }

  // Directed clockwise edges between lattice points (row line, col line). An edge shared by two
  // filled squares appears once in each direction, so the pair cancels. A point can start several
  // edges until they cancel, so collect edges as a set before chaining them.
  const edgeSet = new Set<string>();
  /** Adds a directed edge, or cancels it against its reverse if that is already present. */
  const addEdge = (from: string, to: string) => {
    const reverse = `${to}>${from}`;
    if (edgeSet.has(reverse)) edgeSet.delete(reverse);
    else edgeSet.add(`${from}>${to}`);
  };
  for (const [i, j] of filled) {
    const tl = `${i},${j}`;
    const tr = `${i},${j + 1}`;
    const br = `${i + 1},${j + 1}`;
    const bl = `${i + 1},${j}`;
    addEdge(tl, tr);
    addEdge(tr, br);
    addEdge(br, bl);
    addEdge(bl, tl);
  }

  // Only boundary edges remain; with no holes or pinch points, each point starts exactly one.
  const edges = new Map<string, string>();
  for (const edge of edgeSet) {
    const [from, to] = edge.split('>') as [string, string];
    edges.set(from, to);
  }

  // Walk the loop from its top-left-most point so the output is deterministic.
  const start = [...edges.keys()].sort((a, b) => {
    const [ai, aj] = a.split(',').map(Number) as [number, number];
    const [bi, bj] = b.split(',').map(Number) as [number, number];
    return ai - bi || aj - bj;
  })[0];
  if (start === undefined) return [];
  const loop: Array<[number, number]> = [];
  let at = start;
  do {
    loop.push(at.split(',').map(Number) as [number, number]);
    const next = edges.get(at);
    // Only reachable if the cells aren't orthogonally connected; fail loudly rather than hang.
    if (next === undefined || loop.length > edges.size) {
      throw new Error('outlinePoints: cells do not form a single connected shape');
    }
    at = next;
  } while (at !== start);

  // Drop points in the middle of straight runs, then convert to piece units (x = col, y = row).
  const corners = loop.filter((point, k) => {
    const prev = loop[(k + loop.length - 1) % loop.length]!;
    const next = loop[(k + 1) % loop.length]!;
    const straight =
      (prev[0] === point[0] && point[0] === next[0]) ||
      (prev[1] === point[1] && point[1] === next[1]);
    return !straight;
  });
  return corners.map(([i, j]) => [linePosition(j, gap), linePosition(i, gap)] as const);
}

/**
 * An SVG path `d` for the merged outline of `cells`, with corners rounded to `radius` (clamped to
 * half of each adjoining side so short sides stay straight-edged rather than overlapping).
 *
 * @param cells - The piece's cells as `[row, col]`, orthogonally connected.
 * @param gap - Gap between cells, in cell units.
 * @param radius - Corner radius, in cell units.
 */
export function outlinePath(
  cells: ReadonlyArray<readonly [number, number]>,
  gap: number,
  radius = 0,
): string {
  const points = outlinePoints(cells, gap);
  if (points.length === 0) return '';
  const n = points.length;
  /** The corner at index `k`, wrapping around the loop. */
  const at = (k: number) => points[(k + n) % n]!;

  /** Where the rounded corner at point `k` starts (`a`) and ends (`b`). */
  const corner = (k: number) => {
    const [px, py] = at(k - 1);
    const [cx, cy] = at(k);
    const [nx, ny] = at(k + 1);
    const inLen = Math.hypot(cx - px, cy - py);
    const outLen = Math.hypot(nx - cx, ny - cy);
    const r = Math.min(radius, inLen / 2, outLen / 2);
    const a: Point = [cx - ((cx - px) / inLen) * r, cy - ((cy - py) / inLen) * r];
    const b: Point = [cx + ((nx - cx) / outLen) * r, cy + ((ny - cy) / outLen) * r];
    return { a, c: [cx, cy] as Point, b };
  };

  const first = corner(0);
  let d = `M${fmt(first.b[0])} ${fmt(first.b[1])}`;
  for (let k = 1; k <= n; k++) {
    const { a, c, b } = corner(k);
    d += `L${fmt(a[0])} ${fmt(a[1])}`;
    if (radius > 0) d += `Q${fmt(c[0])} ${fmt(c[1])} ${fmt(b[0])} ${fmt(b[1])}`;
  }
  return `${d}Z`;
}

/** Size in piece units of a span of `count` cells: `count` cells plus the gaps between them. */
export const spanOf = (count: number, gap: number) => count + (count - 1) * gap;
