import { BOARD_SIZE, generateGrid, PIECE_IDS, solve } from '@cranny/engine';
import {
  CLOSE_OUT_MS,
  encodeMessage,
  isDirectoryError,
  PROTOCOL_VERSION,
  REVEAL_COUNTDOWN_MS,
  type PlayerId,
  type RoomClient,
  type RoomSnapshot,
} from '@cranny/multiplayer';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOARD_SPAN, CELL_GAP } from '../board/metrics.ts';
import { SETTLE_MS } from '../drag/useDrag.ts';
import { CELEBRATION_MS } from '../play/PlayScreen.tsx';
import {
  loadMultiplayerPrefs,
  loadMultiplayerRound,
  loadSeat,
  saveMultiplayerRound,
  saveSeat,
} from '../storage/storage.ts';
import { currentPath, RoomHarness, settle, uiId } from './harness.tsx';
import { LOST_AFTER_MS } from './RoomScreen.tsx';
import { TIMES_UP_MS } from './RoomRound.tsx';
import { fakeLocks } from './testing.ts';

// The multiplayer screens over FakeTransport and FakeDirectory
// (specs/2026-09-25-multiplayer/SPEC.md §14 Web component tests). The player in the UI plays
// against RoomClients driven directly by the test.

const B: PlayerId = 'B'.repeat(22);
const C: PlayerId = 'C'.repeat(22);

let harness: RoomHarness;
let transport: RoomHarness['transport'];
let directory: RoomHarness['directory'];
const path = currentPath;
const renderTab = (pathname: string) => harness.renderTab(pathname);
const createRoom = () => harness.createRoom();
const addPlayer = (room: string, self: PlayerId, name: string, created = false) =>
  harness.addPlayer(room, self, name, created);
const startRound = (players: RoomClient[], reveal = true) => harness.startRound(players, reveal);

// jsdom has no layout: the board's cells sit at the origin with 40 px cells, and every tray
// preview at TRAY_TOP with 11 px cells, as in PlayScreen.drag.test.tsx.
const CELL = 40;
const PITCH = CELL * (1 + CELL_GAP);
const TRAY_TOP = 400;

/** A DOMRect-like square. */
const box = (left: number, top: number, width: number) =>
  ({ left, top, width, height: width, right: left + width, bottom: top + width }) as DOMRect;

/** Drags the Single from the tray onto board cell `cell`. */
function dropSingle(cell: number) {
  const [row, col] = [Math.floor(cell / BOARD_SIZE), cell % BOARD_SIZE];
  const pointer = (x: number, y: number) => ({
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    button: 0,
    clientX: x,
    clientY: y,
  });
  const to = { x: col * PITCH + CELL / 2, y: row * PITCH + CELL / 2 };
  fireEvent.pointerDown(screen.getByRole('button', { name: /^Single/ }), pointer(5, TRAY_TOP + 5));
  fireEvent.pointerMove(window, pointer(200, 200));
  fireEvent.pointerMove(window, pointer(to.x, to.y));
  fireEvent.pointerUp(window, pointer(to.x, to.y));
}

beforeEach(() => {
  vi.useFakeTimers();
  harness = new RoomHarness();
  ({ transport, directory } = harness);
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.getAttribute('role') === 'grid') return box(0, 0, BOARD_SPAN * CELL);
    if (this.tagName === 'svg' && this.closest('button[data-piece]')) return box(0, TRAY_TOP, 11);
    return box(0, 0, 0);
  });
});

