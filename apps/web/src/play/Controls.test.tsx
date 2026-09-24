import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Controls, SKIP_CONFIRM_MS } from './Controls.tsx';

/** Renders Controls with spy callbacks and the given overrides. */
function renderControls(props: Partial<Parameters<typeof Controls>[0]> = {}) {
  const handlers = {
    onRotate: vi.fn(),
    onFlip: vi.fn(),
    onClear: vi.fn(),
    onNewGrid: vi.fn(),
  };
  render(<Controls hasSelection={false} placedCount={0} {...handlers} {...props} />);
  return handlers;
}

describe('Controls', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('disables Rotate and Flip until a piece is selected', () => {
    renderControls();
    expect(screen.getByRole('button', { name: 'Rotate' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Flip' })).toBeDisabled();
  });

  it('rotates and flips the selection', () => {
    const { onRotate, onFlip } = renderControls({ hasSelection: true });
    fireEvent.click(screen.getByRole('button', { name: 'Rotate' }));
    fireEvent.click(screen.getByRole('button', { name: 'Flip' }));
    expect(onRotate).toHaveBeenCalledOnce();
    expect(onFlip).toHaveBeenCalledOnce();
  });

  it('only enables Clear when pieces are placed', () => {
    renderControls();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();
  });

  it('clears the board', () => {
    const { onClear } = renderControls({ placedCount: 3 });
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it('announces the skip confirmation in a status region', () => {
    renderControls({ placedCount: 2 });
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    fireEvent.click(screen.getByRole('button', { name: 'New grid' }));
    expect(screen.getByRole('status')).toHaveTextContent(/again within 3 seconds/);
  });

  it('drops the confirmation if the board is cleared meanwhile', () => {
    const handlers = { onRotate: vi.fn(), onFlip: vi.fn(), onClear: vi.fn(), onNewGrid: vi.fn() };
    const { rerender } = render(<Controls hasSelection={false} placedCount={2} {...handlers} />);
    fireEvent.click(screen.getByRole('button', { name: 'New grid' }));
    rerender(<Controls hasSelection={false} placedCount={0} {...handlers} />);
    expect(screen.getByRole('button', { name: 'New grid' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'New grid' }));
    expect(handlers.onNewGrid).toHaveBeenCalledOnce();
  });

  it('skips straight to a new grid when nothing is placed', () => {
    const { onNewGrid } = renderControls();
    fireEvent.click(screen.getByRole('button', { name: 'New grid' }));
    expect(onNewGrid).toHaveBeenCalledOnce();
  });

  it('asks for a second tap once pieces are placed', () => {
    const { onNewGrid } = renderControls({ placedCount: 2 });
    fireEvent.click(screen.getByRole('button', { name: 'New grid' }));
    expect(onNewGrid).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Tap again to skip' }));
    expect(onNewGrid).toHaveBeenCalledOnce();
  });

  it('forgets the first tap after 3 seconds', () => {
    const { onNewGrid } = renderControls({ placedCount: 2 });
    fireEvent.click(screen.getByRole('button', { name: 'New grid' }));
    act(() => vi.advanceTimersByTime(SKIP_CONFIRM_MS));
    fireEvent.click(screen.getByRole('button', { name: 'New grid' }));
    expect(onNewGrid).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Tap again to skip' })).toBeInTheDocument();
  });
});
