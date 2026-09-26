import { generateGrid, PIECE_IDS, solve } from '@cranny/engine';
import type { LiveRound, PlayerId, RoomClient, RoomState } from '@cranny/multiplayer';
import { useEffect, useReducer, useRef, useState } from 'react';
import { durationBucket, track } from '../analytics/analytics.ts';
import { formatTime } from '../game/formatTime.ts';
import {
  elapsedMs,
  newRound,
  placedCount,
  resumeRound,
  roundReducer,
  type RoundAction,
  type RoundState,
} from '../game/round.ts';
import { recordSolve } from '../game/stats.ts';
import { layoutVars, useViewport } from '../layout/AppFrame.tsx';
import { computeLayout, stripHeight } from '../layout/layout.ts';
import { PlayArea } from '../play/PlayArea.tsx';
import { CELEBRATION_MS, REDUCED_CELEBRATION_MS } from '../play/PlayScreen.tsx';
import {
  clearMultiplayerRound,
  loadMultiplayerRound,
  loadMultiplayerStats,
  saveMultiplayerRound,
  saveMultiplayerStats,
} from '../storage/storage.ts';
import { ordinal } from './progress.ts';
import { ProgressStrip } from './ProgressStrip.tsx';
import styles from './Room.module.css';
import { RoomHeader, type CloseOut } from './RoomHeader.tsx';
import { useNow } from './useNow.ts';

/** How long "Time's up" shows over the locked board before the lobby. */
export const TIMES_UP_MS = 1500;

/** A round's grid, as the snapshot names it. */
export type RoundGrid = { version: number; seed: number };

type RoomRoundProps = {
  state: RoomState;
  self: PlayerId;
  /** The round this tab is playing; the room may have moved on (then the board locks). */
  number: number;
  grid: RoundGrid;
  client: RoomClient;
  names: ReadonlyMap<PlayerId, string>;
  hideProgress: boolean;
  onToggleProgress: () => void;
  onBack: () => void;
  /** This tab is done with the round: show the lobby. */
  onDone: () => void;
  /** Development only: reveal with every piece but the Single placed, so one drop finishes. */
  startSolved?: boolean;
};

/** The play-area actions, plus replacing the whole round (the development `?solve` reveal). */
type RoomRoundAction = RoundAction | { type: 'replace'; state: RoundState };

/** {@link roundReducer}, plus `replace`. */
const roomRoundReducer = (state: RoundState, action: RoomRoundAction): RoundState =>
  action.type === 'replace' ? action.state : roundReducer(state, action);

/** The round started at `at` with every piece but the Single placed, or null if unsolvable. */
function nearlySolved(grid: RoundGrid, at: number): RoundState | null {
  const layout = generateGrid(grid.seed, grid.version);
  const solution = solve(layout.blocked);
  if (!solution) return null;
  const orientations = Object.fromEntries(PIECE_IDS.map((id) => [id, solution[id].orientation]));
  const placements = Object.fromEntries(
    PIECE_IDS.filter((id) => id !== 'M1').map((id) => [id, solution[id]]),
  );
  return resumeRound(layout, at, orientations, placements);
}

/** The board this tab starts the round with, and whether it had already finished. */
type Start = { round: RoundState; finishedMs: number | null };

/**
 * The board for a round: this tab's saved board for the same round if there is one
 * (specs/2026-09-25-multiplayer/SPEC.md §2 Reload), re-checked by `resumeRound`, otherwise a
 * fresh one before the reveal. Generating the grid runs the solver, so this runs once.
 */
function initialBoard({
  room,
  number,
  grid,
}: {
  room: string;
  number: number;
  grid: RoundGrid;
}): Start {
  const layout = generateGrid(grid.seed, grid.version);
  const saved = loadMultiplayerRound();
  const same =
    saved?.room === room &&
    saved.round === number &&
    saved.version === grid.version &&
    saved.seed === grid.seed;
  if (saved && same) {
    if (saved.finishedMs !== null) return { round: newRound(layout), finishedMs: saved.finishedMs };
    const resumed = resumeRound(layout, saved.revealedAt, saved.orientations, saved.placements);
    if (resumed) return { round: resumed, finishedMs: null };
  }
  return { round: newRound(layout), finishedMs: null };
}

/** Whether the player asked for less motion. */
const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * One round as a participant (SPEC §9 Room: countdown and playing): the 3-2-1 over the hidden
 * board, then the shared play area with the stopwatch from this tab's reveal. Board changes are
 * reported as progress, and filling the grid reports the finish, celebrates and shows the waiting
 * view. If the round ends first, the board locks and "Time's up" shows before the lobby. The board
 * is saved to session storage after every change, so a reload carries on.
 */
