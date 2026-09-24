import { newBoard, place, solve, type BoardState } from '@tessel/engine';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Board } from './Board.tsx';

const grid = { version: 1, seed: 0, blocked: [3, 8, 13, 18, 19, 24, 34] };

describe('Board', () => {
  it('renders 36 labelled cells, with the blocked ones marked', () => {
    render(<Board board={newBoard(grid)} />);
    expect(screen.getAllByRole('gridcell')).toHaveLength(36);
    expect(screen.getAllByRole('gridcell', { name: /blocked$/ })).toHaveLength(7);
    expect(screen.getByRole('gridcell', { name: 'Row 1, column 4: blocked' })).toBeInTheDocument();
    expect(screen.getByRole('gridcell', { name: 'Row 1, column 1: empty' })).toBeInTheDocument();
  });

  it('names the piece covering a cell and draws it as one shape', () => {
    const board = place(newBoard(grid), 'D2', {
      orientation: { rot: 0, flip: false },
      origin: 0,
    });
    const { container } = render(<Board board={board} />);
    expect(screen.getByRole('gridcell', { name: 'Row 1, column 1: Domino' })).toBeInTheDocument();
    expect(screen.getByRole('gridcell', { name: 'Row 1, column 2: Domino' })).toBeInTheDocument();
    const paths = container.querySelectorAll('g[data-piece]');
    expect(paths).toHaveLength(1);
    expect(paths[0]).toHaveAttribute('data-piece', 'D2');
  });

  it('leaves blocked cells out of the DOM when hidden before Start', () => {
    const { container } = render(<Board board={newBoard(grid)} hideBlocked />);
    expect(screen.queryAllByRole('gridcell', { name: /blocked$/ })).toHaveLength(0);
    expect(screen.getAllByRole('gridcell', { name: /empty$/ })).toHaveLength(36);
    expect(container.innerHTML).not.toMatch(/blocked/i);
  });

  it('draws one merged shape per piece on a full board', () => {
    const board: BoardState = { grid, placements: solve(grid.blocked)! };
    const { container } = render(<Board board={board} />);
    expect(container.querySelectorAll('g[data-piece]')).toHaveLength(9);
    expect(screen.queryAllByRole('gridcell', { name: /empty$/ })).toHaveLength(0);
  });
});
