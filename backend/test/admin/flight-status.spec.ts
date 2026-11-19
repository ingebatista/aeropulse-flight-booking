import type { ErrorResponse, FlightStatusEvent } from '@aeropulse/shared';
import { randomUUID } from 'node:crypto';
import {
  changeFlightStatus,
  holdSeat,
  newClientId,
  readSeat,
  type SeededDatabase,
  startApi,
  startSeededDatabase,
  TEST_ADMIN_TOKEN,
  type TestApi,
} from '../support/api';

describe('PATCH /api/admin/flights/{flightId}/status', () => {
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

  const errorOf = (body: unknown) => (body as ErrorResponse).error;
  const statusEvents = (): FlightStatusEvent[] =>
    api.events
      .filter((e) => e.type === 'flight.status_changed')
      .map((e) => e.payload as FlightStatusEvent);

  describe('transiciones', () => {
    it('SCHEDULED → DELAYED → CANCELLED, con versión creciente y un evento por cambio', async () => {
      const flightId = seeded.nextFlightId();

      const delayed = await changeFlightStatus(api, flightId, 'DELAYED');
      const cancelled = await changeFlightStatus(api, flightId, 'CANCELLED');

      expect(delayed).toMatchObject({
        status: 200,
        body: { flightId, status: 'DELAYED', soldOut: false, version: 2 },
      });
      expect(Object.keys(delayed.body).sort()).toEqual(
        ['flightId', 'soldOut', 'status', 'version'].sort(),
      );
      expect(cancelled.body).toEqual({ flightId, status: 'CANCELLED', soldOut: false, version: 3 });
      expect(statusEvents()).toEqual([delayed.body, cancelled.body]);
    });

    it('SCHEDULED → CANCELLED directo', async () => {
      const flightId = seeded.nextFlightId();
      const { status, body } = await changeFlightStatus(api, flightId, 'CANCELLED');
      expect(status).toBe(200);
      expect(body).toMatchObject({ status: 'CANCELLED', version: 2 });
    });

    it('repetir el mismo estado devuelve la versión actual sin emitir evento', async () => {
      const flightId = seeded.nextFlightId();
      await changeFlightStatus(api, flightId, 'DELAYED');
      api.clearEvents();

      const again = await changeFlightStatus(api, flightId, 'DELAYED');

      expect(again).toMatchObject({ status: 200, body: { status: 'DELAYED', version: 2 } });
      expect(statusEvents()).toHaveLength(0);
    });

    it('CANCELLED es terminal: pasar a DELAYED da 409 INVALID_FLIGHT_TRANSITION', async () => {
      const flightId = seeded.nextFlightId();
      await changeFlightStatus(api, flightId, 'CANCELLED');
      api.clearEvents();

      const back = await changeFlightStatus(api, flightId, 'DELAYED');
      const repeat = await changeFlightStatus(api, flightId, 'CANCELLED');

      expect(back.status).toBe(409);
      expect(errorOf(back.body).code).toBe('INVALID_FLIGHT_TRANSITION');
      expect(repeat).toMatchObject({ status: 200, body: { status: 'CANCELLED', version: 2 } });
      expect(statusEvents()).toHaveLength(0);
    });

    it('conserva soldOut, que es independiente del estado operativo', async () => {
      const flightId = seeded.nextFlightId();
      await seeded.owner.query(
        'UPDATE flights SET sold_out = true, version = version + 1 WHERE id = $1',
        [flightId],
      );

      const { body } = await changeFlightStatus(api, flightId, 'DELAYED');

      expect(body).toEqual({ flightId, status: 'DELAYED', soldOut: true, version: 3 });
    });

    it('un vuelo cancelado por administración rechaza nuevos bloqueos', async () => {
      const flightId = seeded.nextFlightId();
      await changeFlightStatus(api, flightId, 'CANCELLED');

      const { status, body } = await holdSeat(api, flightId, '1A', newClientId());

      expect(status).toBe(409);
      expect(errorOf(body).code).toBe('FLIGHT_CANCELLED');
    });

    it('cancelación y bloqueo simultáneos: el hold gana antes de la cancelación o revierte', async () => {
      for (let round = 0; round < 15; round++) {
        const flightId = seeded.nextFlightId();
        const [hold, cancel] = await Promise.all([
          holdSeat(api, flightId, '2B', newClientId()),
          changeFlightStatus(api, flightId, 'CANCELLED'),
        ]);

        expect(cancel.status).toBe(200);
        expect([201, 409]).toContain(hold.status);
        const seat = await readSeat(seeded.owner, flightId, '2B');
        if (hold.status === 201) {
          // El hold confirmó antes que la cancelación (que esperó su FOR SHARE).
          expect(seat.status).toBe('HELD');
        } else {
          expect(errorOf(hold.body).code).toBe('FLIGHT_CANCELLED');
          expect(seat).toMatchObject({ status: 'AVAILABLE', version: 1 });
        }
      }
    });
  });

  describe('autorización', () => {
    it.each([
      ['sin token', null],
      ['con un token incorrecto', 'otro-token'],
      ['con el token de desarrollo cuando la API usa otro', 'aeropulse-admin-dev'],
    ])('401 UNAUTHORIZED %s, con WWW-Authenticate: Bearer', async (_case, token) => {
      const response = await fetch(
        `${api.baseUrl}/api/admin/flights/${seeded.nextFlightId()}/status`,
        {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json',
            ...(token === null ? {} : { authorization: `Bearer ${token}` }),
          },
          body: JSON.stringify({ status: 'DELAYED' }),
        },
      );

      expect(response.status).toBe(401);
      expect(response.headers.get('www-authenticate')).toBe('Bearer');
      const raw = await response.text();
      expect(JSON.parse(raw).error.code).toBe('UNAUTHORIZED');
      if (token) expect(raw).not.toContain(token);
      expect(statusEvents()).toHaveLength(0);
    });

    it('401 con otro esquema (Basic) aunque el valor sea el token correcto', async () => {
      const response = await fetch(
        `${api.baseUrl}/api/admin/flights/${seeded.nextFlightId()}/status`,
        {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json',
            authorization: `Basic ${TEST_ADMIN_TOKEN}`,
          },
          body: JSON.stringify({ status: 'DELAYED' }),
        },
      );
      expect(response.status).toBe(401);
    });

    it('la autorización se comprueba antes que la validación del cuerpo', async () => {
      const { status } = await changeFlightStatus(api, 'no-es-uuid', 'BOARDING', null);
      expect(status).toBe(401);
    });
  });

  describe('validación y existencia', () => {
    it('solo admite DELAYED o CANCELLED', async () => {
      const flightId = seeded.nextFlightId();
      for (const status of ['SCHEDULED', 'BOARDING', 'delayed']) {
        const result = await changeFlightStatus(api, flightId, status);
        expect(result.status).toBe(400);
        expect(errorOf(result.body).fields).toEqual([{ field: 'body.status', reason: 'INVALID' }]);
      }
    });

    it('404 FLIGHT_NOT_FOUND y 400 para un id mal formado', async () => {
      const missing = await changeFlightStatus(api, randomUUID(), 'DELAYED');
      expect(missing.status).toBe(404);
      expect(errorOf(missing.body).code).toBe('FLIGHT_NOT_FOUND');

      const malformed = await changeFlightStatus(api, 'abc', 'DELAYED');
      expect(errorOf(malformed.body).fields).toEqual([
        { field: 'param.flightId', reason: 'INVALID' },
      ]);
    });

    it('415 si el cuerpo no es JSON', async () => {
      const response = await fetch(
        `${api.baseUrl}/api/admin/flights/${seeded.nextFlightId()}/status`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'text/plain', authorization: `Bearer ${TEST_ADMIN_TOKEN}` },
          body: 'DELAYED',
        },
      );
      expect(response.status).toBe(415);
    });
  });
});
