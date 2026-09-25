import type {
  CreateError,
  JoinError,
  PlayerId,
  RefreshError,
  RejoinError,
  RoomCredential,
  RoomDirectory,
  RoomTicket,
} from '@cranny/multiplayer';

// The production room directory client (specs/2026-09-25-multiplayer/SPEC.md §7): calls the
// rooms API (`apps/rooms-api`), served from the same origin under /api/rooms. Answers are checked
// before use, and anything unexpected counts as `unavailable`.

/** Where the rooms API lives: same origin, routed by CloudFront (SPEC §13). */
export const ROOMS_API = '/api/rooms';
/** How long to wait for the API before giving up. */
export const REQUEST_TIMEOUT_MS = 8_000;

export type HttpDirectoryOptions = { fetch?: typeof fetch; baseUrl?: string };

type Action = 'create' | 'join' | 'rejoin' | 'refresh';

/** The errors each call can return, besides `unavailable`, which any call can. */
const ERRORS: Record<Action, readonly string[]> = {
  create: ['taken', 'invalid'],
  join: ['not-found', 'invalid'],
  rejoin: ['invalid'],
  refresh: [],
};

/** Whether a value is a credential the API could have sent. */
function isCredential(value: unknown): value is RoomCredential {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.value === 'string' &&
    typeof c.expiresInMs === 'number' &&
    Number.isFinite(c.expiresInMs) &&
    c.expiresInMs > 0
  );
}

/** Whether a value is a ticket for `room`. */
function isTicketFor(value: unknown, room: string): value is RoomTicket {
  if (typeof value !== 'object' || value === null) return false;
  const t = value as Record<string, unknown>;
  return t.room === room && typeof t.channel === 'string' && isCredential(t.credential);
}

/** {@link RoomDirectory} over the rooms API. */
export class HttpDirectory implements RoomDirectory {
  private readonly fetch: typeof fetch;
  private readonly baseUrl: string;

  /** @param options - Test seams; the defaults are the browser's `fetch` and {@link ROOMS_API}. */
  constructor(options: HttpDirectoryOptions = {}) {
    this.fetch = options.fetch ?? ((...args) => fetch(...args));
    this.baseUrl = options.baseUrl ?? ROOMS_API;
  }

  /** A ticket for a new room, unless someone is in one with this name. */
  create(name: string, self: PlayerId): Promise<RoomTicket | CreateError> {
    return this.ticket('create', name, self) as Promise<RoomTicket | CreateError>;
  }

  /** A ticket for a room someone is in. */
  join(name: string, self: PlayerId): Promise<RoomTicket | JoinError> {
    return this.ticket('join', name, self) as Promise<RoomTicket | JoinError>;
  }

  /** A ticket for a room this tab already has a seat in. */
  rejoin(name: string, self: PlayerId): Promise<RoomTicket | RejoinError> {
    return this.ticket('rejoin', name, self) as Promise<RoomTicket | RejoinError>;
  }

  /** A fresh credential for the ticket's room. */
  async refreshCredential(
    ticket: RoomTicket,
    self: PlayerId,
  ): Promise<RoomCredential | RefreshError> {
    const answer = await this.call('refresh', ticket.room, self);
    return isCredential(answer) ? answer : { error: 'unavailable' };
  }

  /** Calls a ticket route and checks the answer is a ticket for `room` or a known error. */
  private async ticket(
    action: Exclude<Action, 'refresh'>,
    room: string,
    self: PlayerId,
  ): Promise<RoomTicket | { error: string }> {
    const answer = await this.call(action, room, self);
    if (isTicketFor(answer, room)) return answer;
    const error = (answer as { error?: unknown } | null)?.error;
    return typeof error === 'string' && ERRORS[action].includes(error)
      ? { error }
      : { error: 'unavailable' };
  }

  /** POSTs to a route and returns the parsed JSON body, or null if there isn't one. */
  private async call(action: Action, room: string, self: PlayerId): Promise<unknown> {
    try {
      const response = await this.fetch(`${this.baseUrl}/${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ room, self }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      return (await response.json()) as unknown;
    } catch {
      return null;
    }
  }
}
