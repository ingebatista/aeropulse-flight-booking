import type { ErrorResponse } from '@aeropulse/shared';
import { randomUUID } from 'node:crypto';
import {
  confirmBooking,
  countBookings,
  holdFor,
  newClientId,
  readSeat,
  type SeededDatabase,
  startApi,
  startSeededDatabase,
  type TestApi,
} from '../support/api';

describe('confirmaciones concurrentes (PostgreSQL real)', () => {
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

  it('20 confirmaciones simultáneas con la misma clave y huella: 1 × 201, 19 × 200, una reserva', async () => {
    const flightId = seeded.nextFlightId();
    const hold = await holdFor(api, flightId, '2B');
    const idempotencyKey = randomUUID();
    api.clearEvents();

    const results = await Promise.all(
      Array.from({ length: 20 }, () => confirmBooking(api, { ...hold, idempotencyKey })),
    );

    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 200)).toHaveLength(19);
    // Todas devuelven el mismo boleto.
    expect(new Set(results.map((r) => r.body.code)).size).toBe(1);

    expect(await countBookings(seeded.owner, flightId)).toBe(1);
    expect(await readSeat(seeded.owner, flightId, '2B')).toMatchObject({
      status: 'BOOKED',
      version: 3,
    });
    expect(api.seatEvents(flightId)).toEqual([
      { flightId, seatCode: '2B', status: 'BOOKED', version: 3 },
    ]);
  });

  it('la misma clave sobre dos asientos distintos: un 201 y un 422; el perdedor sigue HELD', async () => {
    const client = newClientId();
    const flightA = seeded.nextFlightId();
    const flightB = seeded.nextFlightId();
    const holdA = await holdFor(api, flightA, '3A', client);
    const holdB = await holdFor(api, flightB, '3A', client);
    const idempotencyKey = randomUUID();
    api.clearEvents();

    const [a, b] = await Promise.all([
      confirmBooking(api, { ...holdA, idempotencyKey }),
      confirmBooking(api, { ...holdB, idempotencyKey }),
    ]);

    expect([a.status, b.status].sort()).toEqual([201, 422]);
    const [winner, loser] = a.status === 201 ? [holdA, holdB] : [holdB, holdA];
    const rejected = a.status === 201 ? b : a;
    expect((rejected.body as unknown as ErrorResponse).error.code).toBe('IDEMPOTENCY_KEY_REUSED');

    expect(await readSeat(seeded.owner, winner.flightId, '3A')).toMatchObject({
      status: 'BOOKED',
    });
    // El intento perdedor revirtió su UPDATE: conserva el bloqueo y su versión.
    expect(await readSeat(seeded.owner, loser.flightId, '3A')).toMatchObject({
      status: 'HELD',
      held_by: client,
      hold_token: loser.holdToken,
      version: 2,
    });
    expect(api.seatEvents(loser.flightId)).toHaveLength(0);
    expect(api.seatEvents(winner.flightId)).toHaveLength(1);
  });

  it('dos clientes no pueden confirmar el mismo asiento: el segundo bloqueo nunca existió', async () => {
    const flightId = seeded.nextFlightId();
    const hold = await holdFor(api, flightId, '4B');
    const intruder = { ...hold, clientId: newClientId() };

    const [owner, other] = await Promise.all([
      confirmBooking(api, hold),
      confirmBooking(api, intruder),
    ]);

    expect(owner.status).toBe(201);
    expect(other.status).toBe(409);
    expect(await countBookings(seeded.owner, flightId)).toBe(1);
  });
});
