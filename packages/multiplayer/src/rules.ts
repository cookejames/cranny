import { PIECE_IDS } from '@cranny/engine';

/** Fewest present players who can start a round (SPEC §2 Rounds). */
export const MIN_PLAYERS = 2;
/** Most players present in a room at once (SPEC §2 Rooms). */
export const MAX_PRESENT = 8;
/** Most seats a room keeps, present or away (SPEC §2 Rooms). */
export const MAX_SEATS = 16;
/** Pieces on a full board. */
export const PIECE_COUNT = PIECE_IDS.length;

/** The ready countdown, once at least 2 players are ready and they are more than half. */
export const READY_TIMEOUT_MS = 30_000;
/** The 3-2-1 before the reveal. */
export const REVEAL_COUNTDOWN_MS = 3_000;
/** How long everyone else has after the first finish. */
export const CLOSE_OUT_MS = 30_000;
