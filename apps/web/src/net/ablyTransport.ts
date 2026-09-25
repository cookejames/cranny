import type {
  ConnectionStatus,
  PlayerId,
  RoomConnection,
  RoomDirectory,
  RoomTicket,
  RoomTransport,
  Unsubscribe,
} from '@cranny/multiplayer';
import type { ConnectionState, RealtimeChannel } from 'ably';
import type { BaseRealtime } from 'ably/modular';

// The production transport (specs/2026-09-25-multiplayer/SPEC.md §6; ABLY.md). One Ably
// connection per room connection, authenticated with the ticket's room-scoped JWT, which binds
// the player's id as the Ably clientId. The modular SDK keeps only WebSockets, fetch and presence,
// and is loaded on the first connect, so it stays out of the main bundle (solo players never
// download it).

/** Loads the Ably SDK: its own chunk, fetched once. */
const loadAbly = () => import('ably/modular');

/**
 * Ably's defaults take 42 s to notice a silent drop; these bring it to about 22 s, and 5 s for a
 * crashed tab, inside SPEC §6.2's 30 s (ABLY.md §2).
 */
export const TRANSPORT_PARAMS = { heartbeatInterval: 10_000, remainPresentFor: 5_000 };
/** How long `connect` waits for Ably before giving up. */
export const CONNECT_TIMEOUT_MS = 15_000;
/** How long `close` waits for Ably to confirm. */
const CLOSE_TIMEOUT_MS = 2_000;
/** The name every message is published under; the protocol is in the data. */
const MESSAGE_NAME = 'm';

/**
 * A room connection's status for an Ably connection state. `connecting` after the first
 * connection is Ably reconnecting, so it's `reconnecting` too.
 */
export function statusFor(state: ConnectionState, everConnected: boolean): ConnectionStatus {
  switch (state) {
    case 'connected':
      return 'connected';
    case 'initialized':
    case 'connecting':
      return everConnected ? 'reconnecting' : 'connecting';
    case 'disconnected':
    case 'suspended':
      return 'reconnecting';
    case 'closing':
    case 'closed':
    case 'failed':
      return 'closed';
  }
}

/** Each client id once, in the order first seen. */
const distinctClients = (members: { clientId?: string | undefined }[]): PlayerId[] => [
  ...new Set(members.flatMap((m) => (typeof m.clientId === 'string' ? [m.clientId] : []))),
];

export type AblyTransportOptions = {
  /** Where fresh credentials come from when a token nears expiry. */
  directory: Pick<RoomDirectory, 'refreshCredential'>;
};

/** {@link RoomTransport} over Ably Pub/Sub, for `VITE_ROOM_TRANSPORT=ably`. */
export class AblyTransport implements RoomTransport {
  private readonly directory: Pick<RoomDirectory, 'refreshCredential'>;

  /** @param options - The directory that refreshes credentials. */
  constructor(options: AblyTransportOptions) {
    this.directory = options.directory;
  }

  /**
   * Connects to the ticket's channel, enters presence and reads who is there.
   *
   * @throws If the credential isn't a token, Ably refuses it, or Ably can't be reached within
   *   {@link CONNECT_TIMEOUT_MS}.
   */
  async connect(ticket: RoomTicket, self: PlayerId): Promise<AblyConnection> {
    if (typeof ticket.credential.value !== 'string') throw new Error('Not an Ably token');
    let first: string | null = ticket.credential.value;
    const { BaseRealtime, FetchRequest, RealtimePresence, WebSocketTransport } = await loadAbly();
    const client = new BaseRealtime({
      clientId: self,
      // The ticket's token first; after that Ably asks about 30 s before each token expires.
      authCallback: (_params, callback) => {
        if (first !== null) {
          const token = first;
          first = null;
          callback(null, token);
          return;
        }
        this.directory.refreshCredential(ticket, self).then(
          (result) =>
            'error' in result || typeof result.value !== 'string'
              ? callback('Couldn’t refresh the room credential', null)
              : callback(null, result.value),
          () => callback('Couldn’t refresh the room credential', null),
        );
      },
      transportParams: TRANSPORT_PARAMS,
      plugins: { WebSocketTransport, FetchRequest, RealtimePresence },
    });
    try {
      await connected(client);
      const connection = new AblyConnection(client, client.channels.get(ticket.channel), self);
      await connection.open();
      return connection;
    } catch (error) {
      client.close();
      throw error;
    }
  }
}

