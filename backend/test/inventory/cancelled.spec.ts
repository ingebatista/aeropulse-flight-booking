import type { ErrorResponse } from '@aeropulse/shared';
import {
  holdSeat,
  newClientId,
  readSeat,
  type SeededDatabase,
  startApi,
  startSeededDatabase,
  type TestApi,
  waitForLockWaiters,
} from '../support/api';

describe('hold en vuelos cancelados (regla impuesta en el servidor)', () => {
  let seeded: SeededDatabase;
  let api: TestApi;

  beforeAll(async () => {
    seeded = await startSeededDatabase();
    api = await startApi(seeded);
  });

  afterAll(async () => {
    await api?.close();
    await seeded?.stop();
  });

  beforeEach(() => api.clearEvents());

  const errorCode = (body: unknown) => (body as ErrorResponse).error.code;
  const cancel = (flightId: string) =>
    seeded.owner.query(
      `UPDATE flights SET status = 'CANCELLED', version = version + 1 WHERE id = $1`,
      [flightId],
    );

  it('un hold nuevo en un vuelo cancelado devuelve 409 FLIGHT_CANCELLED sin tocar el asiento', async () => {
    const flightId = seeded.nextFlightId();
    await cancel(flightId);

    const { status, body } = await holdSeat(api, flightId, '1A', newClientId());

    expect(status).toBe(409);
    expect(errorCode(body)).toBe('FLIGHT_CANCELLED');
    expect(await readSeat(seeded.owner, flightId, '1A')).toMatchObject({
      status: 'AVAILABLE',
      version: 1,
    });
    expect(api.events).toHaveLength(0);
  });

  it('el titular conserva su bloqueo previo si intenta cambiar de asiento tras la cancelación', async () => {
    const flightId = seeded.nextFlightId();
    const client = newClientId();
    const mine = await holdSeat(api, flightId, '2A', client);
    await cancel(flightId);
    api.clearEvents();

    const { status, body } = await holdSeat(api, flightId, '2B', client);

    expect(status).toBe(409);
    expect(errorCode(body)).toBe('FLIGHT_CANCELLED');
    expect(await readSeat(seeded.owner, flightId, '2A')).toMatchObject({
      status: 'HELD',
      held_by: client,
      hold_token: mine.body.hold.holdToken,
      version: 2,
    });
    expect(api.events).toHaveLength(0);
  });

  it('si la cancelación toma primero la fila del vuelo, el hold espera su commit y revierte', async () => {
    const flightId = seeded.nextFlightId();
    const runner = seeded.owner.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      // La cancelación toma la fila del vuelo y todavía no confirma.
      await runner.query(
        `UPDATE flights SET status = 'CANCELLED', version = version + 1 WHERE id = $1`,
        [flightId],
      );

      // El hold ve el vuelo programado en su UPDATE (sin bloqueo), actualiza el asiento
      // y se queda esperando en FOR SHARE sobre la fila del vuelo.
      const pending = holdSeat(api, flightId, '3A', newClientId());
      await waitForLockWaiters(seeded.owner);
      await runner.commitTransaction();

      const { status, body } = await pending;
      expect(status).toBe(409);
      expect(errorCode(body)).toBe('FLIGHT_CANCELLED');
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();
    }

    // La escritura del asiento se revirtió: ni estado, ni versión, ni eventos.
    expect(await readSeat(seeded.owner, flightId, '3A')).toMatchObject({
      status: 'AVAILABLE',
      held_by: null,
      version: 1,
    });
    expect(api.events).toHaveLength(0);
  });

  it('un vuelo retrasado sí admite bloqueos', async () => {
    const flightId = seeded.nextFlightId();
    await seeded.owner.query(
      `UPDATE flights SET status = 'DELAYED', version = version + 1 WHERE id = $1`,
      [flightId],
    );

    const { status } = await holdSeat(api, flightId, '4A', newClientId());
    expect(status).toBe(201);
  });
});
