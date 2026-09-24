import { BOARD_SIZE, generateGrid } from '@tessel/engine';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOARD_SPAN, CELL_GAP } from '../board/metrics.ts';
import { RETURN_MS, SETTLE_MS } from '../drag/useDrag.ts';
import { PlayScreen } from './PlayScreen.tsx';

/**
 * Drag and drop through the real play screen. jsdom has no layout, so element boxes are mocked:
 * the board's cells sit at the viewport origin with 40 px cells, and every tray preview sits at
 * `TRAY_TOP` with 11 px cells (as in the design).
 */

const CELL = 40;
const PITCH = CELL * (1 + CELL_GAP);
const TRAY_TOP = 400;
const TRAY_CELL = 11;

const blocked = new Set(generateGrid(42, 1).blocked);
const free = Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, cell) => cell).filter(
  (cell) => !blocked.has(cell) && cell >= 2 * BOARD_SIZE,
);
/** A cell index as `[row, col]`. */
const at = (cell: number) => [Math.floor(cell / BOARD_SIZE), cell % BOARD_SIZE] as const;
const [freeA, freeB] = [at(free[0]!), at(free[1]!)];
const blockedCell = at([...blocked][0]!);

/** A DOMRect-like box. */
const box = (left: number, top: number, width: number) =>
  ({
    left,
    top,
    width,
    height: width,
    right: left + width,
    bottom: top + width,
    x: left,
    y: top,
  }) as DOMRect;

/** The centre of a board cell, in client pixels. */
const centre = ([row, col]: readonly [number, number]) => ({
  x: col * PITCH + CELL / 2,
  y: row * PITCH + CELL / 2,
});

/** A board cell's accessible name, e.g. "Row 3, column 2: Single". */
const cellName = ([row, col]: readonly [number, number], what: string) =>
  `Row ${row + 1}, column ${col + 1}: ${what}`;

/** Renders the play screen for seed 42. */
function renderPlay(startSolved = false) {
  return render(
    <MemoryRouter>
      <PlayScreen version={1} seed={42} code="100001A" shared={false} startSolved={startSolved} />
    </MemoryRouter>,
  );
}

type PointerType = 'mouse' | 'touch';

/** Pointer event fields for the drag's pointer, with optional overrides. */
const pointer = (
  { x, y }: { x: number; y: number },
  pointerType: PointerType = 'mouse',
  overrides: { pointerId?: number; isPrimary?: boolean; button?: number } = {},
) => ({
  pointerId: 1,
  pointerType,
  isPrimary: true,
  button: 0,
  clientX: x,
  clientY: y,
  ...overrides,
});

/** The Single's tray tile. */
const single = () => screen.getByRole('button', { name: /^Single/ });
/** The floating layer, present while a piece is dragged or flying back. */
const floating = () => document.querySelector('[data-floating]');

/** Presses the Single's tray tile near its top-left, inside its one cell. */
const pressSingle = (pointerType: PointerType = 'mouse') =>
  fireEvent.pointerDown(single(), pointer({ x: 5, y: TRAY_TOP + 5 }, pointerType));

/** Where the Single is on a solved board, as `[row, col]`, and its gridcell. */
function solvedSingle() {
  const cell = screen.getByRole('gridcell', { name: /: Single$/ });
  const [, row, col] = /Row (\d), column (\d)/.exec(cell.getAttribute('aria-label')!)!;
  return { cell, at: [Number(row) - 1, Number(col) - 1] as const };
}

/** Drags the Single from the tray onto `to` and lets it settle. */
function placeSingle(to: readonly [number, number]) {
  pressSingle();
  moveTo(centre(to));
  fireEvent.pointerUp(window, pointer(centre(to)));
  act(() => vi.advanceTimersByTime(SETTLE_MS));
}

/** Moves the drag's pointer to `to`, via a point well past the tap threshold. */
function moveTo(to: { x: number; y: number }, pointerType: PointerType = 'mouse') {
  fireEvent.pointerMove(window, pointer({ x: 200, y: 200 }, pointerType));
  fireEvent.pointerMove(window, pointer(to, pointerType));
}

