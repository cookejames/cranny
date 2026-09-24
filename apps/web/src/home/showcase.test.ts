import { isSolved } from '@tessel/engine';
import { describe, expect, it } from 'vitest';
import { boardFromRows, SHOWCASE_BOARD } from './showcase.ts';

describe('SHOWCASE_BOARD', () => {
  it('is a real solved grid', () => {
    expect(isSolved(SHOWCASE_BOARD)).toBe(true);
    expect(SHOWCASE_BOARD.grid.blocked).toEqual([3, 8, 13, 18, 19, 24, 34]);
  });
});

describe('boardFromRows', () => {
  const rows = [...Array(6)].map(() => 'X X X X X X');

  it('rejects a layout of the wrong size or with unknown cells', () => {
    expect(() => boardFromRows(rows.slice(1))).toThrow(/6×6/);
    expect(() => boardFromRows(['X X X X X Q', ...rows.slice(1)])).toThrow(/Unknown cell "Q"/);
  });

  it('rejects cells that are not one of the piece’s shapes', () => {
    expect(() => boardFromRows(['D2 X D2 X X X', ...rows.slice(1)])).toThrow(/D2/);
  });
});
