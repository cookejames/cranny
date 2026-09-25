/** A pointer that moves less than this between down and up is a tap, not a drag (specs/2026-09-25-single-player/SPEC.md §6). */
export const TAP_SLOP_PX = 6;

/** A point in client (viewport) coordinates. */
export type ClientPoint = { x: number; y: number };

/** Whether a pointer that went down at `from` and is now at `to` is still within tap range. */
export const isTap = (from: ClientPoint, to: ClientPoint) =>
  Math.hypot(to.x - from.x, to.y - from.y) < TAP_SLOP_PX;
