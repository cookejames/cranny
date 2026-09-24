import { PIECE_IDS, type Orientation, type PieceId } from '@tessel/engine';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Tray } from './Tray.tsx';

const upright = Object.fromEntries(PIECE_IDS.map((id) => [id, { rot: 0, flip: false }])) as Record<
  PieceId,
  Orientation
>;

/** Renders the tray with spies for keyboard selection and pointer presses. */
function renderTray(placed: PieceId[] = [], lifted: PieceId | null = null) {
  const onSelect = vi.fn();
  const onPiecePointerDown = vi.fn();
  render(
    <Tray
      orientations={upright}
      isPlaced={(id) => placed.includes(id)}
      selected={null}
      onSelect={onSelect}
      onPiecePointerDown={onPiecePointerDown}
      lifted={lifted}
    />,
  );
  return { onSelect, onPiecePointerDown };
}

const tee = () => screen.getByRole('button', { name: /^Tee/ });

describe('Tray', () => {
  it('hands pointer presses to the drag controller, and ignores pointer clicks', () => {
    const { onSelect, onPiecePointerDown } = renderTray();
    fireEvent.pointerDown(tee(), { clientX: 100, clientY: 100, isPrimary: true, button: 0 });
    // Browsers follow a pointer tap with a click whose `detail` counts the clicks.
    fireEvent.click(tee(), { detail: 1 });
    expect(onPiecePointerDown).toHaveBeenCalledExactlyOnceWith('T4', expect.anything());
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('selects with the keyboard (a click with no pointer)', () => {
    const { onSelect } = renderTray();
    fireEvent.click(tee(), { detail: 0 });
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('T4');
  });

  it('empties the slot of a lifted piece', () => {
    renderTray([], 'T4');
    expect(tee().querySelector('[data-lifted]')).not.toBeNull();
    expect(screen.getByRole('button', { name: /^Ell/ }).querySelector('[data-lifted]')).toBeNull();
  });

  it('shows placed pieces as disabled with a readable "Placed" label', () => {
    renderTray(['T4']);
    expect(screen.getByRole('button', { name: 'Tee, 4 squares, placed' })).toBeDisabled();
    expect(screen.getByText('Placed')).toBeInTheDocument();
  });
});
