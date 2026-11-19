import {
  type ClientToServerEvents,
  type FlightSnapshot,
  flightRoom,
  type JoinResult,
  type RoomName,
  type SearchSnapshot,
  type SeatEvent,
  type ServerToClientEvents,
} from '@aeropulse/shared';
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import { RealtimeGateway } from '../../apps/api/src/realtime/realtime.gateway';
import {
  holdSeat,
  newClientId,
  type SeededDatabase,
  startApi,
  startSeededDatabase,
  type TestApi,
} from '../support/api';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * `socket.io-client` llega al `node_modules` de la raíz con el frontend; todavía
 * no está declarado en el backend (CCR-2).
 */
describe('gateway de Socket.IO', () => {
  let seeded: SeededDatabase;
  let api: TestApi;
  const sockets: ClientSocket[] = [];

  beforeAll(async () => {
    seeded = await startSeededDatabase();
    api = await startApi(seeded);
  });

  afterEach(() => {
    for (const socket of sockets.splice(0)) socket.disconnect();
  });

  afterAll(async () => {
    await api?.close();
    await seeded?.stop();
  });

  function connect(auth: Record<string, unknown> = {}): ClientSocket {
    const socket: ClientSocket = io(api.baseUrl, {
      path: '/ws',
      transports: ['websocket'],
      auth,
      reconnection: false,
      forceNew: true,
    });
    sockets.push(socket);
    return socket;
  }

  async function connected(auth: Record<string, unknown> = {}): Promise<ClientSocket> {
    const socket = connect(auth);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });
    return socket;
  }

  const join = (socket: ClientSocket, room: RoomName | string): Promise<JoinResult> =>
    socket.timeout(5_000).emitWithAck('join', room as RoomName);

  function nextSeatEvent(socket: ClientSocket): Promise<SeatEvent> {
    return new Promise((resolve) => socket.once('seat.changed', resolve));
  }

  it('join(search) responde serverNow del reloj de PostgreSQL', async () => {
    const socket = await connected();
    const result = await join(socket, 'search');

    expect(result.ok).toBe(true);
    const data = (result as { data: SearchSnapshot }).data;
    expect(Object.keys(data)).toEqual(['serverNow']);
    expect(data.serverNow).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  });

  it('join(flight) devuelve vuelo, asientos en orden y myHold nulo para un espectador', async () => {
    const flightId = seeded.nextFlightId();
    const socket = await connected();

    const result = await join(socket, flightRoom(flightId));

    expect(result.ok).toBe(true);
    const data = (result as { data: FlightSnapshot }).data;
    expect(data.flight).toMatchObject({ id: flightId, status: 'SCHEDULED', version: 1 });
    expect(data.seats).toHaveLength(24);
    expect(data.seats.slice(0, 5).map((s) => s.seatCode)).toEqual(['1A', '1B', '1C', '1D', '2A']);
    expect(data.seats[0]).toEqual({ flightId, seatCode: '1A', status: 'AVAILABLE', version: 1 });
    expect(data.myHold).toBeNull();
  });

  it('myHold solo para el titular de un bloqueo vigente; los demás ven el asiento HELD', async () => {
    const flightId = seeded.nextFlightId();
    const owner = newClientId();
    const { body } = await holdSeat(api, flightId, '2C', owner);

    const mine = await join(
      await connected({ clientId: owner.toUpperCase() }),
      flightRoom(flightId),
    );
    const theirs = await join(await connected({ clientId: newClientId() }), flightRoom(flightId));

    const myData = (mine as { data: FlightSnapshot }).data;
    const theirData = (theirs as { data: FlightSnapshot }).data;
    expect(myData.myHold).toEqual(body.hold);
    expect(theirData.myHold).toBeNull();
    expect(theirData.seats.find((s) => s.seatCode === '2C')).toEqual(body.seat);
    // La instantánea pública nunca lleva el titular ni el token.
    expect(JSON.stringify(theirData)).not.toContain(owner);
    expect(JSON.stringify(theirData)).not.toContain(body.hold.holdToken);
  });

  it('difunde seat.changed a la sala del vuelo tras el commit, sin datos privados', async () => {
    const flightId = seeded.nextFlightId();
    const observer = await connected();
    await join(observer, flightRoom(flightId));
    const searchOnly = await connected();
    await join(searchOnly, 'search');
    const leaked: SeatEvent[] = [];
    searchOnly.on('seat.changed', (e) => leaked.push(e));

    const received = nextSeatEvent(observer);
    const { body } = await holdSeat(api, flightId, '3D', newClientId());

    expect(await received).toEqual({ flightId, seatCode: '3D', status: 'HELD', version: 2 });
    expect(Object.keys(await received).sort()).toEqual([
      'flightId',
      'seatCode',
      'status',
      'version',
    ]);
    expect(body.seat.version).toBe(2);

    await new Promise((r) => setTimeout(r, 200));
    expect(leaked).toHaveLength(0);
  });

  it('acepta el id de la sala en mayúsculas y lo normaliza', async () => {
    const flightId = seeded.nextFlightId();
    const socket = await connected();
    const result = await join(socket, `flight:${flightId.toUpperCase()}`);
    expect(result.ok).toBe(true);

    // Recibe los eventos de la sala normalizada.
    const received = nextSeatEvent(socket);
    await holdSeat(api, flightId, '4A', newClientId());
    expect((await received).seatCode).toBe('4A');
  });

  it('rechaza salas que no son search ni flight:{uuid}', async () => {
    const socket = await connected();
    for (const room of ['admin', 'flight:abc', 'flight:', `vuelo:${randomUUID()}`, 'SEARCH']) {
      expect(await join(socket, room)).toEqual({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Sala inválida.' },
      });
    }
  });

  it('FLIGHT_NOT_FOUND para un vuelo inexistente, sin dejar la suscripción', async () => {
    const missing = randomUUID();
    const socket = await connected();

    expect(await join(socket, flightRoom(missing))).toEqual({
      ok: false,
      error: { code: 'FLIGHT_NOT_FOUND', message: 'El vuelo no existe.' },
    });

    expect(serverRooms(socket.id as string)).not.toContain(flightRoom(missing));
  });

  it('rechaza un auth.clientId mal formado con connect_error VALIDATION_ERROR', async () => {
    const socket = connect({ clientId: 'no-es-un-uuid' });
    const error = await new Promise<Error & { data?: unknown }>((resolve) =>
      socket.once('connect_error', resolve),
    );
    expect(error.data).toEqual({ code: 'VALIDATION_ERROR' });
  });

  it('admite conexiones sin clientId (solo lectura)', async () => {
    const socket = await connected();
    expect(socket.connected).toBe(true);
  });

  /** Salas del socket en el servidor (por su id de Socket.IO, que no es el clientId). */
  function serverRooms(socketId: string): string[] {
    const socket = api.app.get(RealtimeGateway).server.sockets.sockets.get(socketId);
    return socket ? [...socket.rooms] : [];
  }
});