afterEach(async () => {
  await harness.close();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('the Multiplayer screen', () => {
  it('creates a room with a generated name and opens its lobby', async () => {
    await createRoom();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(path().slice(3));
    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ready' })).toBeDisabled();
    expect(screen.getByText('Waiting for another player')).toBeInTheDocument();
  });

  it('creates a room with a chosen name, and says when it is in use', async () => {
    await directory.create('friday-night', C);
    renderTab('/multiplayer');
    await settle();
    fireEvent.click(screen.getByText('Choose the room name'));
    fireEvent.change(screen.getByLabelText('Room name'), { target: { value: 'Friday Night' } });
    expect(screen.getByLabelText('Room name')).toHaveValue('friday-night');
    fireEvent.click(screen.getByRole('button', { name: 'Create a room' }));
    await settle(100);
    expect(screen.getByRole('alert')).toHaveTextContent('That name is in use.');
    fireEvent.change(screen.getByLabelText('Room name'), { target: { value: 'saturday' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create a room' }));
    await settle(100);
    expect(path()).toBe('/m/saturday');
  });

  it('draws another generated name if the first is taken', async () => {
    const taken = vi.spyOn(directory, 'create').mockResolvedValueOnce({ error: 'taken' });
    await createRoom();
    expect(taken).toHaveBeenCalledTimes(2);
  });

  it('shows join errors inline', async () => {
    renderTab('/multiplayer');
    await settle();
    const field = screen.getByLabelText('Join a room');
    fireEvent.change(field, { target: { value: 'Amber Otter Quilt' } });
    expect(field).toHaveValue('amber-otter-quilt');
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    await settle(100);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'No room called amber-otter-quilt. Check the name, or create a room.',
    );
    directory.available = false;
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    await settle(100);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Couldn’t reach the server. Check your connection and try again.',
    );
  });

  it('remembers the player’s name and draws a random one on request', async () => {
    renderTab('/multiplayer');
    await settle();
    const field = screen.getByLabelText('Your name');
    fireEvent.change(field, { target: { value: 'Jo' } });
    expect(localStorage.getItem('cranny.player.v1')).toBe('{"name":"Jo"}');
    fireEvent.click(screen.getByRole('button', { name: 'New random name' }));
    expect(field).not.toHaveValue('Jo');
  });

  it('sends a player trying a full room back with an explanation', async () => {
    const room = 'full-house';
    await addPlayer(room, 'H'.repeat(22), 'Host', true);
    for (let i = 0; i < 7; i++) await addPlayer(room, String(i).repeat(22), `P${i}`);
    renderTab(`/m/${room}`);
    await settle(1_000);
    expect(path()).toBe('/multiplayer');
    expect(screen.getByRole('alert')).toHaveTextContent('That room is full (8 players).');
    expect(screen.getByLabelText('Join a room')).toHaveValue(room);
  });

  it('sends a link to a room that doesn’t exist back to the Multiplayer screen', async () => {
    renderTab('/m/Nobody_Here');
    await settle(100);
    expect(path()).toBe('/multiplayer');
    expect(screen.getByRole('alert')).toHaveTextContent('No room called nobody-here.');
  });
});

describe('the lobby', () => {
  it('lists players with scores, ready ticks, away markers and You', async () => {
    const room = await createRoom();
    const teal = await addPlayer(room, B, 'Teal Otter');
    await addPlayer(room, C, 'Teal Otter');
    const list = screen.getByRole('list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(within(list).getByText('Teal Otter')).toBeInTheDocument();
    expect(within(list).getByText('Teal Otter 2')).toBeInTheDocument();
    teal.setReady(true);
    await settle(200);
    expect(within(list).getAllByText('Ready')).toHaveLength(1);
    await teal.close();
    await settle(200);
    expect(within(list).getByText('away')).toBeInTheDocument();
  });

  it('shows the ready countdown once more than half are ready', async () => {
    const room = await createRoom();
    const b = await addPlayer(room, B, 'Teal Otter');
    await addPlayer(room, C, 'Rose Lynx');
    fireEvent.click(screen.getByRole('button', { name: 'Ready' }));
    b.setReady(true);
    await settle(200);
    expect(screen.getByRole('button', { name: 'Ready' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('timer')).toHaveTextContent('Starting in 0:30 · 1 player not ready');
  });

  it('renames the player in place', async () => {
    const room = await createRoom();
    const b = await addPlayer(room, B, 'Teal Otter');
    const field = screen.getByLabelText('Your name');
    fireEvent.change(field, { target: { value: '  Sam  ' } });
    fireEvent.blur(field);
    await settle(200);
    expect(screen.getByLabelText('Your name')).toHaveValue('Sam');
    expect(b.view().room!.seats.find((s) => s.id === uiId())!.name).toBe('Sam');
  });
});

describe('a round', () => {
  it('hides the blocked squares until the reveal, then starts the stopwatch', async () => {
    const room = await createRoom();
    const b = await addPlayer(room, B, 'Teal Otter');
    await startRound([b], false);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.queryAllByRole('gridcell', { name: /blocked/ })).toHaveLength(0);
    await settle(REVEAL_COUNTDOWN_MS);
    expect(screen.getAllByRole('gridcell', { name: /blocked/ })).toHaveLength(7);
    await settle(2_000);
    expect(screen.getByRole('timer')).toHaveTextContent('0:02');
    expect(screen.queryByRole('button', { name: 'New grid' })).not.toBeInTheDocument();
  });

  it('shows the others’ progress, most complete first, and can hide it', async () => {
    const room = await createRoom();
    const b = await addPlayer(room, B, 'Teal Otter');
    const c = await addPlayer(room, C, 'Rose Lynx');
    await startRound([b, c]);
    const bars = () =>
      screen.getAllByRole('progressbar').map((bar) => bar.getAttribute('aria-label'));
    expect(bars()).toEqual(['Teal Otter, 0 of 9 pieces', 'Rose Lynx, 0 of 9 pieces']);
    c.reportProgress(1, 4);
    await settle(200);
    expect(bars()).toEqual(['Rose Lynx, 4 of 9 pieces', 'Teal Otter, 0 of 9 pieces']);
    // A tie keeps the current order.
    b.reportProgress(1, 4);
    await settle(200);
    expect(bars()).toEqual(['Rose Lynx, 4 of 9 pieces', 'Teal Otter, 4 of 9 pieces']);

    fireEvent.click(screen.getByRole('button', { name: 'Hide progress' }));
    expect(screen.queryAllByRole('progressbar')).toHaveLength(0);
    expect(screen.queryByText(/progress hidden/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Other players’ progress' })).not.toBeInTheDocument();
    expect(loadMultiplayerPrefs().hideProgress).toBe(true);
  });

  it('counts down after the first finish, then locks the board and shows the results', async () => {
    const room = await createRoom();
    const b = await addPlayer(room, B, 'Teal Otter');
    await startRound([b]);
    b.reportFinished(1, 42_300);
    await settle(200);
    expect(screen.getByText('Teal Otter finished first')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^0:30 left/);
    expect(screen.getByRole('progressbar')).toHaveAccessibleName('Teal Otter, finished 1st');
    expect(screen.getByText('Teal Otter finished first. 30 seconds left.')).toBeInTheDocument();

    await settle(CLOSE_OUT_MS);
    expect(screen.getByText('Time’s up')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rotate' })).toBeDisabled();
    expect(loadMultiplayerRound()).toBeNull();

    await settle(TIMES_UP_MS);
    const results = screen.getByRole('table');
    const rows = within(results).getAllByRole('row').slice(1);
    expect(rows.map((r) => r.textContent)).toEqual([
      '1stTeal Otter0:42.3+5',
      expect.stringMatching(/^–.*YouDidn’t finish\+0$/),
    ]);
    expect(screen.getByRole('heading', { name: 'Totals' })).toBeInTheDocument();
    const totals = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(totals[0]).toHaveTextContent('Teal Otter');
    expect(totals[0]).toHaveTextContent('5 points');
    expect(screen.getByRole('button', { name: 'Play another' })).toBeInTheDocument();
  });

  it('lets a late joiner watch, and play from the next round', async () => {
    const room = await createRoom();
    const b = await addPlayer(room, B, 'Teal Otter');
    const c = await addPlayer(room, C, 'Rose Lynx');
    await startRound([b, c]);
    // A second tab (a new tab has its own session storage) joins mid-round.
    sessionStorage.clear();
    renderTab(`/m/${room}`);
    await settle(500);
    expect(screen.getByText('You’ll play from the next round')).toBeInTheDocument();
  });

  it('restores the board after a reload, and finishing shows the waiting view', async () => {
    const room = await createRoom();
    const b = await addPlayer(room, B, 'Teal Otter');
    await startRound([b]);
    const self = uiId();
    // Reload: the tab goes away (as the host, so B takes over) and comes back.
    const grid = b.view().room!.round.grid!;
    const saved = loadMultiplayerRound()!;
    expect(saved).toMatchObject({ room, round: 1, ...grid, finishedMs: null });
    // Every piece but the Single on the board, as if placed before the reload.
    const solution = solve(generateGrid(grid.seed, grid.version).blocked)!;
    const placements = Object.fromEntries(
      PIECE_IDS.filter((id) => id !== 'M1').map((id) => [id, solution[id]]),
    );
    const orientations = Object.fromEntries(PIECE_IDS.map((id) => [id, solution[id].orientation]));
    cleanup();
    await settle(1_000);
    saveMultiplayerRound({ ...saved, placements, orientations });
    saveSeat({ room, playerId: self });

    renderTab(`/m/${room}`);
    await settle(1_000);
    expect(uiId()).toBe(self);
    expect(screen.getAllByRole('gridcell', { name: /: Domino$/ })).toHaveLength(2);
    expect(b.view().room!.seats).toHaveLength(2);
    // The restored board is reported, so the others see this player's progress.
    expect(b.view().room!.round.progress[self]).toBe(8);

    dropSingle(solution.M1.origin);
    await settle(SETTLE_MS + 200);
    expect(b.view().room!.round.finishes.map((f) => f.id)).toEqual([self]);
    await settle(CELEBRATION_MS);
    expect(screen.getByRole('heading', { name: 'You finished 1st' })).toBeInTheDocument();
    expect(loadMultiplayerRound()?.finishedMs).toEqual(expect.any(Number));
  });
});

describe('?solve', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reveals each round one drop from solved, in development only', async () => {
    const b = await addPlayer('solve-room', B, 'Teal Otter', true);
    renderTab('/m/solve-room?solve');
    await settle(500);
    await startRound([b]);
    expect(screen.getAllByRole('gridcell', { name: /: Domino$/ })).toHaveLength(2);
    expect(b.view().room!.round.progress[uiId()]).toBe(8);

    cleanup();
    sessionStorage.clear();
    await settle(1_000);
    vi.stubEnv('DEV', false);
    const c = await addPlayer('plain-room', C, 'Rose Lynx', true);
    renderTab('/m/plain-room?solve');
    await settle(500);
    await startRound([c]);
    expect(screen.queryAllByRole('gridcell', { name: /: Domino$/ })).toHaveLength(0);
  });
});

describe('seats', () => {
  it('makes two tabs on one room two players, and keeps a seat through a reload', async () => {
    const room = await createRoom();
    const b = await addPlayer(room, B, 'Teal Otter');
    const first = uiId();
    sessionStorage.clear();
    const second = renderTab(`/m/${room}`);
    await settle(500);
    expect(uiId()).not.toBe(first);
    expect(b.view().room!.seats).toHaveLength(3);

    const secondId = uiId();
    second.unmount();
    await settle(500);
    saveSeat({ room, playerId: secondId });
    renderTab(`/m/${room}`);
    await settle(500);
    expect(uiId()).toBe(secondId);
    expect(b.view().room!.seats).toHaveLength(3);
  });

  it('gives a duplicated tab a new seat', async () => {
    const locks = fakeLocks();
    Object.defineProperty(navigator, 'locks', { value: locks, configurable: true });
    try {
      const room = await createRoom();
      const b = await addPlayer(room, B, 'Teal Otter');
      const original = uiId();
      // The duplicate starts with a copy of the original tab's session storage.
      renderTab(`/m/${room}`);
      await settle(500);
      expect(uiId()).not.toBe(original);
      expect(b.view().room!.seats).toHaveLength(3);
    } finally {
      Reflect.deleteProperty(navigator, 'locks');
    }
  });
});

describe('leaving', () => {
  it('asks first, and on Leave removes the seat and goes Home', async () => {
    const room = await createRoom();
    const b = await addPlayer(room, B, 'Teal Otter');
    const self = uiId();

    fireEvent.click(screen.getByRole('button', { name: 'Leave the room' }));
    const dialog = screen.getByRole('dialog', { name: `Leave ${room}?` });
    expect(dialog).toHaveAccessibleDescription(/your score will be removed/);
    expect(within(dialog).getByRole('button', { name: 'Stay' })).toHaveFocus();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Stay' }));
    expect(dialog).not.toHaveAttribute('open');

    fireEvent.click(screen.getByRole('button', { name: 'Leave the room' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Leave' }));
    await settle(3_000);
    expect(path()).toBe('/');
    expect(loadSeat()).toBeNull();
    expect(b.view().room!.seats.map((s) => s.id)).not.toContain(self);
  });
});

describe('connection states', () => {
  it('shows Reconnecting…, then the lost-connection screen, and Try again rejoins', async () => {
    const room = await createRoom();
    await addPlayer(room, B, 'Teal Otter');
    const mine = transport.connections().find((c) => c.self === uiId())!;
    transport.drop(mine);
    await settle(200);
    expect(screen.getByText('Reconnecting…')).toBeInTheDocument();
    await settle(LOST_AFTER_MS);
    expect(
      screen.getByRole('heading', { name: 'Lost connection to the room' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await settle(1_000);
    expect(screen.getByRole('heading', { name: room })).toBeInTheDocument();
    expect(screen.queryByText('Reconnecting…')).not.toBeInTheDocument();
  });

  it('asks for a newer version when the round’s grid is too new', async () => {
    const room = await createRoom();
    const self = uiId();
    // A host from a later term, as a newer client would be, deals a grid this client can't make.
    const host = 'Z'.repeat(22);
    const ticket = await directory.join(room, host);
    if (isDirectoryError(ticket)) throw new Error(ticket.error);
    const connection = await transport.connect(ticket, host);
    const snapshot: RoomSnapshot = {
      protocol: PROTOCOL_VERSION,
      room,
      term: 9,
      rev: 1,
      hostId: host,
      hostJoinOrder: 0,
      seats: [
        { id: host, name: 'Future', joinOrder: 0, score: 0 },
        { id: self, name: 'Me', joinOrder: 1, score: 0 },
      ],
      round: {
        number: 1,
        status: 'playing',
        grid: { version: 99, seed: 1 },
        participants: [host, self],
        ready: [],
        progress: {},
        finishes: [],
        readyClosesInMs: null,
        revealInMs: null,
        closesInMs: null,
      },
      lastResult: null,
    };
    await connection.publish(encodeMessage(host, { type: 'snapshot', snapshot }));
    await settle(200);
    expect(
      screen.getByText('This round needs a newer version of Cranny. Refresh to update.'),
    ).toBeInTheDocument();
    await connection.close();
  });
});
