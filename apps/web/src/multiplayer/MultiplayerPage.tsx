import {
  cryptoRandom,
  generateRoomName,
  isDirectoryError,
  isValidRoomName,
  MAX_PRESENT,
  normaliseRoomName,
  randomPlayerName,
  type RoomDirectory,
} from '@cranny/multiplayer';
import { useId, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import styles from './MultiplayerPage.module.css';
import { playerName, setPlayerName } from './playerName.ts';
import { seatIdFor } from './seat.ts';
import { handOff } from './session.ts';

/** Why joining a room failed, as the room screen reports it back here. */
export type JoinError = 'not-found' | 'full' | 'invalid' | 'unavailable';

/** Router state the room screen sends back with when it can't join. */
export type JoinErrorState = { joinError: JoinError; room: string };

/** Whether router state carries a join error. */
const isJoinErrorState = (state: unknown): state is JoinErrorState =>
  typeof state === 'object' &&
  state !== null &&
  typeof (state as JoinErrorState).joinError === 'string' &&
  typeof (state as JoinErrorState).room === 'string';

/** How many generated names to try before giving up (each is almost certainly free). */
const CREATE_ATTEMPTS = 5;

const UNAVAILABLE = 'Couldn’t reach the server. Check your connection and try again.';
const INVALID = 'Room names are 3–32 letters, numbers and hyphens.';

/** The message for a failed join (specs/2026-09-25-multiplayer/SPEC.md §9). */
export function joinErrorMessage(error: JoinError, room: string): string {
  switch (error) {
    case 'not-found':
      return `No room called ${room}. Check the name, or create a room.`;
    case 'full':
      return `That room is full (${MAX_PRESENT} players).`;
    case 'invalid':
      return INVALID;
    case 'unavailable':
      return UNAVAILABLE;
  }
}

/**
 * A room name as it's being typed: lowercase, with spaces, underscores and runs of hyphens made
 * into one hyphen. Unlike `normaliseRoomName` it keeps a trailing hyphen, so the next word can be
 * typed.
 */
export const typedRoomName = (input: string) =>
  input
    .toLowerCase()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+/, '');

/**
 * Claims a room name for a new room (SPEC §4): the custom name if there is one, otherwise
 * generated names until one is free. Hands the ticket to the room screen.
 *
 * @returns The room's name, or an error message to show.
 */
async function createRoom(
  directory: RoomDirectory,
  custom: string | null,
): Promise<{ room: string } | { error: string }> {
  for (let attempt = 0; attempt < (custom ? 1 : CREATE_ATTEMPTS); attempt++) {
    const room = custom ?? generateRoomName(cryptoRandom);
    const self = seatIdFor(room);
    const result = await directory.create(room, self);
    if (!isDirectoryError(result)) {
      handOff(result, self, true);
      return { room };
    }
    if (result.error === 'unavailable') return { error: UNAVAILABLE };
    if (result.error === 'invalid') return { error: INVALID };
    // Taken: a custom name is reported; a generated one is silently drawn again.
    if (custom) return { error: 'That name is in use.' };
  }
  return { error: UNAVAILABLE };
}

/**
 * The Multiplayer screen, `/multiplayer` (specs/2026-09-25-multiplayer/SPEC.md §9): the player's
 * name, Create a room (with a generated or chosen name) and Join a room. Errors show inline,
 * including ones the room screen sends back here in router state.
 */
