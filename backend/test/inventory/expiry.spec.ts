import type { ErrorResponse } from '@aeropulse/shared';
import { ExpirySweeper } from '../../apps/api/src/inventory/expiry-sweeper';
import {
  expireHold,
  holdSeat,
  newClientId,
  readSeat,
  releaseSeat,
  type SeededDatabase,
  startApi,
  startSeededDatabase,
  type TestApi,
  waitFor,
} from '../support/api';

describe('expiración de bloqueos', () => {
  let seeded: SeededDatabase;

  beforeAll(async () => {
    seeded = await startSeededDatabase();
  });

  afterAll(async () => {
    await seeded?.stop();
  });

  describe('barrido con el temporizador real, sin clientes conectados', () => {
    let api: TestApi;

    beforeAll(async () => {
      api = await startApi(seeded, { SWEEP_INTERVAL_MS: '200' });
    });

    afterAll(async () => {
      await api?.close();
    });

    it('libera el bloqueo vencido y emite un solo AVAILABLE con versión nueva', async () => {
      const flightId = seeded.nextFlightId();
      await holdSeat(api, flightId, '1A', newClientId());
      api.clearEvents();

      await expireHold(seeded.owner, flightId, '1A');
      await waitFor(
        async () => (await readSeat(seeded.owner, flightId, '1A')).status === 'AVAILABLE',
      );
      // Dejamos correr varias pasadas más: no deben repetir el evento.
      await new Promise((r) => setTimeout(r, 600));

      expect(await readSeat(seeded.owner, flightId, '1A')).toMatchObject({
        status: 'AVAILABLE',
        held_by: null,
        hold_token: null,
        hold_expires_at: null,
        version: 3,
      });
      expect(api.seatEvents(flightId)).toEqual([
        { flightId, seatCode: '1A', status: 'AVAILABLE', version: 3 },
      ]);
    });

    it('no toca un bloqueo vigente', async () => {
      const flightId = seeded.nextFlightId();
      const { body } = await holdSeat(api, flightId, '2A', newClientId());
      api.clearEvents();

      await new Promise((r) => setTimeout(r, 700));

      expect(await readSeat(seeded.owner, flightId, '2A')).toMatchObject({
        status: 'HELD',
        hold_token: body.hold.holdToken,
        version: 2,
      });
      expect(api.events).toHaveLength(0);
    });
  });

  describe('adquisición directa y pasadas manuales (barrido apagado)', () => {
    let api: TestApi;
    let sweeper: ExpirySweeper;

    beforeAll(async () => {
      api = await startApi(seeded, { HOLD_TTL_SECONDS: '30' });
      sweeper = api.app.get(ExpirySweeper);
    });

    afterAll(async () => {
      await api?.close();
    });

    beforeEach(() => api.clearEvents());

    it('respeta HOLD_TTL_SECONDS (30 s para demostraciones)', async () => {
      const { body } = await holdSeat(api, seeded.nextFlightId(), '1A', newClientId());
      expect(Date.parse(body.hold.holdExpiresAt) - Date.parse(body.serverNow)).toBe(30_000);
    });

    it('otro cliente toma un bloqueo vencido antes del barrido: solo HELD con versión mayor', async () => {
      const flightId = seeded.nextFlightId();
      const a = newClientId();
      const b = newClientId();
      const old = await holdSeat(api, flightId, '3B', a);
      await expireHold(seeded.owner, flightId, '3B');
      api.clearEvents();

      const fresh = await holdSeat(api, flightId, '3B', b);

      expect(fresh.status).toBe(201);
      expect(fresh.body.seat).toEqual({ flightId, seatCode: '3B', status: 'HELD', version: 3 });
      expect(api.seatEvents(flightId)).toEqual([fresh.body.seat]);

      // El titular anterior perdió el asiento: no puede volver a tomarlo ni liberarlo.
      const retry = await holdSeat(api, flightId, '3B', a);
      expect(retry.status).toBe(409);
      expect((retry.body as unknown as ErrorResponse).error.code).toBe('SEAT_UNAVAILABLE');
      const late = await releaseSeat(api, flightId, '3B', a, old.body.hold.holdToken);
      expect(late.status).toBe(409);

      // El barrido conserva el bloqueo nuevo mientras siga vigente.
      expect(await sweeper.sweepOnce()).toBe(0);
      expect((await readSeat(seeded.owner, flightId, '3B')).held_by).toBe(b);
    });

    it('el titular puede volver a tomar su propio asiento vencido con un token nuevo', async () => {
      const flightId = seeded.nextFlightId();
      const client = newClientId();
      const old = await holdSeat(api, flightId, '4C', client);
      await expireHold(seeded.owner, flightId, '4C');

      const again = await holdSeat(api, flightId, '4C', client);

      expect(again.status).toBe(201);
      expect(again.body.hold.holdToken).not.toBe(old.body.hold.holdToken);
      expect(again.body.seat.version).toBe(3);
    });

    it('una pasada libera todos los vencidos y la siguiente no encuentra nada', async () => {
      const flightId = seeded.nextFlightId();
      const seats = ['5A', '5B', '5C'];
      for (const seat of seats) {
        await holdSeat(api, flightId, seat, newClientId());
        await expireHold(seeded.owner, flightId, seat);
      }
      api.clearEvents();

      expect(await sweeper.sweepOnce()).toBe(3);
      expect(await sweeper.sweepOnce()).toBe(0);

      expect(
        api
          .seatEvents(flightId)
          .map((e) => [e.seatCode, e.status, e.version])
          .sort(),
      ).toEqual([
        ['5A', 'AVAILABLE', 3],
        ['5B', 'AVAILABLE', 3],
        ['5C', 'AVAILABLE', 3],
      ]);
    });
  });
});
