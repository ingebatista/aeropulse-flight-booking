import type { ErrorResponse, HoldResponse } from '@aeropulse/shared';
import {
  holdSeat,
  newClientId,
  readSeat,
  type SeededDatabase,
  startApi,
  startSeededDatabase,
  type TestApi,
} from '../support/api';

describe('hold concurrente (PostgreSQL real)', () => {
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

  it('50 clientes distintos sobre el mismo asiento: 1 × 201 y 49 × 409 SEAT_UNAVAILABLE', async () => {
    const flightId = seeded.nextFlightId();
    const clients = Array.from({ length: 50 }, newClientId);

    const results = await Promise.all(clients.map((c) => holdSeat(api, flightId, '3C', c)));

    const created = results.filter((r) => r.status === 201);
    const conflicts = results.filter((r) => r.status === 409);
    expect(created).toHaveLength(1);
    expect(conflicts).toHaveLength(49);
    for (const conflict of conflicts) {
      expect((conflict.body as unknown as ErrorResponse).error.code).toBe('SEAT_UNAVAILABLE');
    }

    // Se guardó un solo bloqueo, del cliente que obtuvo el 201.
    const winner = clients[results.indexOf(created[0])];
    const hold = (created[0].body as HoldResponse).hold;
    const seat = await readSeat(seeded.owner, flightId, '3C');
    expect(seat).toMatchObject({
      status: 'HELD',
      held_by: winner,
      hold_token: hold.holdToken,
      version: 2,
    });

    // Un solo seat.changed a HELD, con la versión guardada.
    expect(api.seatEvents(flightId, '3C')).toEqual([
      { flightId, seatCode: '3C', status: 'HELD', version: 2 },
    ]);
  });

  it('ningún conflicto expone el titular ni el token del ganador', async () => {
    const flightId = seeded.nextFlightId();
    const clients = Array.from({ length: 10 }, newClientId);

    const results = await Promise.all(clients.map((c) => holdSeat(api, flightId, '4D', c)));
    const seat = await readSeat(seeded.owner, flightId, '4D');

    for (const result of results.filter((r) => r.status === 409)) {
      expect(result.raw).not.toContain(seat.held_by as string);
      expect(result.raw).not.toContain(seat.hold_token as string);
    }
  });
});
