import { PIECE_IDS, shapeOf } from '@tessel/engine';
import { describe, expect, it } from 'vitest';
import { outlinePath, outlinePoints, spanOf } from './outline.ts';

const flat = { rot: 0, flip: false } as const;

describe('outlinePoints', () => {
  it('outlines a single cell as a unit square, clockwise from the top left', () => {
    expect(outlinePoints([[0, 0]], 0.1)).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ]);
  });

  it('bridges the gap between adjacent cells of the same piece', () => {
    // Domino: two cells and the gap between them make one 2.1 × 1 rectangle.
    expect(outlinePoints(shapeOf('D2', flat), 0.1)).toEqual([
      [0, 0],
      [2.1, 0],
      [2.1, 1],
      [0, 1],
    ]);
  });

  it('fills the gap junction inside a 2×2 block', () => {
    // O4 is a plain square with no notch in the middle.
    expect(outlinePoints(shapeOf('O4', flat), 0.1)).toHaveLength(4);
  });

  it.each([
    ['I4', 4],
    ['I3', 4],
    ['D2', 4],
    ['M1', 4],
    ['O4', 4],
    ['V3', 6],
    ['L4', 6],
    ['T4', 8],
    ['S4', 8],
  ] as const)('gives %s %i corners in every orientation', (id, corners) => {
    for (const rot of [0, 1, 2, 3] as const) {
      for (const flip of [false, true]) {
        expect(outlinePoints(shapeOf(id, { rot, flip }), 0.1)).toHaveLength(corners);
      }
    }
  });

  it("offsets board cells by the piece's position", () => {
    // A single cell at row 2, column 3 with gap 0.1.
    const [x, y] = outlinePoints([[2, 3]], 0.1)[0]!;
    expect(x).toBeCloseTo(3.3);
    expect(y).toBeCloseTo(2.2);
  });

  it('traces a closed clockwise loop enclosing the cells plus their bridged gaps', () => {
    const gap = 0.1;
    for (const id of PIECE_IDS) {
      for (const rot of [0, 1, 2, 3] as const) {
        for (const flip of [false, true]) {
          const shape = shapeOf(id, { rot, flip });
          const points = outlinePoints(shape, gap);
          // Shoelace sum: positive for clockwise in screen coordinates (y points down).
          const twiceArea = points.reduce((sum, [x1, y1], k) => {
            const [x2, y2] = points[(k + 1) % points.length]!;
            return sum + (x1 * y2 - x2 * y1);
          }, 0);
          const has = new Set(shape.map(([r, c]) => `${r},${c}`));
          const bridges =
            shape.filter(([r, c]) => has.has(`${r},${c + 1}`)).length +
            shape.filter(([r, c]) => has.has(`${r + 1},${c}`)).length;
          const junctions = shape.filter(
            ([r, c]) =>
              has.has(`${r},${c + 1}`) && has.has(`${r + 1},${c}`) && has.has(`${r + 1},${c + 1}`),
          ).length;
          expect(twiceArea / 2).toBeCloseTo(shape.length + bridges * gap + junctions * gap * gap);
          // Every side is horizontal or vertical.
          points.forEach(([x1, y1], k) => {
            const [x2, y2] = points[(k + 1) % points.length]!;
            expect(x1 === x2 || y1 === y2).toBe(true);
          });
        }
      }
    }
  });

  it('fits exactly inside the bounding box of its cells', () => {
    for (const id of PIECE_IDS) {
      const shape = shapeOf(id, flat);
      const points = outlinePoints(shape, 0.1);
      const cols = Math.max(...shape.map(([, c]) => c)) + 1;
      const rows = Math.max(...shape.map(([r]) => r)) + 1;
      expect(Math.max(...points.map(([x]) => x))).toBeCloseTo(spanOf(cols, 0.1));
      expect(Math.max(...points.map(([, y]) => y))).toBeCloseTo(spanOf(rows, 0.1));
      expect(Math.min(...points.flat())).toBe(0);
    }
  });
});

describe('outlinePath', () => {
  it('draws straight corners with radius 0', () => {
    expect(outlinePath([[0, 0]], 0.1)).toBe('M0 0L1 0L1 1L0 1L0 0Z');
  });

  it('rounds each corner with a quadratic curve', () => {
    const d = outlinePath(shapeOf('T4', flat), 0.1, 0.15);
    expect(d.match(/Q/g)).toHaveLength(8);
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
  });

  it('never rounds more than half of a short side', () => {
    // The single cell's sides are 1 long, so a huge radius is clamped to 0.5 (a circle-ish shape).
    expect(outlinePath([[0, 0]], 0.1, 10)).toBe(
      'M0.5 0L0.5 0Q1 0 1 0.5L1 0.5Q1 1 0.5 1L0.5 1Q0 1 0 0.5L0 0.5Q0 0 0.5 0Z',
    );
  });

  it('returns an empty path for no cells', () => {
    expect(outlinePath([], 0.1)).toBe('');
  });
});
