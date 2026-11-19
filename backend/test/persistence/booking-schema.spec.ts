import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { expectPgError } from '../support/pg-error';
import { startTestDatabase, type TestDatabase } from '../support/postgres';

const BUSINESS_TABLES = ['bookings', 'flights', 'seats'];
const EXPLICIT_INDEXES = [
  'flights_route_departure_idx',
  'seats_flight_holder_uidx',
  'seats_held_expiry_idx',
];

describe('migración de negocio BookingSchema', () => {
  let db: TestDatabase;
  let owner: DataSource;
  let app: DataSource;

  beforeAll(async () => {
    db = await startTestDatabase();
    owner = await db.owner().initialize();
  });

  afterAll(async () => {
    await app?.destroy();
    await owner?.destroy();
    await db?.stop();
  });

  async function tables(): Promise<string[]> {
    const rows: Array<{ table_name: string }> = await owner.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = ANY($1) ORDER BY table_name`,
      [BUSINESS_TABLES],
    );
    return rows.map((row) => row.table_name);
  }

  async function indexes(): Promise<string[]> {
    const rows: Array<{ indexname: string }> = await owner.query(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = 'public' AND indexname = ANY($1) ORDER BY indexname`,
      [EXPLICIT_INDEXES],
    );
    return rows.map((row) => row.indexname);
  }

  describe('aplicar, revertir y aplicar con el rol propietario', () => {
    it('aplica las dos migraciones y crea tablas e índices', async () => {
      const applied = await owner.runMigrations();

      expect(applied.map((m) => m.name)).toEqual([
        'AppRoleGrants1763510400000',
        'BookingSchema1794960000000',
      ]);
      expect(await tables()).toEqual(BUSINESS_TABLES);
      expect(await indexes()).toEqual(EXPLICIT_INDEXES);
    });

    it('revierte solo la migración de negocio y deja AppRoleGrants', async () => {
      await owner.undoLastMigration();

      expect(await tables()).toEqual([]);
      expect(await indexes()).toEqual([]);
      const rows: Array<{ name: string }> = await owner.query('SELECT name FROM migrations');
      expect(rows.map((row) => row.name)).toEqual(['AppRoleGrants1763510400000']);
    });

    it('la vuelve a aplicar sin errores', async () => {
      const applied = await owner.runMigrations();

      expect(applied.map((m) => m.name)).toEqual(['BookingSchema1794960000000']);
      expect(await tables()).toEqual(BUSINESS_TABLES);
      expect(await indexes()).toEqual(EXPLICIT_INDEXES);
      expect(await owner.runMigrations()).toHaveLength(0);
    });
  });

  describe('rol app', () => {
    beforeAll(async () => {
      app = await db.app().initialize();
    });

    it('lee y escribe datos en las tres tablas', async () => {
      const flightId = await insertFlight(app);
      await insertSeat(app, flightId, '1A');
      await app.query(
        `UPDATE seats SET status = 'BOOKED', version = version + 1
                       WHERE flight_id = $1 AND seat_code = '1A'`,
        [flightId],
      );
      const bookingId = await insertBooking(app, flightId, '1A');

      const rows: Array<{ count: string }> = await app.query(
        'SELECT count(*) AS count FROM bookings WHERE id = $1',
        [bookingId],
      );
      expect(rows[0].count).toBe('1');

      await app.query('DELETE FROM bookings WHERE id = $1', [bookingId]);
      await app.query('DELETE FROM seats WHERE flight_id = $1', [flightId]);
      await app.query('DELETE FROM flights WHERE id = $1', [flightId]);
    });

    it('no puede cambiar el esquema', async () => {
      await expect(app.query('ALTER TABLE flights ADD COLUMN extra int')).rejects.toThrow(
        /must be owner/,
      );
      await expect(app.query('DROP TABLE bookings')).rejects.toThrow(/must be owner/);
      await expect(app.query('CREATE INDEX probe_idx ON seats (status)')).rejects.toThrow(
        /must be owner/,
      );
      await expect(app.query('CREATE TABLE forbidden (id int)')).rejects.toThrow(
        /permission denied/,
      );
    });
  });

  describe('integridad del esquema', () => {
    it('rechaza vuelos fuera del catálogo o incoherentes', async () => {
      await expectPgError(insertFlight(app, { origin: 'XXX' }), '23514', 'flights_origin_check');
      await expectPgError(
        insertFlight(app, { destination: 'CLO' }),
        '23514',
        'flights_destination_check',
      );
      await expectPgError(
        insertFlight(app, { origin: 'BOG', destination: 'BOG' }),
        '23514',
        'flights_route_check',
      );
      await expectPgError(
        insertFlight(app, { durationMinutes: 0 }),
        '23514',
        'flights_schedule_check',
      );
      await expectPgError(insertFlight(app, { fareCop: 0 }), '23514', 'flights_fare_check');
      await expectPgError(
        insertFlight(app, { status: 'BOARDING' }),
        '23514',
        'flights_status_check',
      );
      await expectPgError(insertFlight(app, { version: 0 }), '23514', 'flights_version_check');
    });

    it('impide repetir la clave natural del vuelo', async () => {
      const departureAt = '2026-12-01T10:00:00.000Z';
      await insertFlight(app, { flightNumber: 'AP900', departureAt });
      await expectPgError(
        insertFlight(app, { flightNumber: 'AP900', departureAt }),
        '23505',
        'flights_number_departure_key',
      );
    });

    it('rechaza estados parciales del bloqueo', async () => {
      const flightId = await insertFlight(app);
      const holder = randomUUID();
      const token = randomUUID();
      const expires = '2026-12-01T10:05:00.000Z';

      // HELD sin alguno de sus tres campos.
      await expectPgError(
        insertSeat(app, flightId, '1A', 'HELD', holder, token, null),
        '23514',
        'seats_hold_check',
      );
      await expectPgError(
        insertSeat(app, flightId, '1A', 'HELD', holder, null, expires),
        '23514',
        'seats_hold_check',
      );
      await expectPgError(
        insertSeat(app, flightId, '1A', 'HELD', null, token, expires),
        '23514',
        'seats_hold_check',
      );
      // AVAILABLE o BOOKED con restos de un bloqueo.
      await expectPgError(
        insertSeat(app, flightId, '1A', 'AVAILABLE', holder, null, null),
        '23514',
        'seats_hold_check',
      );
      await expectPgError(
        insertSeat(app, flightId, '1A', 'BOOKED', null, null, expires),
        '23514',
        'seats_hold_check',
      );

      await insertSeat(app, flightId, '1A', 'HELD', holder, token, expires);
      // Liberar a medias también se rechaza.
      await expectPgError(
        app.query(
          `UPDATE seats SET status = 'AVAILABLE' WHERE flight_id = $1 AND seat_code = '1A'`,
          [flightId],
        ),
        '23514',
        'seats_hold_check',
      );
    });

    it('rechaza códigos de asiento, estados y versiones inválidos', async () => {
      const flightId = await insertFlight(app);
      await expectPgError(insertSeat(app, flightId, '7E'), '23514', 'seats_code_check');
      await expectPgError(insertSeat(app, flightId, 'A1'), '23514', 'seats_code_check');
      // Un estado desconocido incumple también el CHECK del bloqueo: PostgreSQL puede informar cualquiera.
      await expectPgError(insertSeat(app, flightId, '1A', 'LOCKED'), '23514');
      await expectPgError(
        app.query(`INSERT INTO seats (flight_id, seat_code, version) VALUES ($1, '1A', 0)`, [
          flightId,
        ]),
        '23514',
        'seats_version_check',
      );
    });

    it('permite un solo bloqueo HELD por titular y vuelo', async () => {
      const flightId = await insertFlight(app);
      const otherFlightId = await insertFlight(app);
      const holder = randomUUID();
      const expires = '2026-12-01T10:05:00.000Z';

      await insertSeat(app, flightId, '1A', 'HELD', holder, randomUUID(), expires);
      await expectPgError(
        insertSeat(app, flightId, '1B', 'HELD', holder, randomUUID(), expires),
        '23505',
        'seats_flight_holder_uidx',
      );
      // El mismo titular sí puede bloquear en otro vuelo.
      await insertSeat(app, otherFlightId, '1A', 'HELD', holder, randomUUID(), expires);
    });

    it('impone las claves foráneas con RESTRICT', async () => {
      await expectPgError(insertSeat(app, randomUUID(), '1A'), '23503', 'seats_flight_fkey');

      const flightId = await insertFlight(app);
      await insertSeat(app, flightId, '1A', 'BOOKED');
      await expectPgError(insertBooking(app, flightId, '2B'), '23503', 'bookings_seat_fkey');

      await insertBooking(app, flightId, '1A');
      await expectPgError(
        app.query('DELETE FROM flights WHERE id = $1', [flightId]),
        '23503',
        'seats_flight_fkey',
      );
      await expectPgError(
        app.query(`DELETE FROM seats WHERE flight_id = $1 AND seat_code = '1A'`, [flightId]),
        '23503',
        'bookings_seat_fkey',
      );
    });

    it('impide reservas duplicadas por asiento, código o clave de idempotencia', async () => {
      const flightId = await insertFlight(app);
      await insertSeat(app, flightId, '1A', 'BOOKED');
      await insertSeat(app, flightId, '1B', 'BOOKED');
      const key = randomUUID();
      await insertBooking(app, flightId, '1A', { code: 'ABCDEF', idempotencyKey: key });

      await expectPgError(insertBooking(app, flightId, '1A'), '23505', 'bookings_seat_key');
      await expectPgError(
        insertBooking(app, flightId, '1B', { code: 'ABCDEF' }),
        '23505',
        'bookings_code_key',
      );
      await expectPgError(
        insertBooking(app, flightId, '1B', { idempotencyKey: key }),
        '23505',
        'bookings_idempotency_key_key',
      );
    });

    it('rechaza códigos de reserva fuera del alfabeto e importes no positivos', async () => {
      const flightId = await insertFlight(app);
      await insertSeat(app, flightId, '1A', 'BOOKED');

      await expectPgError(
        insertBooking(app, flightId, '1A', { code: 'ABCDE0' }),
        '23514',
        'bookings_code_check',
      );
      await expectPgError(
        insertBooking(app, flightId, '1A', { code: 'abcdef' }),
        '23514',
        'bookings_code_check',
      );
      await expectPgError(
        insertBooking(app, flightId, '1A', { amountCop: 0 }),
        '23514',
        'bookings_amount_check',
      );
    });
  });
});

