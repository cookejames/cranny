import { generateGrid, isSolved, PIECE_IDS, solve, type Placement } from '@cranny/engine';
import { describe, expect, it } from 'vitest';
import { decodeBoard, encodeBoard, isBoardCode } from './board.ts';

const grid = generateGrid(12345, 1);
const solution = solve(grid.blocked)!;

describe('encodeBoard and decodeBoard', () => {
  it('round-trips a solved board', () => {
    const code = encodeBoard(solution);
    expect(isBoardCode(code)).toBe(true);
    const board = decodeBoard(grid, code);
    expect(board.placements).toEqual(solution);
    expect(isSolved(board)).toBe(true);
  });

  it('round-trips a partial board, with nulls for unplaced pieces', () => {
    const partial = { I4: solution.I4, M1: solution.M1 };
    const code = encodeBoard(partial);
    expect(code.filter((v) => v !== null)).toHaveLength(2);
    expect(decodeBoard(grid, code).placements).toEqual(partial);
  });

  it('encodes an empty board as all nulls', () => {
    const code = encodeBoard({});
    expect(code).toEqual(PIECE_IDS.map(() => null));
    expect(decodeBoard(grid, code).placements).toEqual({});
  });

  it('keeps every orientation apart', () => {
    const codes = new Set<number | null>();
    for (const flip of [false, true]) {
      for (const rot of [0, 1, 2, 3] as const) {
        const placement: Placement = { origin: 0, orientation: { rot, flip } };
        codes.add(encodeBoard({ M1: placement })[PIECE_IDS.indexOf('M1')]!);
      }
    }
    expect(codes.size).toBe(8);
  });

  it('drops pieces that overlap, sit on blocked cells or go off the board', () => {
    const code = encodeBoard(solution);
    const first = PIECE_IDS.indexOf('I4');
    const second = PIECE_IDS.indexOf('O4');
    // O4 on top of I4.
    code[second] = code[first]!;
    const board = decodeBoard(grid, code);
    expect(board.placements.I4).toEqual(solution.I4);
    expect(board.placements.O4).toBeUndefined();

    const blocked = encodeBoard({
      M1: { origin: grid.blocked[0]!, orientation: { rot: 0, flip: false } },
    });
    expect(decodeBoard(grid, blocked).placements).toEqual({});

    // A bar whose top-left corner is the bottom-right cell runs off the board either way up.
    for (const rot of [0, 1] as const) {
      const off = encodeBoard({ I4: { origin: 35, orientation: { rot, flip: false } } });
      expect(decodeBoard({ ...grid, blocked: [] }, off).placements).toEqual({});
    }
  });
});

describe('isBoardCode', () => {
  it.each([
    ['too short', [null]],
    ['not an array', { 0: null }],
    ['a fraction', [1.5, ...PIECE_IDS.slice(1).map(() => null)]],
    ['negative', [-1, ...PIECE_IDS.slice(1).map(() => null)]],
    ['too big', [288, ...PIECE_IDS.slice(1).map(() => null)]],
    ['a string', ['1', ...PIECE_IDS.slice(1).map(() => null)]],
  ])('rejects %s', (_, raw) => {
    expect(isBoardCode(raw)).toBe(false);
  });

  it('accepts the largest value', () => {
    expect(isBoardCode([287, ...PIECE_IDS.slice(1).map(() => null)])).toBe(true);
  });
});
