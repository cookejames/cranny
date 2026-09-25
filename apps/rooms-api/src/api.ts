import {
  isDirectoryError,
  isPlayerId,
  isValidRoomName,
  type RoomDirectory,
} from '@cranny/multiplayer';

// The directory's HTTP API (specs/2026-09-25-multiplayer/SPEC.md §7), independent of Lambda so
// it can be tested directly. Every route is `POST /api/rooms/<action>` with a JSON body
// `{ "room": <canonical name>, "self": <player id> }`.

/** The routes, one per {@link RoomDirectory} call. `refresh` is `refreshCredential`. */
export const ACTIONS = ['create', 'join', 'rejoin', 'refresh'] as const;
export type Action = (typeof ACTIONS)[number];

/** Bigger bodies are rejected unread: a real one is well under 100 bytes. */
export const MAX_BODY_BYTES = 1024;

export type ApiResponse = { status: number; body: unknown };

/**
 * An error response in the directory's own terms. Directory answers are 200 whatever they say,
 * because CloudFront turns any 403 or 404 into the app shell for deep links (infra/cdn.tf); only
 * `unavailable` is a 503.
 */
const failure = (error: string): ApiResponse => ({
  status: error === 'unavailable' ? 503 : 200,
  body: { error },
});

/** Whether `action` is one of the routes. */
export const isAction = (action: string): action is Action =>
  (ACTIONS as readonly string[]).includes(action);

/**
 * Handles one directory request: validates the body, calls the directory, and turns the result
 * into a response: a ticket, a credential or `{ error }`, with the status from {@link failure}.
 *
 * @param rawBody - The request body as received; anything that isn't a small JSON object with a
 *   valid room name and player id is `invalid`.
 */
export async function handleRequest(
  action: Action,
  rawBody: string | null,
  directory: RoomDirectory,
): Promise<ApiResponse> {
  if (rawBody === null || rawBody.length > MAX_BODY_BYTES) return failure('invalid');
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return failure('invalid');
  }
  const { room, self } = (typeof body === 'object' && body !== null ? body : {}) as Record<
    string,
    unknown
  >;
  if (typeof room !== 'string' || !isValidRoomName(room) || !isPlayerId(self)) {
    return failure('invalid');
  }
  // `refresh` takes a room name, not a channel, so a credential can only ever be for a room's
  // own channel. It is `rejoin` without the rest of the ticket.
  const result = await (action === 'rejoin' || action === 'refresh'
    ? directory.rejoin(room, self)
    : directory[action](room, self));
  if (isDirectoryError(result)) return failure(result.error);
  return { status: 200, body: action === 'refresh' ? result.credential : result };
}