interface FlightOverrides {
  flightNumber?: string;
  origin?: string;
  destination?: string;
  departureAt?: string;
  durationMinutes?: number;
  fareCop?: number;
  status?: string;
  version?: number;
}

let flightSequence = 0;

async function insertFlight(ds: DataSource, overrides: FlightOverrides = {}): Promise<string> {
  const id = randomUUID();
  const departureAt = new Date(overrides.departureAt ?? Date.UTC(2027, 0, 1, 0, flightSequence++));
  const arrivalAt = new Date(departureAt.getTime() + (overrides.durationMinutes ?? 60) * 60_000);
  await ds.query(
    `INSERT INTO flights (id, flight_number, origin, destination, departure_at, arrival_at, fare_cop, status, version)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      overrides.flightNumber ?? 'AP999',
      overrides.origin ?? 'BOG',
      overrides.destination ?? 'MDE',
      departureAt,
      arrivalAt,
      overrides.fareCop ?? 289_000,
      overrides.status ?? 'SCHEDULED',
      overrides.version ?? 1,
    ],
  );
  return id;
}

async function insertSeat(
  ds: DataSource,
  flightId: string,
  seatCode: string,
  status = 'AVAILABLE',
  heldBy: string | null = null,
  holdToken: string | null = null,
  holdExpiresAt: string | null = null,
): Promise<void> {
  await ds.query(
    `INSERT INTO seats (flight_id, seat_code, status, held_by, hold_token, hold_expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [flightId, seatCode, status, heldBy, holdToken, holdExpiresAt],
  );
}

let bookingSequence = 0;

async function insertBooking(
  ds: DataSource,
  flightId: string,
  seatCode: string,
  overrides: { code?: string; idempotencyKey?: string; amountCop?: number } = {},
): Promise<string> {
  const id = randomUUID();
  // Códigos distintos por llamada, dentro del alfabeto del contrato.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const n = bookingSequence++;
  const code = overrides.code ?? `QQQQ${alphabet[Math.floor(n / 32) % 32]}${alphabet[n % 32]}`;
  await ds.query(
    `INSERT INTO bookings (id, code, flight_id, seat_code, passenger_first_name, passenger_last_name,
       amount_cop, card_last4, card_brand, payment_reference, idempotency_key, request_hash)
     VALUES ($1, $2, $3, $4, 'Laura', 'Gómez', $5, '4242', 'VISA', 'SIM-TEST', $6, $7)`,
    [
      id,
      code,
      flightId,
      seatCode,
      overrides.amountCop ?? 289_000,
      overrides.idempotencyKey ?? randomUUID(),
      'a'.repeat(64),
    ],
  );
  return id;
}
