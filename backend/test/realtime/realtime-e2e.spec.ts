import {
  type ClientToServerEvents,
  type FlightSnapshot,
  flightRoom,
  type FlightStatusEvent,
  type JoinResult,
  type SeatEvent,
  type ServerToClientEvents,
} from '@aeropulse/shared';
import { EventBus } from '@backend/events';
import { io, type Socket } from 'socket.io-client';
import {
  changeFlightStatus,
  holdFor,
  type SeededDatabase,
  startApi,
  startSeededDatabase,
  type TestApi,
  waitFor,
  waitForLockWaiters,
} from '../support/api';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Checklist §6.A M4 [V], con un cliente `socket.io-client` real (CCR-2):
 * instantánea con `myHold`, evento anterior al *ack* que no se pierde y
 * `PATCH` de administración que llega a la sala `search`.
 */
describe('tiempo real de extremo a extremo', () => {
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

  async function connected(auth: Record<string, unknown> = {}): Promise<ClientSocket> {
    const socket: ClientSocket = io(api.baseUrl, {
      path: '/ws',
      transports: ['websocket'],
      auth,
      reconnection: false,
      forceNew: true,
    });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });
    return socket;
  }

  it('join devuelve la instantánea con myHold para el titular tras recargar', async () => {
    const flightId = seeded.nextFlightId();
    const hold = await holdFor(api, flightId, '3B');

    // «Recargar la pestaña»: nueva conexión con el mismo clientId.
    const socket = await connected({ clientId: hold.clientId });
    const result: JoinResult = await socket
      .timeout(5_000)
      .emitWithAck('join', flightRoom(flightId));

    expect(result.ok).toBe(true);
    const data = (result as { data: FlightSnapshot }).data;
    expect(data.myHold).toMatchObject({ seatCode: '3B', holdToken: hold.holdToken, version: 2 });
    expect(data.seats.find((s) => s.seatCode === '3B')).toMatchObject({
      status: 'HELD',
      version: 2,
    });
  });

  it('un evento publicado entre el join y el ack llega antes del ack y no se pierde', async () => {
    const flightId = seeded.nextFlightId();
    const socket = await connected();
    const order: string[] = [];
    const events: SeatEvent[] = [];
    socket.on('seat.changed', (event) => {
      order.push('event');
      events.push(event);
    });

    // Un escritor cambia 5D y, mientras tanto, bloquea la tabla: la instantánea queda
    // esperando después de que el socket ya entró a la sala.
    const runner = seeded.owner.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    let ackPromise: Promise<JoinResult> | undefined;
    try {
      await runner.query(
        `UPDATE seats SET version = version + 1 WHERE flight_id = $1 AND seat_code = '5D'`,
        [flightId],
      );
      await runner.query('LOCK TABLE seats IN ACCESS EXCLUSIVE MODE');

      ackPromise = socket
        .timeout(10_000)
        .emitWithAck('join', flightRoom(flightId))
        .then((result: JoinResult) => {
          order.push('ack');
          return result;
        });
      await waitForLockWaiters(seeded.owner);

      // Publicación tras el commit del escritor (simulada en el bus: la tabla sigue bloqueada).
      const event: SeatEvent = { flightId, seatCode: '5D', status: 'AVAILABLE', version: 2 };
      api.app.get(EventBus).publish({ type: 'seat.changed', payload: event });
      await waitFor(async () => events.length === 1);

      await runner.commitTransaction();
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();
    }

    const result = await (ackPromise as Promise<JoinResult>);
    expect(order).toEqual(['event', 'ack']);
    expect(events).toEqual([{ flightId, seatCode: '5D', status: 'AVAILABLE', version: 2 }]);

    // La instantánea es coherente (REPEATABLE READ). El cliente funde por versión y se queda
    // con la mayor de las dos para 5D: el evento no se pierde aunque llegó primero.
    const snapshotSeat = (result as { data: FlightSnapshot }).data.seats.find(
      (s) => s.seatCode === '5D',
    );
    expect(snapshotSeat?.version).toBeLessThanOrEqual(2);
    expect(Math.max(snapshotSeat?.version ?? 0, events[0].version)).toBe(2);
  });

  it('el PATCH de administración llega como flight.status_changed a la sala search', async () => {
    const flightId = seeded.nextFlightId();
    const socket = await connected();
    const joined: JoinResult = await socket.timeout(5_000).emitWithAck('join', 'search');
    expect(joined.ok).toBe(true);
    const received = new Promise<FlightStatusEvent>((resolve) =>
      socket.once('flight.status_changed', resolve),
    );

    const { body } = await changeFlightStatus(api, flightId, 'DELAYED');

    expect(await received).toEqual({ flightId, status: 'DELAYED', soldOut: false, version: 2 });
    expect(body).toEqual(await received);
  });
});
