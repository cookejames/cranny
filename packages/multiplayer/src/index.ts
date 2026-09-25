// Cranny multiplayer: room protocol, room logic, scoring and the vendor-neutral transport and
// directory interfaces. Pure TypeScript, no DOM, Node or vendor SDK types
// (specs/2026-09-25-multiplayer/SPEC.md §3). Test doubles and the adapter conformance suite are
// in `@cranny/multiplayer/testing`.
export {
  HELLO_RETRY_MS,
  HOST_FALLBACK_MS,
  LEAVE_WAIT_MS,
  RESEND_INTERVAL_MS,
  RoomClient,
  SNAPSHOT_INTERVAL_MS,
  type RoomClientOptions,
  type RoomPhase,
  type RoomView,
} from './client.ts';
export { systemClock, type Clock, type TimerHandle } from './clock.ts';
export {
  isDirectoryError,
  KEEP_ALIVE_INTERVAL_MS,
  LEASE_MS,
  type CreateError,
  type JoinError,
  type RefreshError,
  type RoomCredential,
  type RoomDirectory,
  type RoomTicket,
} from './directory.ts';
export {
  cleanPlayerName,
  displayNames,
  generateRoomName,
  isCleanPlayerName,
  isValidRoomName,
  normaliseRoomName,
  PLAYER_NAME_MAX_LENGTH,
  randomPlayerName,
  ROOM_NAME_MAX_LENGTH,
  ROOM_NAME_MIN_LENGTH,
} from './names.ts';
export {
  decodeMessage,
  encodeMessage,
  MAX_MESSAGE_BYTES,
  parseSnapshot,
  PROTOCOL_VERSION,
  type ClientMessage,
  type DecodeFailure,
  type DecodeResult,
  type Envelope,
  type HostMessage,
  type Message,
  type PlayerId,
  type RoomSnapshot,
  type Round,
  type RoundOutcome,
  type RoundResult,
  type RoundStatus,
  type Seat,
} from './protocol.ts';
export {
  cryptoRandom,
  isPlayerId,
  randomPlayerId,
  randomSeedFrom,
  type RandomSource,
} from './random.ts';
export {
  compareReigns,
  fromSnapshot,
  newRoom,
  nextHost,
  roomReducer,
  toSnapshot,
  type LiveRound,
  type RoomEnv,
  type RoomEvent,
  type RoomState,
} from './room.ts';
export {
  CLOSE_OUT_MS,
  MAX_PRESENT,
  MAX_SEATS,
  MIN_PLAYERS,
  PIECE_COUNT,
  READY_TIMEOUT_MS,
  REVEAL_COUNTDOWN_MS,
} from './rules.ts';
export { pointsFor, roundResult } from './scoring.ts';
export type { ConnectionStatus, RoomConnection, RoomTransport, Unsubscribe } from './transport.ts';
