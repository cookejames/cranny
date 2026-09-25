import {
  cellAt,
  colOf,
  occupancy,
  rowOf,
  shapeOf,
  type Cell,
  type Orientation,
  type PieceId,
  type Shape,
} from '@cranny/engine';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { PREVIEW_GAP } from '../board/PieceShape.tsx';
import { isPlaced, type RoundAction, type RoundState } from '../game/round.ts';
import {
  cellPosition,
  cellSizeOf,
  cellUnder,
  geometryOf,
  grabbedCell,
  grabPoint,
  pieceTopLeft,
  pointInPiece,
  snap,
  TOUCH_LIFT_CELLS,
  type BoardGeometry,
  type PiecePoint,
  type Preview,
  type RowCol,
  type Snap,
} from './snap.ts';
import { isTap, type ClientPoint } from './tap.ts';

/** How long a dropped piece takes to settle into its cells (specs/2026-09-25-single-player/SPEC.md §6). */
export const SETTLE_MS = 120;
/** How long a piece takes to fly back to where it came from. */
export const RETURN_MS = 200;

/** The piece floating under the pointer, for the floating layer to draw. */
export type Floating = { piece: PieceId; orientation: Orientation; cellSize: number };

/** A press that may become a drag. Lives in a ref: pointer moves must not re-render. */
type Gesture = {
  pointerId: number;
  piece: PieceId;
  orientation: Orientation;
  shape: Shape;
  /** Where the piece was picked up from; a board piece remembers its cell. */
  from: { kind: 'tray' } | { kind: 'board'; origin: Cell };
  start: ClientPoint;
  /** The element holding pointer capture for this gesture, if capture succeeded. */
  captor: Element | null;
  board: BoardGeometry;
  grab: PiecePoint;
  /** The piece's cell under the grab point: dragging it off the board takes the piece off. */
  grabbed: RowCol;
  fullLift: number;
  dragging: boolean;
  /** The floating piece's top-left at the last move, so the drop can re-check it. */
  topLeft: ClientPoint | null;
  snap: Snap | null;
};

/**
 * A settle or return animation in flight. `expected` is where the piece should be once the drop
 * has been applied (its origin, or null for the tray); if the round moves it anywhere else
 * meanwhile (e.g. Clear), the animation is abandoned rather than finishing somewhere stale.
 */
type Animation = { timer: ReturnType<typeof setTimeout>; piece: PieceId; expected: Cell | null };

type DragOptions = {
  round: RoundState;
  /** Whether pieces can be picked up: only while the round is being played. */
  active: boolean;
  dispatch: (action: RoundAction) => void;
  /** Called for a tap (no drag) on a tray piece. */
  onTrayTap: (piece: PieceId) => void;
};

/** Whether a pointer down is the primary pointer's main button. */
const isPrimaryPress = (event: ReactPointerEvent) => event.isPrimary && event.button === 0;

/** Whether two orientations are the same. */
const sameOrientation = (a: Orientation, b: Orientation) => a.rot === b.rot && a.flip === b.flip;

/** A stable key for a snap, so the preview only re-renders when the target changes. */
const snapKey = (s: Snap | null) => (s ? `${s.row},${s.col},${s.origin !== null}` : '');

/**
 * Drag and drop for the play screen (specs/2026-09-25-single-player/SPEC.md §6). Tracks one primary-pointer gesture at a time.
 * A press released within `TAP_SLOP_PX` of where it went down is a tap; beyond that the piece
 * floats under the pointer (moved by a CSS transform on `floatingRef`, not React state), the
 * board shows a snap preview, and the drop places it, returns it to where it came from, or sends
 * it back to the tray.
 *
 * Attach `boardRef` to the board's cell area and `trayRef` to the tray (tiles carry
 * `data-piece`), and render the floating piece into `floatingRef`.
 */
