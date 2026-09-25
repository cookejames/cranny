import { SUPPORTED_VERSIONS } from '@cranny/engine';
import {
  displayNames,
  type PlayerId,
  type RoomClient,
  type RoomState,
  type RoomView,
} from '@cranny/multiplayer';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import type { RoomAdapters } from '../net/adapters.ts';
import { loadMultiplayerPrefs, saveMultiplayerPrefs } from '../storage/storage.ts';
import { LeaveDialog } from './LeaveDialog.tsx';
import { Lobby } from './Lobby.tsx';
import type { JoinErrorState } from './MultiplayerPage.tsx';
import { playerName } from './playerName.ts';
import { ProgressStrip } from './ProgressStrip.tsx';
import styles from './Room.module.css';
import { RoomHeader, type CloseOut } from './RoomHeader.tsx';
import { RoomRound, type RoundGrid } from './RoomRound.tsx';
import { RoomSession, type SessionOptions } from './session.ts';
import { useAnnouncements } from './useAnnouncements.ts';
import { useNow } from './useNow.ts';

/** How long the connection can be down before the room shows it as lost (SPEC §9). */
export const LOST_AFTER_MS = 60_000;

type RoomScreenProps = {
  room: string;
  adapters: RoomAdapters;
  /** Starts again with a new session ("Try again" after a lost connection). */
  onRetry: () => void;
  /** Test seams for the session. */
  sessionOptions?: SessionOptions | undefined;
  /** Development only: each round reveals one drop from solved (`?solve`). */
  startSolved?: boolean;
};

/** The round this tab is playing: the number and grid it was dealt. */
type Playing = { number: number; grid: RoundGrid };

/** Whether this client can generate a grid version. */
const supported = (version: number) => (SUPPORTED_VERSIONS as readonly number[]).includes(version);

/**
 * A room, `/m/:room` (specs/2026-09-25-multiplayer/SPEC.md §9): runs this tab's
 * {@link RoomSession} for as long as the screen is open, and shows the lobby, the round being
 * played, or the round being sat out, with the connection states around them. Closing the screen
 * without leaving keeps the seat (shown as away).
 */
export function RoomScreen({
  room,
  adapters,
  onRetry,
  sessionOptions,
  startSolved = false,
}: RoomScreenProps) {
  const [session] = useState(() => new RoomSession(room, adapters, playerName(), sessionOptions));
  useEffect(() => {
    session.retain();
    return () => session.releaseSoon();
  }, [session]);
  const snapshot = useSyncExternalStore(session.subscribe, session.snapshot);

  switch (snapshot.stage) {
    case 'joining':
      return <Joining room={room} stillConnecting={false} />;
    case 'failed':
      return <SendBack room={room} error={snapshot.error} />;
    case 'in-room':
      return (
        <InRoom
          room={room}
          session={session}
          client={session.roomClient()!}
          self={snapshot.self}
          view={snapshot.view}
          onRetry={onRetry}
          startSolved={startSolved}
        />
      );
  }
}

type InRoomProps = {
  room: string;
  session: RoomSession;
  client: RoomClient;
  self: PlayerId;
  view: RoomView;
  onRetry: () => void;
  startSolved: boolean;
};

/** The room once this tab has a client: its phase, then the lobby or the round. */
function InRoom({ room, session, client, self, view, onRetry, startSolved }: InRoomProps) {
  const navigate = useNavigate();
  const [asking, setAsking] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [hideProgress, setHideProgress] = useState(() => loadMultiplayerPrefs().hideProgress);
  const [playing, setPlaying] = useState<Playing | null>(null);
  const now = useNow(view.reconnectingSince !== null, 1000);
  const state = view.room;
  const round = state?.round;

  // Take up a round this tab is a participant in; it stays until RoomRound says it's done.
  const mine =
    round && round.status !== 'lobby' && round.grid && round.participants.includes(self)
      ? { number: round.number, grid: round.grid }
      : null;
  if (mine && !playing && supported(mine.grid.version)) setPlaying(mine);
  const done = useCallback(() => setPlaying(null), []);

  const names = useNames(state);
  const announcement = useAnnouncements(state, self, names);

  /** Remembers and applies the Hide progress choice. */
  const toggleProgress = () => {
    const hidden = !hideProgress;
    setHideProgress(hidden);
    saveMultiplayerPrefs({ hideProgress: hidden });
  };

  /** Leaves for good, then goes Home. */
  const leave = async () => {
    setLeaving(true);
    await session.leave();
    void navigate('/');
  };

  switch (view.phase) {
    case 'connecting':
    case 'joining':
      return <Joining room={room} stillConnecting={view.stillConnecting} />;
    case 'full':
      return <SendBack room={room} error="full" />;
    case 'needs-update':
      return (
        <Message title="This room needs a newer version of Cranny. Refresh to update.">
          <Link to="/" className={styles.primaryLink}>
            Home
          </Link>
        </Message>
      );
    case 'left':
      return <Navigate to="/" replace />;
    case 'closed':
      return <Lost onRetry={onRetry} />;
    case 'in-room':
      break;
  }
  if (view.reconnectingSince !== null && now - view.reconnectingSince >= LOST_AFTER_MS) {
    return <Lost onRetry={onRetry} />;
  }
  if (!state || !round) return <Joining room={room} stillConnecting={view.stillConnecting} />;

  const askToLeave = () => setAsking(true);
  let body;
  if (playing) {
    body = (
      <RoomRound
        key={playing.number}
        state={state}
        self={self}
        number={playing.number}
        grid={playing.grid}
        client={client}
        names={names}
        hideProgress={hideProgress}
        onToggleProgress={toggleProgress}
        onBack={askToLeave}
        onDone={done}
        startSolved={startSolved}
      />
    );
  } else if (round.status === 'lobby') {
    body = <Lobby state={state} self={self} client={client} names={names} onLeave={askToLeave} />;
  } else {
    body = (
      <SittingOut
        state={state}
        self={self}
        names={names}
        needsUpdate={mine !== null}
        hideProgress={hideProgress}
        onToggleProgress={toggleProgress}
        onBack={askToLeave}
      />
    );
  }

  return (
    <>
      {body}
      {view.status === 'reconnecting' && (
        <p className={styles.reconnecting} role="status">
          Reconnecting…
        </p>
      )}
      <p className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>
      <LeaveDialog
        room={room}
        open={asking}
        leaving={leaving}
        onLeave={() => void leave()}
        onStay={() => setAsking(false)}
      />
    </>
  );
}