export function MultiplayerPage({ directory }: { directory: RoomDirectory }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [sentBack] = useState(() => (isJoinErrorState(location.state) ? location.state : null));

  const [name, setName] = useState(playerName);
  const [customName, setCustomName] = useState('');
  const [joinName, setJoinName] = useState(sentBack?.room ?? '');
  const [createError, setCreateError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(
    sentBack ? joinErrorMessage(sentBack.joinError, sentBack.room) : null,
  );
  const [busy, setBusy] = useState(false);
  const ids = {
    name: useId(),
    custom: useId(),
    warning: useId(),
    join: useId(),
    joinError: useId(),
    createError: useId(),
  };

  /** Keeps the typed name, remembering it if it's usable. */
  const changeName = (value: string) => {
    setName(value);
    setPlayerName(value);
  };

  /** Shows the name as it will be used once the field is left. */
  const settleName = () => setName(playerName());

  /** Creates a room and opens it. */
  const create = async (event: FormEvent) => {
    event.preventDefault();
    const custom = normaliseRoomName(customName);
    if (custom !== '' && !isValidRoomName(custom)) {
      setCreateError(INVALID);
      return;
    }
    setBusy(true);
    setCreateError(null);
    const result = await createRoom(directory, custom === '' ? null : custom);
    setBusy(false);
    if ('error' in result) setCreateError(result.error);
    else void navigate(`/m/${result.room}`);
  };

  /** Checks the room exists, then opens it. The room screen reports a full room. */
  const join = async (event: FormEvent) => {
    event.preventDefault();
    const room = normaliseRoomName(joinName);
    if (!isValidRoomName(room)) {
      setJoinError(INVALID);
      return;
    }
    setBusy(true);
    setJoinError(null);
    const self = seatIdFor(room);
    const result = await directory.join(room, self);
    setBusy(false);
    if (isDirectoryError(result)) {
      setJoinError(joinErrorMessage(result.error, room));
      return;
    }
    handOff(result, self, false);
    void navigate(`/m/${room}`);
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link to="/" className={styles.back} aria-label="Home">
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </Link>
        <h1 className={styles.title}>Multiplayer</h1>
      </header>

      <section className={styles.section}>
        <h2 className={styles.heading}>
          <label htmlFor={ids.name}>Your name</label>
        </h2>
        <div className={styles.row}>
          <input
            id={ids.name}
            className={styles.input}
            value={name}
            maxLength={32}
            autoComplete="nickname"
            onChange={(e) => changeName(e.target.value)}
            onBlur={settleName}
          />
          <button
            type="button"
            className={styles.secondary}
            onClick={() => changeName(randomPlayerName(cryptoRandom))}
          >
            New random name
          </button>
        </div>
      </section>

      <form className={styles.section} onSubmit={(e) => void create(e)}>
        <h2 className={styles.heading}>Create a room</h2>
        <button type="submit" className={styles.primary} disabled={busy}>
          Create a room
        </button>
        <details className={styles.disclosure}>
          <summary>Choose the room name</summary>
          <label htmlFor={ids.custom} className={styles.label}>
            Room name
          </label>
          <input
            id={ids.custom}
            className={styles.input}
            value={customName}
            placeholder="e.g. friday-night"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-describedby={ids.warning}
            onChange={(e) => setCustomName(typedRoomName(e.target.value))}
          />
          <p id={ids.warning} className={styles.note}>
            Short or common names are easy to guess. Anyone who knows the name can join.
          </p>
        </details>
        {createError && (
          <p className={styles.error} role="alert" id={ids.createError}>
            {createError}
          </p>
        )}
      </form>

      <form className={styles.section} onSubmit={(e) => void join(e)}>
        <h2 className={styles.heading}>
          <label htmlFor={ids.join}>Join a room</label>
        </h2>
        <div className={styles.row}>
          <input
            id={ids.join}
            className={styles.input}
            value={joinName}
            placeholder="amber-otter-quilt"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={joinError ? true : undefined}
            aria-describedby={joinError ? ids.joinError : undefined}
            onChange={(e) => setJoinName(typedRoomName(e.target.value))}
          />
          <button type="submit" className={styles.secondary} disabled={busy}>
            Join
          </button>
        </div>
        {joinError && (
          <p className={styles.error} role="alert" id={ids.joinError}>
            {joinError}
          </p>
        )}
      </form>
    </main>
  );
}
