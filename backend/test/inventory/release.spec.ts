import type { ErrorResponse } from '@aeropulse/shared';
import { randomUUID } from 'node:crypto';
import {
  expireHold,
  holdSeat,
  newClientId,
  rawRequest,
  readSeat,
  releaseSeat,
  type SeededDatabase,
  startApi,
  startSeededDatabase,
  type TestApi,
} from '../support/api';

describe('DELETE /api/flights/{flightId}/seats/{seatCode}/hold', () => {
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

  it('liberar dos veces devuelve 204 ambas, con un solo seat.changed a AVAILABLE', async () => {
    const flightId = seeded.nextFlightId();
    const client = newClientId();
    const { body } = await holdSeat(api, flightId, '1A', client);
    api.clearEvents();

    const first = await releaseSeat(api, flightId, '1A', client, body.hold.holdToken);
    const second = await releaseSeat(api, flightId, '1A', client, body.hold.holdToken);

    expect([first.status, second.status]).toEqual([204, 204]);
    expect(first.raw).toBe('');
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

  it('una liberación tardía no afecta un bloqueo nuevo de otro cliente: 409 HOLD_NOT_OWNED', async () => {
    const flightId = seeded.nextFlightId();
    const a = newClientId();
    const b = newClientId();
    const old = await holdSeat(api, flightId, '2A', a);
    await releaseSeat(api, flightId, '2A', a, old.body.hold.holdToken);
    const fresh = await holdSeat(api, flightId, '2A', b);
    api.clearEvents();

    const late = await releaseSeat(api, flightId, '2A', a, old.body.hold.holdToken);
    // Ni siquiera con el token vigente, si el cliente no es el titular.
    const wrongClient = await releaseSeat(api, flightId, '2A', a, fresh.body.hold.holdToken);
    // Ni el titular con un token ajeno.
    const wrongToken = await releaseSeat(api, flightId, '2A', b, old.body.hold.holdToken);

    for (const result of [late, wrongClient, wrongToken]) {
      expect(result.status).toBe(409);
      expect(errorCode(result.body)).toBe('HOLD_NOT_OWNED');
      expect(result.raw).not.toContain(b);
      expect(result.raw).not.toContain(fresh.body.hold.holdToken);
    }
    expect(await readSeat(seeded.owner, flightId, '2A')).toMatchObject({
      status: 'HELD',
      held_by: b,
      hold_token: fresh.body.hold.holdToken,
      version: fresh.body.seat.version,
    });
    expect(api.events).toHaveLength(0);
  });

  it('un bloqueo vencido no se libera ni emite eventos: 204 y sigue HELD hasta el barrido', async () => {
    const flightId = seeded.nextFlightId();
    const client = newClientId();
    const { body } = await holdSeat(api, flightId, '3A', client);
    await expireHold(seeded.owner, flightId, '3A');
    api.clearEvents();

    const result = await releaseSeat(api, flightId, '3A', client, body.hold.holdToken);

    expect(result.status).toBe(204);
    expect(await readSeat(seeded.owner, flightId, '3A')).toMatchObject({
      status: 'HELD',
      version: 2,
    });
    expect(api.events).toHaveLength(0);
  });

  it('liberar un asiento disponible devuelve 204 sin cambios', async () => {
    const flightId = seeded.nextFlightId();
    const result = await releaseSeat(api, flightId, '4A', newClientId(), randomUUID());

    expect(result.status).toBe(204);
    expect((await readSeat(seeded.owner, flightId, '4A')).version).toBe(1);
    expect(api.events).toHaveLength(0);
  });

  it('se permite liberar aunque el vuelo esté cancelado', async () => {
    const flightId = seeded.nextFlightId();
    const client = newClientId();
    const { body } = await holdSeat(api, flightId, '5A', client);
    await seeded.owner.query(
      `UPDATE flights SET status = 'CANCELLED', version = version + 1 WHERE id = $1`,
      [flightId],
    );
    api.clearEvents();

    const result = await releaseSeat(api, flightId, '5A', client, body.hold.holdToken);

    expect(result.status).toBe(204);
    expect(api.seatEvents(flightId)).toEqual([
      { flightId, seatCode: '5A', status: 'AVAILABLE', version: 3 },
    ]);
  });

  it('404 si el vuelo o el asiento no existen', async () => {
    const noFlight = await releaseSeat(api, randomUUID(), '1A', newClientId(), randomUUID());
    const noSeat = await releaseSeat(api, seeded.nextFlightId(), '9D', newClientId(), randomUUID());

    expect(noFlight.status).toBe(404);
    expect(errorCode(noFlight.body)).toBe('FLIGHT_NOT_FOUND');
    expect(noSeat.status).toBe(404);
    expect(errorCode(noSeat.body)).toBe('SEAT_NOT_FOUND');
  });

  it('exige X-Hold-Token como UUID v4', async () => {
    const path = `/api/flights/${seeded.nextFlightId()}/seats/1A/hold`;
    const missing = await rawRequest(api, 'DELETE', path, { 'x-client-id': newClientId() });
    const invalid = await rawRequest(api, 'DELETE', path, {
      'x-client-id': newClientId(),
      'x-hold-token': 'token-falso',
    });

    expect(missing.status).toBe(400);
    expect(missing.body).toMatchObject({
      error: { fields: [{ field: 'header.x-hold-token', reason: 'REQUIRED' }] },
    });
    expect(invalid.body).toMatchObject({
      error: { fields: [{ field: 'header.x-hold-token', reason: 'INVALID' }] },
    });
    expect(invalid.raw).not.toContain('token-falso');
  });
});