export function useDrag({ round, active, dispatch, onTrayTap }: DragOptions) {
  const boardRef = useRef<HTMLDivElement>(null);
  const trayRef = useRef<HTMLDivElement>(null);
  const floatingRef = useRef<HTMLDivElement>(null);

  const [floating, setFloating] = useState<Floating | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  const gesture = useRef<Gesture | null>(null);
  /** The floating piece's transform, applied directly to the element. */
  const transform = useRef('');
  /** A settle or return animation in flight; no new gesture starts until it ends. */
  const animation = useRef<Animation | null>(null);

  // Handlers read the latest round and callbacks from refs, so the window listeners stay put.
  const latest = useRef({ round, active, dispatch, onTrayTap });
  useLayoutEffect(() => {
    latest.current = { round, active, dispatch, onTrayTap };
  });

  /** Moves the floating piece, without a React render. */
  const setTransform = useCallback((value: string, transition = '') => {
    transform.current = value;
    const el = floatingRef.current;
    if (el) {
      el.style.transition = transition;
      el.style.transform = value;
    }
  }, []);

  /** Ends any gesture or animation at once, with no animation: the piece is simply dropped. */
  const endNow = useCallback(() => {
    gesture.current = null;
    if (animation.current) clearTimeout(animation.current.timer);
    animation.current = null;
    setPreview(null);
    setFloating(null);
  }, []);

  /**
   * Whether a pointer down may start a gesture. A new primary press while a gesture is still
   * open means its end was lost (e.g. the tab lost focus mid-drag), so that one is dropped.
   */
  const canStart = useCallback(
    (event: ReactPointerEvent) => {
      if (!latest.current.active || !isPrimaryPress(event) || animation.current) return false;
      if (gesture.current) endNow();
      return true;
    },
    [endNow],
  );

  // Position the floating piece as soon as it mounts, before it paints.
  useLayoutEffect(() => {
    if (floating) setTransform(transform.current);
  }, [floating, setTransform]);

  /** Starts a press on a piece, measuring the board and where the piece was grabbed. */
  const begin = useCallback(
    (event: ReactPointerEvent, piece: PieceId, from: Gesture['from'], grabAt: PiecePoint) => {
      const boardEl = boardRef.current;
      if (!boardEl) return;
      const orientation = latest.current.round.orientations[piece];
      const shape = shapeOf(piece, orientation);
      const board = geometryOf(boardEl.getBoundingClientRect());
      const grab = grabPoint(shape, grabAt);
      // Keep receiving this pointer's events even if it leaves the window mid-drag. Best effort:
      // capture throws if the browser no longer counts the pointer as active.
      let captor: Element | null = event.currentTarget;
      try {
        captor.setPointerCapture(event.pointerId);
      } catch {
        // Window listeners still see the pointer while it's over the page.
        captor = null;
      }
      gesture.current = {
        pointerId: event.pointerId,
        piece,
        orientation,
        shape,
        from,
        start: { x: event.clientX, y: event.clientY },
        captor,
        board,
        grab,
        grabbed: grabbedCell(shape, grab),
        fullLift: event.pointerType === 'touch' ? TOUCH_LIFT_CELLS * board.pitch : 0,
        dragging: false,
        topLeft: null,
        snap: null,
      };
    },
    [],
  );

  /**
   * Pointer down on a tray tile (which contains the piece's preview SVG). Placed pieces' tiles
   * are disabled, but browsers still send them pointer events, so they are ignored here.
   */
  const onTrayPointerDown = useCallback(
    (piece: PieceId, event: ReactPointerEvent<HTMLElement>) => {
      if (isPlaced(latest.current.round, piece) || !canStart(event)) return;
      const svg = event.currentTarget.querySelector('svg');
      if (!svg) return;
      const shape = shapeOf(piece, latest.current.round.orientations[piece]);
      const at = pointInPiece(
        { x: event.clientX, y: event.clientY },
        svg.getBoundingClientRect(),
        shape,
        PREVIEW_GAP,
      );
      begin(event, piece, { kind: 'tray' }, at);
    },
    [begin, canStart],
  );

  /** Pointer down on the board: picks up the placed piece under the pointer, if any. */
  const onBoardPointerDown = useCallback(
    (event: ReactPointerEvent) => {
      const boardEl = boardRef.current;
      if (!boardEl || !canStart(event)) return;
      const board = geometryOf(boardEl.getBoundingClientRect());
      const point = { x: event.clientX, y: event.clientY };
      const cell = cellUnder(point, board);
      if (!cell) return;
      const { board: state } = latest.current.round;
      const occupant = occupancy(state)[cellAt(...cell)];
      if (!occupant || occupant === 'X') return;
      const origin = state.placements[occupant]!.origin;
      const corner = cellPosition([rowOf(origin), colOf(origin)], board);
      const at = { x: (point.x - corner.x) / board.pitch, y: (point.y - corner.y) / board.pitch };
      begin(event, occupant, { kind: 'board', origin }, at);
    },
    [begin, canStart],
  );

  // Abandon an animation whose piece the round has moved elsewhere (e.g. Clear mid-settle).
  useEffect(() => {
    const a = animation.current;
    if (a && (round.board.placements[a.piece]?.origin ?? null) !== a.expected) endNow();
  }, [round.board, endNow]);

  useEffect(() => {
    /**
     * Flies the floating piece to `to`, then ends the drag.
     *
     * @param expected - Where the round should have the piece meanwhile (see `Animation`).
     */
    const animateTo = (
      piece: PieceId,
      expected: Cell | null,
      to: ClientPoint,
      scale: number,
      ms: number,
    ) => {
      setTransform(`translate(${to.x}px, ${to.y}px) scale(${scale})`, `transform ${ms}ms ease-out`);
      const timer = setTimeout(() => {
        animation.current = null;
        setFloating(null);
      }, ms);
      animation.current = { timer, piece, expected };
    };

    /** Flies the piece back to its tray tile, shrinking to the tile's scale. */
    const returnToTray = (piece: PieceId) => {
      const target = trayRef.current?.querySelector(`[data-piece="${piece}"] svg`);
      const drawn = floatingRef.current?.querySelector('svg');
      if (!target || !drawn) return animateTo(piece, null, { x: 0, y: 0 }, 1, 0);
      const to = target.getBoundingClientRect();
      const from = drawn.getBoundingClientRect();
      const scale = from.width ? to.width / from.width : 1;
      animateTo(piece, null, { x: to.left, y: to.top }, scale, RETURN_MS);
    };

    /** Puts the piece back where the gesture picked it up. */
    const returnHome = (g: Gesture) => {
      if (g.from.kind === 'tray') return returnToTray(g.piece);
      const { origin } = g.from;
      animateTo(
        g.piece,
        origin,
        cellPosition([rowOf(origin), colOf(origin)], g.board),
        1,
        RETURN_MS,
      );
    };

    /** Follows the pointer: starts the drag past the tap slop, then moves and snaps the piece. */
    const onMove = (event: PointerEvent) => {
      const g = gesture.current;
      if (!g || event.pointerId !== g.pointerId) return;
      const pointer = { x: event.clientX, y: event.clientY };
      if (!g.dragging) {
        if (isTap(g.start, pointer)) return;
        g.dragging = true;
        setFloating({ piece: g.piece, orientation: g.orientation, cellSize: cellSizeOf(g.board) });
      }
      const topLeft = pieceTopLeft(pointer, g.grab, g.board, g.fullLift);
      g.topLeft = topLeft;
      setTransform(`translate(${topLeft.x}px, ${topLeft.y}px)`);
      const next = snap(
        latest.current.round.board,
        g.piece,
        g.orientation,
        g.shape,
        topLeft,
        g.board,
        g.grabbed,
      );
      if (snapKey(next) !== snapKey(g.snap)) {
        // No preview once the held cell is off the board: dropping there takes the piece off.
        setPreview(
          next.overBoard
            ? { piece: g.piece, cells: next.cellsOnBoard, valid: next.origin !== null }
            : null,
        );
      }
      g.snap = next;
    };

    /**
     * Ends the press: a tap selects a tray piece; a drag is dropped by the rules in specs/2026-09-25-single-player/SPEC.md §6,
     * re-checked against the round as it is now.
     */
    const onUp = (event: PointerEvent) => {
      const g = gesture.current;
      if (!g || event.pointerId !== g.pointerId) return;
      gesture.current = null;
      if (!g.dragging) {
        const up = { x: event.clientX, y: event.clientY };
        if (g.from.kind === 'tray' && isTap(g.start, up)) latest.current.onTrayTap(g.piece);
        return;
      }
      setPreview(null);
      const { round } = latest.current;
      // The piece was turned mid-drag (Rotate with a second finger): what was previewed no
      // longer matches what would be placed, so put it back.
      if (!sameOrientation(round.orientations[g.piece], g.orientation) || !g.topLeft) {
        return returnHome(g);
      }
      const target = snap(
        round.board,
        g.piece,
        g.orientation,
        g.shape,
        g.topLeft,
        g.board,
        g.grabbed,
      );
      if (!target.overBoard) {
        // Dragged off the board: back to the tray, wherever it came from.
        if (g.from.kind === 'board') latest.current.dispatch({ type: 'remove', piece: g.piece });
        returnToTray(g.piece);
      } else if (target.origin !== null) {
        // Valid: place now (so the round is up to date), then let the floating piece settle.
        // Stamped with the drop's time: the drop that fills the grid stops the clock (specs/2026-09-25-single-player/SPEC.md §7).
        latest.current.dispatch({
          type: 'place',
          piece: g.piece,
          origin: target.origin,
          at: Date.now(),
        });
        const to = cellPosition([target.row, target.col], g.board);
        animateTo(g.piece, target.origin, to, 1, SETTLE_MS);
      } else {
        returnHome(g);
      }
    };

    /**
     * The browser took the pointer away (`pointercancel`, or capture lost without a pointerup):
     * the piece goes back where it came from.
     */
    const onCancel = (event: PointerEvent) => {
      // Moving capture off the element the touch started on (a board cell) fires
      // lostpointercapture there; only a loss from our own captor ends the gesture.
      if (event.type === 'lostpointercapture' && event.target !== gesture.current?.captor) return;
      const g = gesture.current;
      if (!g || event.pointerId !== g.pointerId) return;
      gesture.current = null;
      if (!g.dragging) return;
      setPreview(null);
      returnHome(g);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    // Fires after pointerup too, by which time the gesture is over and this is a no-op.
    window.addEventListener('lostpointercapture', onCancel);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('lostpointercapture', onCancel);
      if (animation.current) clearTimeout(animation.current.timer);
    };
  }, [setTransform]);

  return {
    boardRef,
    trayRef,
    floatingRef,
    /** The piece being dragged or animating, hidden from the board and tray meanwhile. */
    lifted: floating?.piece ?? null,
    floating,
    preview,
    onTrayPointerDown,
    onBoardPointerDown,
  };
}