describe('PlayScreen dragging', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      if (this.getAttribute('role') === 'grid') return box(0, 0, BOARD_SPAN * CELL);
      if (this.tagName === 'svg' && this.closest('button[data-piece]')) {
        return box(0, TRAY_TOP, TRAY_CELL);
      }
      return box(0, 0, 0);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('selects a tray piece on a tap', () => {
    renderPlay();
    pressSingle();
    fireEvent.pointerUp(window, pointer({ x: 7, y: TRAY_TOP + 5 }));
    expect(single()).toHaveAttribute('aria-pressed', 'true');
    expect(floating()).toBeNull();
  });

  it('does not select after a drag that ends back on its tile', () => {
    renderPlay();
    pressSingle();
    moveTo({ x: 5, y: TRAY_TOP + 5 });
    fireEvent.pointerUp(window, pointer({ x: 5, y: TRAY_TOP + 5 }));
    act(() => vi.advanceTimersByTime(RETURN_MS));
    expect(single()).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('0 of 9 placed')).toBeInTheDocument();
  });

  it('drags a piece from the tray onto a free cell, previewing and then settling', () => {
    renderPlay();
    pressSingle();
    moveTo(centre(freeA));
    expect(floating()).not.toBeNull();
    expect(single().querySelector('[data-lifted]')).not.toBeNull();
    expect(document.querySelectorAll('[data-preview="valid"]')).toHaveLength(1);

    fireEvent.pointerUp(window, pointer(centre(freeA)));
    expect(screen.getByText('1 of 9 placed')).toBeInTheDocument();
    expect(screen.getByRole('gridcell', { name: cellName(freeA, 'Single') })).toBeInTheDocument();
    expect(document.querySelector('[data-preview]')).toBeNull();
    // The floating piece settles into place, then hands over to the board.
    expect(document.querySelector('g[data-piece="M1"]')).toBeNull();
    act(() => vi.advanceTimersByTime(SETTLE_MS));
    expect(floating()).toBeNull();
    expect(document.querySelector('g[data-piece="M1"]')).not.toBeNull();
  });

  it('lifts a touch drag above the finger', () => {
    renderPlay();
    pressSingle('touch');
    // 1.5 cells below the target, well clear of the top of the board, so fully lifted.
    const finger = { x: centre(freeA).x, y: centre(freeA).y + 1.5 * PITCH };
    moveTo(finger, 'touch');
    fireEvent.pointerUp(window, pointer(finger, 'touch'));
    expect(screen.getByRole('gridcell', { name: cellName(freeA, 'Single') })).toBeInTheDocument();
  });

  it('shows an invalid preview over a blocked cell and returns the piece', () => {
    renderPlay();
    pressSingle();
    moveTo(centre(blockedCell));
    expect(document.querySelectorAll('[data-preview="invalid"]')).toHaveLength(1);
    fireEvent.pointerUp(window, pointer(centre(blockedCell)));
    expect(screen.getByText('0 of 9 placed')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(RETURN_MS));
    expect(floating()).toBeNull();
    expect(single().querySelector('[data-lifted]')).toBeNull();
  });

  it('returns a piece dropped off the board to the tray', () => {
    renderPlay();
    pressSingle();
    moveTo({ x: 1000, y: 1000 });
    expect(document.querySelector('[data-preview]')).toBeNull();
    fireEvent.pointerUp(window, pointer({ x: 1000, y: 1000 }));
    act(() => vi.advanceTimersByTime(RETURN_MS));
    expect(screen.getByText('0 of 9 placed')).toBeInTheDocument();
    expect(floating()).toBeNull();
  });

  it('moves a placed piece to another free cell', () => {
    renderPlay();
    placeSingle(freeA);

    fireEvent.pointerDown(
      screen.getByRole('gridcell', { name: cellName(freeA, 'Single') }),
      pointer(centre(freeA)),
    );
    moveTo(centre(freeB));
    // Picked up: drawn by the floating layer, not the board, and its tile stays "Placed".
    expect(document.querySelector('g[data-piece="M1"]')).toBeNull();
    expect(single()).toBeDisabled();
    expect(single().querySelector('[data-lifted]')).toBeNull();
    fireEvent.pointerUp(window, pointer(centre(freeB)));
    act(() => vi.advanceTimersByTime(SETTLE_MS));
    expect(screen.getByRole('gridcell', { name: cellName(freeB, 'Single') })).toBeInTheDocument();
    expect(screen.getByRole('gridcell', { name: cellName(freeA, 'empty') })).toBeInTheDocument();
    expect(screen.getByText('1 of 9 placed')).toBeInTheDocument();
  });

  it('returns a placed piece dragged off the board to the tray', () => {
    renderPlay(true);
    const { cell, at: from } = solvedSingle();
    fireEvent.pointerDown(cell, pointer(centre(from)));
    moveTo({ x: 1000, y: 1000 });
    fireEvent.pointerUp(window, pointer({ x: 1000, y: 1000 }));
    expect(screen.getByText('8 of 9 placed')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(RETURN_MS));
    expect(single()).toBeEnabled();
  });

  it('puts a placed piece back where it was when the pointer is cancelled', () => {
    renderPlay(true);
    const { cell, at: from } = solvedSingle();
    fireEvent.pointerDown(cell, pointer(centre(from)));
    moveTo({ x: 1000, y: 1000 });
    fireEvent.pointerCancel(window, pointer({ x: 1000, y: 1000 }));
    act(() => vi.advanceTimersByTime(RETURN_MS));
    expect(screen.getByText('9 of 9 placed')).toBeInTheDocument();
    expect(document.querySelector('g[data-piece="M1"]')).not.toBeNull();
  });

  it('takes a placed piece off once the held cell is dragged past the edge', () => {
    renderPlay();
    // Somewhere with three free cells in a row for the Bar.
    const [row, col] = [...Array(BOARD_SIZE * 4).keys()]
      .map((i) => [Math.floor(i / 4), i % 4] as const)
      .find(([r, c]) => [0, 1, 2].every((d) => !blocked.has(r * BOARD_SIZE + c + d)))!;
    // The tray press lands on the Bar's middle cell, at its bottom edge.
    const bar = screen.getByRole('button', { name: /^Bar/ });
    fireEvent.pointerDown(bar, pointer({ x: 5, y: TRAY_TOP + 5 }));
    const drop = { x: (col + 1) * PITCH + CELL / 2, y: (row + 1) * PITCH + 5 };
    moveTo(drop);
    fireEvent.pointerUp(window, pointer(drop));
    act(() => vi.advanceTimersByTime(SETTLE_MS));
    expect(screen.getByRole('gridcell', { name: cellName([row, col], 'Bar') })).toBeInTheDocument();

    // Hold its right-hand cell and drag it just past the right edge: two cells still overlap.
    const right = [row, col + 2] as const;
    fireEvent.pointerDown(
      screen.getByRole('gridcell', { name: cellName(right, 'Bar') }),
      pointer(centre(right)),
    );
    const past = centre([row, BOARD_SIZE]);
    moveTo(past);
    expect(document.querySelector('[data-preview]')).toBeNull();
    fireEvent.pointerUp(window, pointer(past));
    expect(screen.getByText('0 of 9 placed')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(RETURN_MS));
    expect(screen.getByRole('button', { name: 'Bar, 3 squares' })).toBeEnabled();
  });

  it('returns a board piece dropped on an invalid cell to where it was', () => {
    renderPlay();
    placeSingle(freeA);
    fireEvent.pointerDown(
      screen.getByRole('gridcell', { name: cellName(freeA, 'Single') }),
      pointer(centre(freeA)),
    );
    moveTo(centre(blockedCell));
    fireEvent.pointerUp(window, pointer(centre(blockedCell)));
    act(() => vi.advanceTimersByTime(RETURN_MS));
    expect(screen.getByRole('gridcell', { name: cellName(freeA, 'Single') })).toBeInTheDocument();
    expect(document.querySelector('g[data-piece="M1"]')).not.toBeNull();
    expect(floating()).toBeNull();
  });

  it.each([
    ['empty', () => freeA],
    ['blocked', () => blockedCell],
  ] as const)('ignores a press on an %s board cell', (what, where) => {
    renderPlay();
    fireEvent.pointerDown(
      screen.getByRole('gridcell', { name: cellName(where(), what) }),
      pointer(centre(where())),
    );
    moveTo({ x: 1000, y: 1000 });
    expect(floating()).toBeNull();
    fireEvent.pointerUp(window, pointer({ x: 1000, y: 1000 }));
    // The controller is free again: a tray tap still works.
    pressSingle();
    fireEvent.pointerUp(window, pointer({ x: 5, y: TRAY_TOP + 5 }));
    expect(single()).toHaveAttribute('aria-pressed', 'true');
  });

  it('ignores a press on a placed piece’s tray tile', () => {
    renderPlay(true);
    pressSingle();
    moveTo({ x: 1000, y: 1000 });
    expect(floating()).toBeNull();
    fireEvent.pointerUp(window, pointer({ x: 1000, y: 1000 }));
    expect(screen.getByText('9 of 9 placed')).toBeInTheDocument();
    expect(document.querySelector('g[data-piece="M1"]')).not.toBeNull();
  });

  it('ignores secondary buttons and non-primary pointers', () => {
    renderPlay();
    const at = { x: 5, y: TRAY_TOP + 5 };
    for (const overrides of [{ button: 2 }, { isPrimary: false }]) {
      fireEvent.pointerDown(single(), pointer(at, 'mouse', overrides));
      moveTo(centre(freeA));
      expect(floating()).toBeNull();
      fireEvent.pointerUp(window, pointer(at, 'mouse', overrides));
    }
    expect(single()).toHaveAttribute('aria-pressed', 'false');
  });

  it('does not treat a release far from the press as a tap', () => {
    renderPlay();
    pressSingle();
    fireEvent.pointerUp(window, pointer({ x: 60, y: TRAY_TOP + 5 }));
    expect(single()).toHaveAttribute('aria-pressed', 'false');
  });

  it('returns a piece turned mid-drag instead of placing a different shape', () => {
    renderPlay();
    pressSingle();
    fireEvent.pointerUp(window, pointer({ x: 5, y: TRAY_TOP + 5 }));
    pressSingle();
    moveTo(centre(freeA));
    // A second finger taps Rotate.
    fireEvent.click(screen.getByRole('button', { name: 'Rotate' }));
    fireEvent.pointerUp(window, pointer(centre(freeA)));
    act(() => vi.advanceTimersByTime(RETURN_MS));
    expect(screen.getByText('0 of 9 placed')).toBeInTheDocument();
    expect(floating()).toBeNull();
  });

  it('drops a gesture whose end was lost when a new press starts', () => {
    renderPlay();
    pressSingle();
    moveTo(centre(freeA));
    expect(floating()).not.toBeNull();
    // Pointer 1 never comes up; a new touch arrives with a new id.
    fireEvent.pointerDown(single(), pointer({ x: 5, y: TRAY_TOP + 5 }, 'touch', { pointerId: 2 }));
    expect(floating()).toBeNull();
    expect(document.querySelector('[data-preview]')).toBeNull();
    fireEvent.pointerUp(window, pointer({ x: 5, y: TRAY_TOP + 5 }, 'touch', { pointerId: 2 }));
    expect(single()).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('0 of 9 placed')).toBeInTheDocument();
  });

  it('ignores presses while a piece is flying back', () => {
    renderPlay();
    pressSingle();
    moveTo({ x: 1000, y: 1000 });
    fireEvent.pointerUp(window, pointer({ x: 1000, y: 1000 }));
    pressSingle();
    fireEvent.pointerUp(window, pointer({ x: 5, y: TRAY_TOP + 5 }));
    expect(single()).toHaveAttribute('aria-pressed', 'false');
    act(() => vi.advanceTimersByTime(RETURN_MS));
    pressSingle();
    fireEvent.pointerUp(window, pointer({ x: 5, y: TRAY_TOP + 5 }));
    expect(single()).toHaveAttribute('aria-pressed', 'true');
  });

  it('abandons the settle animation if the board is cleared meanwhile', () => {
    renderPlay();
    pressSingle();
    moveTo(centre(freeA));
    fireEvent.pointerUp(window, pointer(centre(freeA)));
    expect(floating()).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    // Gone at once, not after settling onto a board that no longer has it.
    expect(floating()).toBeNull();
    expect(single().querySelector('[data-lifted]')).toBeNull();
    expect(screen.getByText('0 of 9 placed')).toBeInTheDocument();
  });
});
