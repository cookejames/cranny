import {
  cryptoRandom,
  randomPlayerName,
  type PlayerId,
  type RoomClient,
  type RoomState,
  type RoundResult,
  type Seat,
} from '@cranny/multiplayer';
import { useCallback, useState } from 'react';
import { formatTime } from '../game/formatTime.ts';
import { Toast } from '../play/Toast.tsx';
import { roomShareText, SHARE_TOASTS, shareLink } from '../share/share.ts';
import { setPlayerName } from './playerName.ts';
import { formatCountdown, ordinal } from './progress.ts';
import styles from './Room.module.css';
import { useNow } from './useNow.ts';

type LobbyProps = {
  state: RoomState;
  self: PlayerId;
  client: RoomClient;
  names: ReadonlyMap<PlayerId, string>;
  /** The directory gave the room's name away (SPEC §7 Lost name). */
  nameLost: boolean;
  /** Asks to leave the room (back and Finish). */
  onLeave: () => void;
};

/** Seats in the order the list shows them: by score once a round has been played, else by joining. */
function orderSeats(seats: readonly Seat[], scored: boolean): Seat[] {
  return [...seats].sort((a, b) => (scored ? b.score - a.score : 0) || a.joinOrder - b.joinOrder);
}

/** "1 player not ready", "3 players not ready". */
const notReady = (count: number) => `${count} ${count === 1 ? 'player' : 'players'} not ready`;

/**
 * The room's lobby (specs/2026-09-25-multiplayer/SPEC.md §9): the room name with Share, the last
 * round's results, the players (or totals) with ready ticks and away markers, the Ready toggle
 * and the ready countdown, and Finish.
 */
export function Lobby({ state, self, client, names, nameLost, onLeave }: LobbyProps) {
  const [toast, setToast] = useState<string | null>(null);
  const hideToast = useCallback(() => setToast(null), []);
  const { round, lastResult } = state;
  const readyClosesAt = round.readyClosesAt;
  const now = useNow(readyClosesAt !== null);

  const presentSeats = state.seats.filter((s) => state.present.includes(s.id));
  const alone = presentSeats.every((s) => s.id === self);
  const ready = round.ready.includes(self);
  const waiting = presentSeats.filter((s) => !round.ready.includes(s.id)).length;

  /** Shares the room's link, with a toast if it was copied instead or couldn't be shared. */
  const share = async () => {
    const url = new URL(`/m/${state.room}`, window.location.origin).href;
    const result = await shareLink(roomShareText(state.room), url);
    setToast(SHARE_TOASTS[result] ?? null);
  };

  return (
    <main className={styles.lobby}>
      <header className={styles.lobbyHeader}>
        <button type="button" className={styles.back} aria-label="Leave the room" onClick={onLeave}>
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <div className={styles.titleBlock}>
          <span className={styles.label}>Multiplayer room</span>
          <h1 className={styles.roomName}>{state.room}</h1>
        </div>
        <button type="button" className={styles.share} onClick={() => void share()}>
          Share
        </button>
      </header>

      {nameLost && (
        <p className={styles.notice} role="status">
          This room’s name has been reused, so new players can’t join. Everyone here can keep
          playing.
        </p>
      )}

      {lastResult && <RoundResults result={lastResult} self={self} names={names} />}

      <PlayerList
        seats={orderSeats(state.seats, lastResult !== null || state.seats.some((s) => s.score))}
        heading={lastResult ? 'Totals' : 'Players'}
        showScores={lastResult !== null}
        state={state}
        self={self}
        client={client}
        names={names}
      />

      <div className={styles.lobbyActions}>
        {readyClosesAt !== null && (
          <p className={styles.readyCountdown} role="timer">
            Starting in {formatCountdown(readyClosesAt - now)} · {notReady(waiting)}
          </p>
        )}
        <button
          type="button"
          className={styles.ready}
          aria-pressed={ready}
          disabled={alone}
          onClick={() => client.setReady(!ready)}
        >
          {ready && (
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 12l5 5 9-10" />
            </svg>
          )}
          {lastResult ? 'Play another' : 'Ready'}
        </button>
        {alone && <p className={styles.note}>Waiting for another player</p>}
        {lastResult && (
          <button type="button" className={styles.secondary} onClick={onLeave}>
            Finish
          </button>
        )}
      </div>
      <Toast message={toast} onDone={hideToast} />
    </main>
  );
}

