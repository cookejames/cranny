import { describe, expect, it } from 'vitest';
import { computeLayout, LAYOUT } from './layout.ts';

describe('computeLayout', () => {
  it.each([
    ['iPhone SE', 375, 667],
    ['design reference', 390, 844],
    ['large phone', 430, 932],
  ])('fits a %s screen (%i×%i) without scrolling', (_, width, height) => {
    const layout = computeLayout({ width, height });
    expect(layout.contentHeight).toBeLessThanOrEqual(height);
    expect(layout.board).toBeLessThanOrEqual(width - 2 * LAYOUT.gutter);
  });

  it('matches the design at 390×844: a 350 px board and 84 px tray tiles', () => {
    expect(computeLayout({ width: 390, height: 844 })).toMatchObject({ board: 350, tile: 84 });
  });

  it('is limited by height on short screens', () => {
    const { board } = computeLayout({ width: 375, height: 667 });
    expect(board).toBeLessThan(375 - 2 * LAYOUT.gutter);
    expect(board).toBeGreaterThanOrEqual(260);
  });

  it('caps the column width on desktop', () => {
    const layout = computeLayout({ width: 1440, height: 1200 });
    expect(layout.columnWidth).toBe(LAYOUT.maxColumnWidth);
    expect(layout.board).toBe(LAYOUT.maxColumnWidth - 2 * LAYOUT.gutter);
  });

  it('never shrinks the board below the minimum (the page scrolls instead)', () => {
    expect(computeLayout({ width: 740, height: 360 }).board).toBe(LAYOUT.minBoard);
  });

  it('keeps tray tiles at least 44 px tall (touch target)', () => {
    expect(computeLayout({ width: 320, height: 480 }).tile).toBeGreaterThanOrEqual(44);
  });
});
