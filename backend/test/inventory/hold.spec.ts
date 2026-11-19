import type { ErrorResponse } from '@aeropulse/shared';
import { randomUUID } from 'node:crypto';
import {
  holdSeat,
  newClientId,
  rawRequest,
  readSeat,
  type SeededDatabase,
  startApi,
  startSeededDatabase,
  type TestApi,
} from '../support/api';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('POST /api/flights/{flightId}/seats/{seatCode}/hold', () => {
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

  describe('adquisición e idempotencia', () => {
    it('201 con el asiento, el bloqueo propio y serverNow de PostgreSQL', async () => {
      const flightId = seeded.nextFlightId();
      const client = newClientId();

      const { status, body } = await holdSeat(api, flightId, '1A', client);

      expect(status).toBe(201);
      expect(body.seat).toEqual({ flightId, seatCode: '1A', status: 'HELD', version: 2 });
      expect(body.hold).toMatchObject({ seatCode: '1A', version: 2 });
      expect(body.hold.holdToken).toMatch(UUID_V4);
      // Vencimiento y serverNow salen de la misma transacción: la diferencia es el TTL exacto.
      const ttlMs = Date.parse(body.hold.holdExpiresAt) - Date.parse(body.serverNow);
      expect(ttlMs).toBe(300_000);
      expect(body.serverNow).toMatch(/Z$/);
      // La respuesta no repite el clientId.
      expect(JSON.stringify(body)).not.toContain(client);

      expect(await readSeat(seeded.owner, flightId, '1A')).toMatchObject({
        status: 'HELD',
        held_by: client,
        hold_token: body.hold.holdToken,
        version: 2,
      });
      expect(api.seatEvents(flightId)).toEqual([body.seat]);
    });

    it('el reintento del titular devuelve 200 con el mismo token, vencimiento y versión, sin evento', async () => {
      const flightId = seeded.nextFlightId();
      const client = newClientId();
      const first = await holdSeat(api, flightId, '2B', client);
      api.clearEvents();

      const retry = await holdSeat(api, flightId, '2B', client);
      // El encabezado se compara sin distinguir mayúsculas.
      const upper = await holdSeat(api, flightId.toUpperCase(), '2B', client.toUpperCase());

      for (const again of [retry, upper]) {
        expect(again.status).toBe(200);
        expect(again.body.seat).toEqual(first.body.seat);
        expect(again.body.hold).toEqual(first.body.hold);
      }
      expect(api.events).toHaveLength(0);
      expect((await readSeat(seeded.owner, flightId, '2B')).version).toBe(2);
    });

    it('cambiar de asiento libera el anterior y emite un evento por cada asiento', async () => {
      const flightId = seeded.nextFlightId();
      const client = newClientId();
      await holdSeat(api, flightId, '1A', client);
      api.clearEvents();

      const { status, body } = await holdSeat(api, flightId, '1B', client);

      expect(status).toBe(201);
      expect(await readSeat(seeded.owner, flightId, '1A')).toMatchObject({
        status: 'AVAILABLE',
        held_by: null,
        hold_token: null,
        hold_expires_at: null,
        version: 3,
      });
      expect(await readSeat(seeded.owner, flightId, '1B')).toMatchObject({
        status: 'HELD',
        held_by: client,
        hold_token: body.hold.holdToken,
      });
      expect(api.seatEvents(flightId)).toEqual(
        expect.arrayContaining([
          { flightId, seatCode: '1A', status: 'AVAILABLE', version: 3 },
          { flightId, seatCode: '1B', status: 'HELD', version: 2 },
        ]),
      );
      expect(api.seatEvents(flightId)).toHaveLength(2);
    });

    it('cambiar a un asiento con bloqueo ajeno da 409 y conserva el bloqueo previo', async () => {
      const flightId = seeded.nextFlightId();
      const me = newClientId();
      const other = newClientId();
      const mine = await holdSeat(api, flightId, '1A', me);
      await holdSeat(api, flightId, '2A', other);
      api.clearEvents();

      const { status, body } = await holdSeat(api, flightId, '2A', me);

      expect(status).toBe(409);
      expect(errorCode(body)).toBe('SEAT_UNAVAILABLE');
      // El paso 1 (liberar mi bloqueo) se revirtió con la transacción.
      expect(await readSeat(seeded.owner, flightId, '1A')).toMatchObject({
        status: 'HELD',
        held_by: me,
        hold_token: mine.body.hold.holdToken,
        version: 2,
      });
      expect(api.events).toHaveLength(0);
    });

    it('un asiento reservado no se puede bloquear', async () => {
      const flightId = seeded.nextFlightId();
      await seeded.owner.query(
        `UPDATE seats SET status = 'BOOKED', version = version + 1
         WHERE flight_id = $1 AND seat_code = '5A'`,
        [flightId],
      );

      const { status, body } = await holdSeat(api, flightId, '5A', newClientId());

      expect(status).toBe(409);
      expect(errorCode(body)).toBe('SEAT_UNAVAILABLE');
    });

    it('el mismo cliente con dos asientos en paralelo termina con un solo HELD (20 rondas)', async () => {
      for (let round = 0; round < 20; round++) {
        const flightId = seeded.nextFlightId();
        const client = newClientId();
        api.clearEvents();

        const results = await Promise.all([
          holdSeat(api, flightId, '6A', client),
          holdSeat(api, flightId, '6B', client),
        ]);

        // Ninguna respuesta termina en 500: el choque del índice por titular se reintenta.
        for (const r of results) expect([200, 201]).toContain(r.status);

        const held: Array<{ seat_code: string; status: string; version: number }> =
          await seeded.owner.query(
            `SELECT seat_code, status, version FROM seats
             WHERE flight_id = $1 AND held_by = $2 AND status = 'HELD'`,
            [flightId, client],
          );
        expect(held).toHaveLength(1);

        // El último evento de cada asiento coincide con su estado y versión en la base:
        // no se publicó nada de un intento revertido.
        for (const seatCode of ['6A', '6B']) {
          const row = await readSeat(seeded.owner, flightId, seatCode);
          const events = api.seatEvents(flightId, seatCode);
          if (events.length > 0) {
            expect(events.at(-1)).toEqual({
              flightId,
              seatCode,
              status: row.status,
              version: row.version,
            });
          } else {
            expect(row).toMatchObject({ status: 'AVAILABLE', version: 1 });
          }
        }
      }
    });
  });

  describe('existencia', () => {
    it('404 FLIGHT_NOT_FOUND si el vuelo no existe', async () => {
      const { status, body } = await holdSeat(api, randomUUID(), '1A', newClientId());
      expect(status).toBe(404);
      expect(errorCode(body)).toBe('FLIGHT_NOT_FOUND');
    });

    it('404 SEAT_NOT_FOUND si el código es válido pero no existe en el vuelo', async () => {
      const flightId = seeded.nextFlightId();
      const missingRow = await holdSeat(api, flightId, '9A', newClientId());
      const demoD = await holdSeat(api, seeded.demoFlightIds[0], '1D', newClientId());

      for (const { status, body } of [missingRow, demoD]) {
        expect(status).toBe(404);
        expect(errorCode(body)).toBe('SEAT_NOT_FOUND');
      }
      expect(api.events).toHaveLength(0);
    });
  });

  describe('validación', () => {
    const path = (flightId: string, seatCode: string) =>
      `/api/flights/${flightId}/seats/${seatCode}/hold`;

    async function expectValidation(
      result: { status: number; body: unknown },
      fields: Array<{ field: string; reason: string }>,
    ) {
      expect(result.status).toBe(400);
      expect(result.body).toEqual({
        error: { code: 'VALIDATION_ERROR', message: 'Revisa los datos enviados.', fields },
      });
    }

    it('rechaza flightId y seatCode mal formados', async () => {
      await expectValidation(await holdSeat(api, 'abc', '1A', newClientId()), [
        { field: 'param.flightId', reason: 'INVALID' },
      ]);
      await expectValidation(await holdSeat(api, seeded.nextFlightId(), '1E', newClientId()), [
        { field: 'param.seatCode', reason: 'INVALID' },
      ]);
      await expectValidation(await holdSeat(api, seeded.nextFlightId(), '1a', newClientId()), [
        { field: 'param.seatCode', reason: 'INVALID' },
      ]);
    });

    it('exige X-Client-Id como UUID v4, una sola vez', async () => {
      const flightId = seeded.nextFlightId();
      await expectValidation(await rawRequest(api, 'POST', path(flightId, '1A'), {}), [
        { field: 'header.x-client-id', reason: 'REQUIRED' },
      ]);
      const invalid = await rawRequest(api, 'POST', path(flightId, '1A'), {
        'x-client-id': 'no-es-un-uuid',
      });
      await expectValidation(invalid, [{ field: 'header.x-client-id', reason: 'INVALID' }]);
      expect(invalid.raw).not.toContain('no-es-un-uuid');
      await expectValidation(
        await rawRequest(api, 'POST', path(flightId, '1A'), {
          'x-client-id': [newClientId(), newClientId()],
        }),
        [{ field: 'header.x-client-id', reason: 'DUPLICATE' }],
      );
    });

    it('la ruta no admite cuerpo', async () => {
      const response = await fetch(`${api.baseUrl}${path(seeded.nextFlightId(), '1A')}`, {
        method: 'POST',
        headers: { 'x-client-id': newClientId(), 'content-type': 'application/json' },
        body: '{}',
      });
      await expectValidation({ status: response.status, body: await response.json() }, [
        { field: 'body', reason: 'UNEXPECTED' },
      ]);
    });
  });
});