type PlayerListProps = {
  seats: readonly Seat[];
  heading: string;
  showScores: boolean;
  state: RoomState;
  self: PlayerId;
  client: RoomClient;
  names: ReadonlyMap<PlayerId, string>;
};

/**
 * The room's seats (SPEC §9): name, total score, a ready tick and an "away" marker, with this
 * player's row marked "You" and their name editable in place.
 */
function PlayerList({ seats, heading, showScores, state, self, client, names }: PlayerListProps) {
  return (
    <section className={styles.section} aria-labelledby="players-heading">
      <h2 id="players-heading" className={styles.heading}>
        {heading}
      </h2>
      <ul className={styles.players}>
        {seats.map((seat) => {
          const away = !state.present.includes(seat.id);
          const ready = state.round.ready.includes(seat.id);
          const you = seat.id === self;
          return (
            <li key={seat.id} className={styles.player} data-away={away ? '' : undefined}>
              <span className={styles.readyMark} data-ready={ready ? '' : undefined}>
                {ready && (
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 12l5 5 9-10" />
                  </svg>
                )}
                <span className="visually-hidden">{ready ? 'Ready' : 'Not ready'}</span>
              </span>
              {you ? (
                // Keyed by the name, so a rename from elsewhere (e.g. before a reload) shows.
                <NameEditor key={seat.name} name={seat.name} client={client} />
              ) : (
                <span className={styles.playerName}>{names.get(seat.id) ?? seat.name}</span>
              )}
              {you && <span className={styles.tag}>You</span>}
              {away && <span className={styles.away}>away</span>}
              {showScores && (
                <span className={styles.score}>
                  {seat.score}
                  <span className="visually-hidden"> points</span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * This player's name, editable in place, with a button to draw a random one (SPEC §2 Names).
 * Starts from the seat's name, which may differ from the one last remembered on the device.
 */
function NameEditor({ name, client }: { name: string; client: RoomClient }) {
  const [draft, setDraft] = useState(name);

  /** Uses a name: remembers it, tells the room and shows it as cleaned. */
  const commit = (value: string) => {
    const cleaned = setPlayerName(value);
    if (cleaned) client.rename(cleaned);
    setDraft(cleaned ?? name);
  };

  return (
    <span className={styles.nameEditor}>
      <input
        className={styles.nameInput}
        aria-label="Your name"
        value={draft}
        maxLength={32}
        autoComplete="nickname"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit(draft)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
      <button
        type="button"
        className={styles.iconButton}
        aria-label="New random name"
        onClick={() => commit(randomPlayerName(cryptoRandom))}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="4" width="16" height="16" rx="3" />
          <circle cx="9" cy="9" r="1.2" />
          <circle cx="15" cy="15" r="1.2" />
          <circle cx="15" cy="9" r="1.2" />
          <circle cx="9" cy="15" r="1.2" />
        </svg>
      </button>
    </span>
  );
}

/** What each outcome is called in the results. */
const OUTCOMES = { dnf: 'Didn’t finish', 'sat-out': 'Sat out' } as const;

/** The last round's results (SPEC §9): place, name, time, points and outcome. */
function RoundResults({
  result,
  self,
  names,
}: {
  result: RoundResult;
  self: PlayerId;
  names: ReadonlyMap<PlayerId, string>;
}) {
  let place = 0;
  return (
    <section className={styles.section} aria-labelledby="results-heading">
      <h2 id="results-heading" className={styles.heading}>
        Round {result.number} results
      </h2>
      <table className={styles.results}>
        <thead className="visually-hidden">
          <tr>
            <th scope="col">Place</th>
            <th scope="col">Player</th>
            <th scope="col">Time</th>
            <th scope="col">Points</th>
          </tr>
        </thead>
        <tbody>
          {result.places.map((p) => {
            const finished = p.outcome === 'finished';
            if (finished) place++;
            return (
              <tr key={p.id} data-you={p.id === self ? '' : undefined}>
                <td className={styles.place}>{finished ? ordinal(place) : '–'}</td>
                <th scope="row" className={styles.resultName}>
                  {names.get(p.id) ?? 'Player'}
                  {p.id === self && <span className={styles.tag}>You</span>}
                </th>
                <td className={finished ? styles.resultTime : styles.outcome}>
                  {finished && p.ms !== null
                    ? formatTime(p.ms, { tenths: true })
                    : OUTCOMES[p.outcome as keyof typeof OUTCOMES]}
                </td>
                <td className={styles.points}>+{p.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
