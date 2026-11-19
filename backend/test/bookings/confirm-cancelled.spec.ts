import type { ErrorResponse } from '@aeropulse/shared';
import {
  confirmBooking,
  countBookings,
  holdFor,
  readSeat,
  type SeededDatabase,
  startApi,
  startSeededDatabase,
  type TestApi,
  waitForLockWaiters,
} from '../support/api';

describe('confirmación en vuelos cancelados (regla impuesta en el servidor)', () => {
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
  const cancelSql = `UPDATE flights SET status = 'CANCELLED', version = version + 1 WHERE id = $1`;

  it('con una clave sin usar y el vuelo cancelado devuelve 409 FLIGHT_CANCELLED', async () => {
    const flightId = seeded.nextFlightId();
    const hold = await holdFor(api, flightId, '1A');
    await seeded.owner.query(cancelSql, [flightId]);
    api.clearEvents();

    const { status, body } = await confirmBooking(api, hold);

    expect(status).toBe(409);
    expect(errorCode(body)).toBe('FLIGHT_CANCELLED');
    expect((await readSeat(seeded.owner, flightId, '1A')).status).toBe('HELD');
    expect(await countBookings(seeded.owner, flightId)).toBe(0);
    expect(api.events).toHaveLength(0);
  });

  it('si la cancelación toma primero la fila del vuelo, la confirmación espera su commit y revierte', async () => {
    const flightId = seeded.nextFlightId();
    const hold = await holdFor(api, flightId, '2A');
    api.clearEvents();

    const runner = seeded.owner.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      // La cancelación toma la fila del vuelo y todavía no confirma.
      await runner.query(cancelSql, [flightId]);

      // La precomprobación ve el vuelo programado; la transacción pasa el asiento a BOOKED
      // y se queda esperando en FOR UPDATE sobre la fila del vuelo.
      const pending = confirmBooking(api, hold);
      await waitForLockWaiters(seeded.owner);
      await runner.commitTransaction();

      const { status, body } = await pending;
      expect(status).toBe(409);
      expect(errorCode(body)).toBe('FLIGHT_CANCELLED');
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();
    }

    // El asiento vuelve a su estado previo (HELD, misma versión) y no hay reserva ni eventos.
    expect(await readSeat(seeded.owner, flightId, '2A')).toMatchObject({
      status: 'HELD',
      held_by: hold.clientId,
      version: 2,
    });
    expect(await countBookings(seeded.owner, flightId)).toBe(0);
    expect(api.events).toHaveLength(0);
  });

  it('un vuelo retrasado sí admite la confirmación', async () => {
    const flightId = seeded.nextFlightId();
    const hold = await holdFor(api, flightId, '3A');
    await seeded.owner.query(
      `UPDATE flights SET status = 'DELAYED', version = version + 1 WHERE id = $1`,
      [flightId],
    );

    expect((await confirmBooking(api, hold)).status).toBe(201);
  });
});