export function RoomRound({
  state,
  self,
  number,
  grid,
  client,
  names,
  hideProgress,
  onToggleProgress,
  onBack,
  onDone,
  startSolved = false,
}: RoomRoundProps) {
  const [start] = useState(() => initialBoard({ room: state.room, number, grid }));
  const [round, dispatch] = useReducer(roomRoundReducer, start.round);
  const finishedMs =
    start.finishedMs ??
    (round.status === 'complete' ? elapsedMs(round, round.finishedAt ?? 0) : null);
  const [celebrated, setCelebrated] = useState(start.finishedMs !== null);
  const viewport = useViewport();

  const ended = state.round.number !== number || state.round.status === 'lobby';
  // Once the round is over the room's round is the lobby, so keep showing the last one we saw.
  const [live, setLive] = useState<LiveRound>(state.round);
  if (!ended && state.round !== live) setLive(state.round);

  // The reveal (SPEC §5.4): at this tab's local deadline, or at once if the countdown was missed
  // (e.g. a reload without a saved board).
  const revealAt = live.status === 'countdown' ? live.revealAt : null;
  // The round's players are fixed once it starts, so this doesn't restart the countdown.
  const players = live.participants.length;
  useEffect(() => {
    if (round.status !== 'pre-start' || ended) return;
    const at = revealAt ?? Date.now();
    const reveal = () => {
      const solved = startSolved && nearlySolved(grid, at);
      dispatch(solved ? { type: 'replace', state: solved } : { type: 'start', at });
      track({ name: 'mp_round_started', players });
    };
    const timer = setTimeout(reveal, Math.max(0, at - Date.now()));
    return () => clearTimeout(timer);
  }, [round.status, revealAt, ended, startSolved, grid, players]);

  // Save the board after every change, and report progress while playing.
  const placed = placedCount(round);
  useEffect(() => {
    if (round.startedAt === null) return;
    saveMultiplayerRound({
      room: state.room,
      round: number,
      version: grid.version,
      seed: grid.seed,
      revealedAt: round.startedAt,
      orientations: round.orientations,
      placements: round.board.placements,
      finishedMs,
    });
  }, [round, finishedMs, state.room, number, grid]);
  useEffect(() => {
    if (round.status === 'playing' && !ended) client.reportProgress(number, placed);
  }, [client, number, placed, round.status, ended]);

  // The drop that fills the grid finishes the round for this player, and counts once toward
  // their multiplayer stats (specs/2026-09-26-multiplayer-stats/SPEC.md §2). A board restored
  // already finished was counted before the reload; the ref stops a re-run counting it twice.
  const recorded = useRef(start.finishedMs !== null);
  useEffect(() => {
    if (finishedMs === null || recorded.current) return;
    recorded.current = true;
    saveMultiplayerStats(recordSolve(loadMultiplayerStats(), finishedMs).stats);
    track({ name: 'mp_round_completed', players, duration: durationBucket(finishedMs) });
  }, [finishedMs, players]);
  useEffect(() => {
    if (finishedMs !== null && !ended) client.reportFinished(number, finishedMs);
  }, [client, number, finishedMs, ended]);
  useEffect(() => {
    if (finishedMs === null || celebrated) return;
    const ms = prefersReducedMotion() ? REDUCED_CELEBRATION_MS : CELEBRATION_MS;
    const timer = setTimeout(() => setCelebrated(true), ms);
    return () => clearTimeout(timer);
  }, [finishedMs, celebrated]);

  // The round is over: straight to the lobby if this player finished, else "Time's up" first.
  useEffect(() => {
    if (!ended) return;
    clearMultiplayerRound();
    if (finishedMs !== null) {
      onDone();
      return;
    }
    const timer = setTimeout(onDone, TIMES_UP_MS);
    return () => clearTimeout(timer);
  }, [ended, finishedMs, onDone]);

  const opponents = live.participants.filter((id) => id !== self).length;
  const layout = computeLayout(viewport, stripHeight(opponents, hideProgress));
  const firstFinish = live.finishes[0];
  const closeOut: CloseOut | null =
    live.status === 'closing' && live.closesAt !== null && firstFinish && !ended
      ? {
          leader: firstFinish.id === self ? 'You' : (names.get(firstFinish.id) ?? 'Someone'),
          closesAt: live.closesAt,
        }
      : null;
  const header = (
    <RoomHeader
      room={state.room}
      label={`Round ${number} · ${live.participants.length} players`}
      closeOut={closeOut}
      stopwatch={
        finishedMs !== null && round.startedAt === null
          ? { startedAt: 0, finishedAt: finishedMs }
          : { startedAt: round.startedAt, finishedAt: round.finishedAt }
      }
      hideProgress={hideProgress}
      onToggleProgress={onToggleProgress}
      onBack={onBack}
    />
  );
  const strip = (
    <ProgressStrip
      round={live}
      self={self}
      seats={state.seats}
      names={names}
      hidden={hideProgress}
    />
  );

  if (finishedMs !== null && celebrated) {
    const index = live.finishes.findIndex((f) => f.id === self);
    return (
      <main className={styles.room}>
        {header}
        {strip}
        <section className={styles.waiting} aria-labelledby="waiting-title">
          <h2 id="waiting-title" className={styles.waitingTitle}>
            {index === -1 ? 'Finished' : `You finished ${ordinal(index + 1)}`}
          </h2>
          <p className={styles.waitingTime}>
            <span className="visually-hidden">Your time </span>
            {formatTime(finishedMs, { tenths: true })}
          </p>
          <p className={styles.note}>Waiting for the others to finish.</p>
        </section>
      </main>
    );
  }

  const preStart = round.status === 'pre-start';
  return (
    <main className={styles.room} style={layoutVars(layout)}>
      {header}
      {strip}
      <PlayArea
        round={round}
        dispatch={dispatch}
        locked={ended}
        hideBlocked={preStart}
        celebrating={round.status === 'complete'}
        overlay={
          preStart ? (
            <RevealCountdown revealAt={revealAt} />
          ) : ended ? (
            <div className={styles.veil}>
              <p className={styles.veilText}>Time’s up</p>
            </div>
          ) : null
        }
      />
    </main>
  );
}

/** The 3-2-1 over the hidden board, counting down to this tab's reveal. */
function RevealCountdown({ revealAt }: { revealAt: number | null }) {
  const now = useNow(revealAt !== null, 100);
  const seconds = revealAt === null ? 0 : Math.ceil((revealAt - now) / 1000);
  return (
    <div className={styles.veil}>
      <p className={styles.countdown} aria-hidden="true">
        {Math.max(1, seconds)}
      </p>
    </div>
  );
}
