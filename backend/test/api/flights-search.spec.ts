import type { ErrorResponse, Flight, SearchFlightsResponse } from '@aeropulse/shared';
import { runSeed } from '@backend/persistence';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { DataSource } from 'typeorm';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/bootstrap';
import { startTestDatabase, type TestDatabase } from '../support/postgres';

/** Instante fijo del seed: los datos no dependen del día real. */
const NOW = new Date('2026-11-18T12:00:00.000Z');

describe('GET /api/flights', () => {
  let db: TestDatabase;
  let owner: DataSource;
  let app: NestExpressApplication;
  let baseUrl: string;

  beforeAll(async () => {
    db = await startTestDatabase();
    owner = await db.owner().initialize();
    await owner.runMigrations();
    await runSeed(owner, { now: NOW });

    // La API se conecta como `app`, con las variables que usa en producción.
    process.env.PGHOST = db.container.getHost();
    process.env.PGPORT = String(db.container.getPort());
    process.env.DB_NAME = 'flights';
    process.env.APP_DB_PASSWORD = 'app_test';
    delete process.env.DATABASE_URL;

    app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ['error'] });
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app?.close();
    await owner?.destroy();
    await db?.stop();
  });

  async function get(path: string): Promise<{ status: number; body: unknown; raw: string }> {
    const response = await fetch(`${baseUrl}${path}`);
    const raw = await response.text();
    return { status: response.status, body: JSON.parse(raw), raw };
  }

  async function search(query: string) {
    const result = await get(`/api/flights?${query}`);
    return { ...result, flights: (result.body as SearchFlightsResponse).flights };
  }

  describe('búsqueda', () => {
    it('devuelve los vuelos de la ruta y el día UTC, ordenados por salida', async () => {
      const { status, flights } = await search('origin=BOG&destination=MDE&date=2026-11-19');

      expect(status).toBe(200);
      expect(flights.map((f) => f.flightNumber)).toEqual(['AP101', 'AP103', 'AP105']);
      expect(flights.map((f) => f.departureAt)).toEqual([
        '2026-11-19T11:00:00.000Z',
        '2026-11-19T16:30:00.000Z',
        '2026-11-19T22:30:00.000Z',
      ]);
    });

    it('usa la forma exacta de Flight, con fechas ISO en UTC', async () => {
      const { flights } = await search('origin=BOG&destination=MDE&date=2026-11-19');

      expect(Object.keys(flights[0]).sort()).toEqual(
        [
          'arrivalAt',
          'departureAt',
          'destination',
          'fareCop',
          'flightNumber',
          'id',
          'origin',
          'soldOut',
          'status',
          'version',
        ].sort(),
      );
      expect(flights[0]).toMatchObject({
        origin: 'BOG',
        destination: 'MDE',
        arrivalAt: '2026-11-19T12:00:00.000Z',
        fareCop: 289_000,
        status: 'SCHEDULED',
        soldOut: false,
        version: 1,
      });
      expect(flights[0].id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    });

    it('incluye el vuelo de demostración con su tarifa propia', async () => {
      const { flights } = await search('origin=BOG&destination=MDE&date=2026-11-19');
      expect(flights[2]).toMatchObject({ flightNumber: 'AP105', fareCop: 199_000 });
    });

    it('respeta el límite del día UTC: no mezcla el día siguiente', async () => {
      const { flights } = await search('origin=BOG&destination=MDE&date=2026-11-30');

      expect(flights).toHaveLength(3);
      expect(flights.every((f) => f.departureAt.startsWith('2026-11-30'))).toBe(true);
    });

    it('solo trae la dirección pedida', async () => {
      const { flights } = await search('origin=MDE&destination=BOG&date=2026-11-19');
      expect(flights.map((f) => f.flightNumber)).toEqual(['AP102', 'AP104']);
    });

    it('devuelve { flights: [] } si no hay coincidencias', async () => {
      const outsideWindow = await get('/api/flights?origin=BOG&destination=MDE&date=2026-12-15');
      expect(outsideWindow).toMatchObject({ status: 200, body: { flights: [] } });

      // Hoy solo quedan las salidas posteriores a la hora del seed.
      const alreadyDeparted = await search('origin=MDE&destination=BAQ&date=2026-11-18');
      expect(alreadyDeparted.flights.map((f) => f.flightNumber)).toEqual(['AP301']);
    });

    it('incluye vuelos cancelados, retrasados y agotados con su versión', async () => {
      const [first, second, third] = (await search('origin=BOG&destination=MDE&date=2026-11-20'))
        .flights;
      await owner.query(
        `UPDATE flights SET status = 'CANCELLED', version = version + 1 WHERE id = $1`,
        [first.id],
      );
      await owner.query(
        `UPDATE flights SET status = 'DELAYED', sold_out = true, version = version + 2 WHERE id = $1`,
        [second.id],
      );

      const { flights } = await search('origin=BOG&destination=MDE&date=2026-11-20');

      expect(flights).toHaveLength(3);
      expect(flights[0]).toMatchObject({
        id: first.id,
        status: 'CANCELLED',
        soldOut: false,
        version: 2,
      });
      expect(flights[1]).toMatchObject({
        id: second.id,
        status: 'DELAYED',
        soldOut: true,
        version: 3,
      });
      expect(flights[2]).toMatchObject({ id: third.id, status: 'SCHEDULED', version: 1 });
    });

    it('ordena por identificador cuando coincide la salida', async () => {
      const [anchor] = (await search('origin=BAQ&destination=MDE&date=2026-11-21')).flights;
      const ids = [
        'ffffffff-ffff-4fff-bfff-ffffffffffff',
        '00000000-0000-4000-8000-000000000001',
        '80000000-0000-4000-8000-000000000002',
      ];
      for (const [index, id] of ids.entries()) {
        await owner.query(
          `INSERT INTO flights (id, flight_number, origin, destination, departure_at, arrival_at, fare_cop)
           SELECT $1, $2, origin, destination, departure_at, arrival_at, fare_cop FROM flights WHERE id = $3`,
          [id, `AP90${index}`, anchor.id],
        );
      }

      const { flights } = await search('origin=BAQ&destination=MDE&date=2026-11-21');
      const sameDeparture: Flight[] = flights.filter((f) => f.departureAt === anchor.departureAt);

      expect(sameDeparture.map((f) => f.id)).toEqual(
        [
          '00000000-0000-4000-8000-000000000001',
          anchor.id,
          '80000000-0000-4000-8000-000000000002',
          'ffffffff-ffff-4fff-bfff-ffffffffffff',
        ].sort((a, b) => a.localeCompare(b)),
      );
    });
  });

  describe('validación y errores', () => {
    async function expectValidation(
      query: string,
      fields: Array<{ field: string; reason: string }>,
    ) {
      const { status, body, raw } = await get(`/api/flights?${query}`);

      expect(status).toBe(400);
      expect(body).toEqual({
        error: { code: 'VALIDATION_ERROR', message: 'Revisa los datos enviados.', fields },
      });
      return raw;
    }

    it('rechaza una fecha inválida', async () => {
      await expectValidation('origin=BOG&destination=MDE&date=2026-02-30', [
        { field: 'query.date', reason: 'INVALID' },
      ]);
    });

    it('rechaza parámetros ausentes', async () => {
      await expectValidation('origin=BOG', [
        { field: 'query.destination', reason: 'REQUIRED' },
        { field: 'query.date', reason: 'REQUIRED' },
      ]);
      await expectValidation('', [
        { field: 'query.origin', reason: 'REQUIRED' },
        { field: 'query.destination', reason: 'REQUIRED' },
        { field: 'query.date', reason: 'REQUIRED' },
      ]);
    });

    it('rechaza parámetros desconocidos', async () => {
      await expectValidation('origin=BOG&destination=MDE&date=2026-11-19&sort=desc', [
        { field: 'query.sort', reason: 'UNEXPECTED' },
      ]);
    });

    it('rechaza parámetros repetidos', async () => {
      await expectValidation('origin=BOG&destination=MDE&date=2026-11-19&date=2026-11-20', [
        { field: 'query.date', reason: 'DUPLICATE' },
      ]);
    });

    it('rechaza minúsculas, aeropuertos fuera del catálogo y origen igual al destino', async () => {
      await expectValidation('origin=bog&destination=MDE&date=2026-11-19', [
        { field: 'query.origin', reason: 'INVALID' },
      ]);
      await expectValidation('origin=BOG&destination=CLO&date=2026-11-19', [
        { field: 'query.destination', reason: 'INVALID' },
      ]);
      await expectValidation('origin=BOG&destination=BOG&date=2026-11-19', [
        { field: 'query.destination', reason: 'INVALID' },
      ]);
    });

    it('nunca repite el valor recibido', async () => {
      const raw = await expectValidation('origin=secretoXYZ&destination=MDE&date=2026-11-19', [
        { field: 'query.origin', reason: 'INVALID' },
      ]);
      expect(raw).not.toContain('secretoXYZ');
    });

    it('responde con la forma del catálogo ante JSON mal formado', async () => {
      const response = await fetch(`${baseUrl}/api/flights`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{ "origin": ',
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Revisa los datos enviados.',
          fields: [{ field: 'body', reason: 'INVALID' }],
        },
      });
    });

    it('responde con la forma del catálogo ante una ruta inexistente (provisional: CCR-1)', async () => {
      const { status, body } = await get('/api/no-existe');

      expect(status).toBe(404);
      expect((body as ErrorResponse).error.code).toBe('INTERNAL_ERROR');
      expect(Object.keys((body as ErrorResponse).error).sort()).toEqual(['code', 'message']);
    });
  });

  it('mantiene /api/health', async () => {
    expect(await get('/api/health')).toMatchObject({ status: 200, body: { status: 'ok' } });
  });
});
