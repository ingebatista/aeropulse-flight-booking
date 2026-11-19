import type { ErrorResponse } from '@aeropulse/shared';
import { randomUUID } from 'node:crypto';
import {
  confirmBooking,
  countBookings,
  holdFor,
  readSeat,
  type SeededDatabase,
  startApi,
  startSeededDatabase,
  type TestApi,
} from '../support/api';

/**
 * Atomicidad de la confirmación (arch §4.4 y §8): un error dentro de la
 * transacción, después de pasar el asiento a BOOKED, revierte todo. Se provoca
 * en PostgreSQL real con un *trigger* que hace fallar el INSERT de la reserva.
 */
describe('rollback de la confirmación', () => {
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

  it('un error en el INSERT de la reserva deja el asiento HELD, sin reserva ni eventos', async () => {
    const flightId = seeded.nextFlightId();
    const hold = await holdFor(api, flightId, '1A');
    const idempotencyKey = randomUUID();
    api.clearEvents();

    await seeded.owner.query(`
      CREATE FUNCTION fail_booking_insert() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'fallo forzado por la prueba'; END $$`);
    await seeded.owner.query(`
      CREATE TRIGGER bookings_fail BEFORE INSERT ON bookings
      FOR EACH ROW EXECUTE FUNCTION fail_booking_insert()`);
    try {
      const { status, body, raw } = await confirmBooking(api, { ...hold, idempotencyKey });

      expect(status).toBe(500);
      expect((body as unknown as ErrorResponse).error).toEqual({
        code: 'INTERNAL_ERROR',
        message: 'Ocurrió un error inesperado.',
      });
      // El mensaje público no filtra el detalle del error de la base.
      expect(raw).not.toContain('fallo forzado');
    } finally {
      await seeded.owner.query('DROP TRIGGER bookings_fail ON bookings');
      await seeded.owner.query('DROP FUNCTION fail_booking_insert()');
    }

    // El UPDATE del asiento se revirtió con la transacción: misma versión, mismo titular.
    expect(await readSeat(seeded.owner, flightId, '1A')).toMatchObject({
      status: 'HELD',
      held_by: hold.clientId,
      hold_token: hold.holdToken,
      version: 2,
    });
    expect(await countBookings(seeded.owner, flightId)).toBe(0);
    expect(api.events).toHaveLength(0);

    // La clave no quedó consumida: el mismo intento confirma cuando la base se recupera.
    const retry = await confirmBooking(api, { ...hold, idempotencyKey });
    expect(retry.status).toBe(201);
    expect(await countBookings(seeded.owner, flightId)).toBe(1);
  });
});