/** Display names for the room's seats, with duplicates numbered (SPEC §2 Names). */
function useNames(state: RoomState | null): ReadonlyMap<PlayerId, string> {
  const seats = state?.seats;
  return useMemo(() => (seats ? displayNames(seats) : new Map<PlayerId, string>()), [seats]);
}

type SittingOutProps = {
  state: RoomState;
  self: PlayerId;
  names: ReadonlyMap<PlayerId, string>;
  /** This player is a participant, but the grid needs a newer version of the game. */
  needsUpdate: boolean;
  hideProgress: boolean;
  onToggleProgress: () => void;
  onBack: () => void;
};

/** A round this tab isn't playing (SPEC §9): the progress strip and when it can play. */
function SittingOut({
  state,
  self,
  names,
  needsUpdate,
  hideProgress,
  onToggleProgress,
  onBack,
}: SittingOutProps) {
  const { round } = state;
  const first = round.finishes[0];
  const closeOut: CloseOut | null =
    round.status === 'closing' && round.closesAt !== null && first
      ? { leader: names.get(first.id) ?? 'Someone', closesAt: round.closesAt }
      : null;
  return (
    <main className={styles.room}>
      <RoomHeader
        room={state.room}
        label={`Round ${round.number} · ${round.participants.length} players`}
        closeOut={closeOut}
        stopwatch={null}
        hideProgress={hideProgress}
        onToggleProgress={onToggleProgress}
        onBack={onBack}
      />
      <ProgressStrip
        round={round}
        self={self}
        seats={state.seats}
        names={names}
        hidden={hideProgress}
      />
      <section className={styles.waiting}>
        <p className={styles.waitingTitle}>
          {needsUpdate
            ? 'This round needs a newer version of Cranny. Refresh to update.'
            : 'You’ll play from the next round'}
        </p>
        {round.status === 'countdown' && <p className={styles.note}>The round is starting.</p>}
      </section>
    </main>
  );
}

/** Joining the room, or waiting for its host to answer ("Still connecting…", SPEC §8.1). */
function Joining({ room, stillConnecting }: { room: string; stillConnecting: boolean }) {
  return (
    <Message title={room} label="Multiplayer room">
      <p className={styles.note} role="status">
        {stillConnecting ? 'Still connecting…' : 'Joining…'}
      </p>
      <Link to="/" className={styles.secondaryLink}>
        Home
      </Link>
    </Message>
  );
}

/** The connection couldn't be kept (SPEC §9 Connection states): Try again or Home. */
function Lost({ onRetry }: { onRetry: () => void }) {
  return (
    <Message title="Lost connection to the room">
      <button type="button" className={styles.primary} onClick={onRetry}>
        Try again
      </button>
      <Link to="/" className={styles.secondaryLink}>
        Home
      </Link>
    </Message>
  );
}

/** A full-screen message with actions under it. */
function Message({
  title,
  label,
  children,
}: {
  title: string;
  label?: string;
  children: ReactNode;
}) {
  return (
    <main className={styles.message}>
      {label && <span className={styles.label}>{label}</span>}
      <h1 className={styles.messageTitle}>{title}</h1>
      {children}
    </main>
  );
}

/** Goes back to the Multiplayer screen, which explains why the room couldn't be joined. */
function SendBack({ room, error }: { room: string; error: JoinErrorState['joinError'] }) {
  const state: JoinErrorState = { joinError: error, room };
  return <Navigate to="/multiplayer" replace state={state} />;
}