/** Resolves once the client is connected; rejects if it fails or takes too long. */
function connected(client: BaseRealtime): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.connection.off(listener);
      reject(new Error('Timed out connecting to Ably'));
    }, CONNECT_TIMEOUT_MS);
    const listener = () => {
      const state = client.connection.state;
      if (state !== 'connected' && state !== 'failed' && state !== 'closed') return;
      clearTimeout(timer);
      client.connection.off(listener);
      if (state === 'connected') resolve();
      else reject(new Error(`Ably connection ${state}`));
    };
    client.connection.on(listener);
    listener();
  });
}

/** One player's connection to one room's Ably channel. */
export class AblyConnection implements RoomConnection {
  private state: ConnectionStatus = 'connected';
  private members: PlayerId[];
  /** Guards against an older presence read replacing a newer one. */
  private presenceRead = 0;
  private readonly messageListeners = new Set<(message: unknown, from: PlayerId) => void>();
  private readonly presenceListeners = new Set<(present: PlayerId[]) => void>();
  private readonly statusListeners = new Set<(status: ConnectionStatus) => void>();

  /**
   * @param client - This connection's own Ably client; closed with it. Exposed for tests.
   * @param channel - The room's channel on that client.
   * @param self - The player, and the client id bound into its token.
   */
  constructor(
    readonly client: BaseRealtime,
    private readonly channel: RealtimeChannel,
    readonly self: PlayerId,
  ) {
    this.members = [self];
  }

  /** Subscribes, enters presence and reads the members, so `presence()` is complete. */
  async open(): Promise<void> {
    await this.channel.subscribe(MESSAGE_NAME, (message) => {
      if (typeof message.clientId !== 'string' || this.state === 'closed') return;
      for (const listener of [...this.messageListeners]) listener(message.data, message.clientId);
    });
    await this.channel.presence.subscribe(() => void this.readPresence(false));
    await this.channel.presence.enter();
    await this.readPresence(true);
    // Only made once connected, so a later `connecting` is always a reconnect.
    this.client.connection.on((change) => this.setStatus(statusFor(change.current, true)));
  }

  /** Publishes to the room. Ably rejecting it (e.g. rate limit 42913) rejects too. */
  async publish(message: unknown): Promise<void> {
    if (this.state !== 'connected') throw new Error(`Can't publish while ${this.state}`);
    await this.channel.publish(MESSAGE_NAME, message);
  }

  /** Subscribes to messages; `from` is the sender's Ably clientId, bound by its token. */
  onMessage(callback: (message: unknown, from: PlayerId) => void): Unsubscribe {
    this.messageListeners.add(callback);
    return () => this.messageListeners.delete(callback);
  }

  /** Who is present: each player once, however many connections they have (ABLY.md §2). */
  presence(): PlayerId[] {
    return [...this.members];
  }

  /** Subscribes to presence changes. */
  onPresence(callback: (present: PlayerId[]) => void): Unsubscribe {
    this.presenceListeners.add(callback);
    return () => this.presenceListeners.delete(callback);
  }

  /** The connection status. */
  status(): ConnectionStatus {
    return this.state;
  }

  /** Subscribes to status changes. */
  onStatus(callback: (status: ConnectionStatus) => void): Unsubscribe {
    this.statusListeners.add(callback);
    return () => this.statusListeners.delete(callback);
  }

  /** Closes the Ably connection, which takes this player out of presence at once. */
  async close(): Promise<void> {
    if (this.state === 'closed') return;
    this.setStatus('closed');
    const client = this.client;
    if (client.connection.state === 'closed' || client.connection.state === 'failed') return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, CLOSE_TIMEOUT_MS);
      client.connection.once('closed', () => {
        clearTimeout(timer);
        resolve();
      });
      client.close();
    });
  }

  /**
   * Re-reads the presence set and tells listeners if it changed.
   *
   * @param waitForSync - Wait for Ably's presence sync; only the first read needs to.
   */
  private async readPresence(waitForSync: boolean): Promise<void> {
    const read = ++this.presenceRead;
    let members: PlayerId[];
    try {
      members = distinctClients(await this.channel.presence.get({ waitForSync }));
    } catch {
      return; // A suspended channel; the next presence event reads again.
    }
    if (read !== this.presenceRead || this.state === 'closed') return;
    const now = [this.self, ...members.filter((id) => id !== this.self)];
    if (now.join() === this.members.join()) return;
    this.members = now;
    for (const listener of [...this.presenceListeners]) listener([...now]);
  }

  /** Changes the status and tells listeners. Nothing changes once closed. */
  private setStatus(status: ConnectionStatus): void {
    if (this.state === status || this.state === 'closed') return;
    this.state = status;
    for (const listener of [...this.statusListeners]) listener(status);
  }
}
