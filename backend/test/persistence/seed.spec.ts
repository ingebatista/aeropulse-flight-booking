import { buildCatalog, DEMO_FLIGHT_NUMBER, runSeed } from '@backend/persistence';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { startTestDatabase, type TestDatabase } from '../support/postgres';

/** Instante fijo: después de AP101 (11:00 UTC) y antes de AP102 (12:30 UTC). */
const NOW = new Date('2026-11-18T12:00:00.000Z');

interface FlightRow {
  id: string;
  flight_number: string;
  departure_at: Date;
  fare_cop: number;
  status: string;
  sold_out: boolean;
  version: number;
  seats: number;
}

describe('seed del catálogo', () => {
  let db: TestDatabase;
  let owner: DataSource;
  let app: DataSource;

  beforeAll(async () => {
    db = await startTestDatabase();
    owner = await db.owner().initialize();
    await owner.runMigrations();
    app = await db.app().initialize();
  });

  afterAll(async () => {
    await app?.destroy();
    await owner?.destroy();
    await db?.stop();
  });

  async function flights(): Promise<FlightRow[]> {
    return owner.query(`
      SELECT f.id, f.flight_number, f.departure_at, f.fare_cop, f.status, f.sold_out, f.version,
             count(s.seat_code)::int AS seats
      FROM flights f LEFT JOIN seats s ON s.flight_id = f.id
      GROUP BY f.id ORDER BY f.departure_at, f.flight_number`);
  }

  it('inserta el catálogo de la ventana con el rol propietario', async () => {
    const result = await runSeed(owner, { now: NOW });
    const expected = buildCatalog(NOW);
    const expectedSeats = expected.reduce((sum, flight) => sum + flight.seatCodes.length, 0);

    expect(result).toEqual({
      catalogFlights: expected.length,
      flightsInserted: expected.length,
      seatsInserted: expectedSeats,
    });
    expect(expected).toHaveLength(129);

    const rows = await flights();
    expect(rows).toHaveLength(129);
    expect(rows.every((f) => f.departure_at.getTime() > NOW.getTime())).toBe(true);
    expect(rows.at(-1)?.departure_at.toISOString()).toBe('2026-11-30T22:30:00.000Z');
    expect(rows.every((f) => f.status === 'SCHEDULED' && !f.sold_out && f.version === 1)).toBe(
      true,
    );
  });

  it('da 24 asientos a los vuelos habituales y 6 al de demostración', async () => {
    const rows = await flights();
    const demo = rows.filter((f) => f.flight_number === DEMO_FLIGHT_NUMBER);
    const standard = rows.filter((f) => f.flight_number !== DEMO_FLIGHT_NUMBER);

    expect(demo.length).toBeGreaterThan(0);
    expect(demo.every((f) => f.seats === 6)).toBe(true);
    expect(standard.every((f) => f.seats === 24)).toBe(true);
    // Hay una salida futura del vuelo de demostración hoy, para poder agotarlo.
    expect(demo[0].departure_at.toISOString()).toBe('2026-11-18T22:30:00.000Z');

    const demoSeats: Array<{ seat_code: string }> = await owner.query(
      `SELECT seat_code FROM seats WHERE flight_id = $1 ORDER BY seat_code`,
      [demo[0].id],
    );
    expect(demoSeats.map((s) => s.seat_code)).toEqual(['1A', '1B', '1C', '2A', '2B', '2C']);
  });

  it('al reejecutarse conserva estado, tarifa, bloqueos y reservas, y solo repone lo que falta', async () => {
    const [first, second, third] = await flights();
    const holder = randomUUID();
    const token = randomUUID();

    // Cambios que el seed no debe tocar.
    await owner.query(
      `UPDATE flights SET status = 'DELAYED', fare_cop = 123000, sold_out = true, version = version + 1
       WHERE id = $1`,
      [first.id],
    );
    await owner.query(
      `UPDATE seats SET status = 'HELD', held_by = $2, hold_token = $3,
         hold_expires_at = now() + interval '5 minutes', version = version + 1
       WHERE flight_id = $1 AND seat_code = '1A'`,
      [second.id, holder, token],
    );
    await owner.query(
      `UPDATE seats SET status = 'BOOKED', version = version + 1
       WHERE flight_id = $1 AND seat_code = '1B'`,
      [second.id],
    );
    await owner.query(
      `INSERT INTO bookings (id, code, flight_id, seat_code, passenger_first_name, passenger_last_name,
         amount_cop, card_last4, card_brand, payment_reference, idempotency_key, request_hash)
       VALUES ($1, 'ABCDEF', $2, '1B', 'Laura', 'Gómez', 289000, '4242', 'VISA', 'SIM-1', $3, $4)`,
      [randomUUID(), second.id, randomUUID(), 'a'.repeat(64)],
    );
    // Un asiento faltante que el seed debe reponer.
    await owner.query(`DELETE FROM seats WHERE flight_id = $1 AND seat_code = '6D'`, [third.id]);

    const before = await snapshot();
    const result = await runSeed(owner, { now: NOW });

    expect(result).toEqual({ catalogFlights: 129, flightsInserted: 0, seatsInserted: 1 });
    expect(await snapshot()).toEqual({ ...before, seatCount: before.seatCount + 1 });

    const restored: Array<{ status: string; version: number }> = await owner.query(
      `SELECT status, version FROM seats WHERE flight_id = $1 AND seat_code = '6D'`,
      [third.id],
    );
    expect(restored).toEqual([{ status: 'AVAILABLE', version: 1 }]);

    const [delayed] = (await flights()).filter((f) => f.id === first.id);
    expect(delayed).toMatchObject({
      status: 'DELAYED',
      fare_cop: 123000,
      sold_out: true,
      version: 2,
    });

    const held: Array<{ status: string; held_by: string; hold_token: string; version: number }> =
      await owner.query(
        `SELECT status, held_by, hold_token, version FROM seats
         WHERE flight_id = $1 AND seat_code = '1A'`,
        [second.id],
      );
    expect(held).toEqual([{ status: 'HELD', held_by: holder, hold_token: token, version: 2 }]);
  });

  it('con un instante posterior no duplica vuelos ya sembrados', async () => {
    const result = await runSeed(owner, { now: new Date('2026-11-25T00:00:00.000Z') });

    expect(result.flightsInserted).toBe(0);
    expect(result.seatsInserted).toBe(0);
    expect(await flights()).toHaveLength(129);
  });

  it('sin instante explícito usa el reloj de PostgreSQL', async () => {
    const rows: Array<{ now: Date }> = await owner.query('SELECT now() AS now');
    const result = await runSeed(owner);

    // La ventana depende del día real; basta con que la calcule y no falle.
    expect(result.catalogFlights).toBeLessThanOrEqual(buildCatalog(rows[0].now).length);
  });

  it('el rol app lee el catálogo sembrado', async () => {
    const rows: Array<{ count: number }> = await app.query(
      `SELECT count(*)::int AS count FROM flights WHERE flight_number = $1`,
      [DEMO_FLIGHT_NUMBER],
    );
    expect(rows[0].count).toBeGreaterThan(0);
  });

  async function snapshot() {
    const flightRows = await owner.query(
      `SELECT id, flight_number, departure_at, arrival_at, fare_cop, status, sold_out, version
       FROM flights ORDER BY id`,
    );
    const seatRows = await owner.query(
      `SELECT flight_id, seat_code, status, held_by, hold_token, hold_expires_at, version
       FROM seats ORDER BY flight_id, seat_code`,
    );
    const bookingRows = await owner.query(`SELECT * FROM bookings ORDER BY id`);
    return {
      flights: flightRows,
      seatCount: seatRows.length,
      // Los asientos existentes no cambian (se comparan sin el repuesto).
      seats: seatRows.filter((s: { seat_code: string; flight_id: string }) => s.seat_code !== '6D'),
      bookings: bookingRows,
    };
  }
});
