import { PIECE_IDS, type Orientation, type PieceId } from '@tessel/engine';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TAP_SLOP_PX } from '../drag/tap.ts';
import { Tray } from './Tray.tsx';

const upright = Object.fromEntries(PIECE_IDS.map((id) => [id, { rot: 0, flip: false }])) as Record<
  PieceId,
  Orientation
>;

/** Renders the tray with nothing placed and a spy for selection. */
function renderTray(placed: PieceId[] = []) {
  const onSelect = vi.fn();
  render(
    <Tray
      orientations={upright}
      isPlaced={(id) => placed.includes(id)}
      selected={null}
      onSelect={onSelect}
    />,
  );
  return onSelect;
}

const tee = () => screen.getByRole('button', { name: /^Tee/ });

/** Presses the primary pointer on `el` at (x, y) and releases it `dx` pixels to the right. */
function press(el: HTMLElement, dx: number) {
  fireEvent.pointerDown(el, { clientX: 100, clientY: 100, isPrimary: true, button: 0 });
  fireEvent.pointerUp(el, { clientX: 100 + dx, clientY: 100, isPrimary: true, button: 0 });
  // Browsers follow a pointer tap with a click whose `detail` counts the clicks.
  fireEvent.click(el, { detail: 1 });
}

describe('Tray', () => {
  it('selects a piece on a pointer tap, once', () => {
    const onSelect = renderTray();
    press(tee(), 2);
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('T4');
  });

  it('does not select when the pointer moves like a drag', () => {
    const onSelect = renderTray();
    press(tee(), TAP_SLOP_PX + 1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('selects with the keyboard (a click with no pointer)', () => {
    const onSelect = renderTray();
    fireEvent.click(tee(), { detail: 0 });
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('T4');
  });

  it('ignores secondary buttons and cancelled pointers', () => {
    const onSelect = renderTray();
    fireEvent.pointerDown(tee(), { clientX: 0, clientY: 0, isPrimary: true, button: 2 });
    fireEvent.pointerUp(tee(), { clientX: 0, clientY: 0, isPrimary: true, button: 2 });
    fireEvent.pointerDown(tee(), { clientX: 0, clientY: 0, isPrimary: true, button: 0 });
    fireEvent.pointerCancel(tee());
    fireEvent.pointerUp(tee(), { clientX: 0, clientY: 0, isPrimary: true, button: 0 });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('shows placed pieces as disabled with a readable "Placed" label', () => {
    renderTray(['T4']);
    expect(screen.getByRole('button', { name: 'Tee, 4 squares, placed' })).toBeDisabled();
    expect(screen.getByText('Placed')).toBeInTheDocument();
  });
});
