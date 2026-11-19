import type { ErrorResponse } from '@aeropulse/shared';
import { randomUUID } from 'node:crypto';
import { ExpirySweeper } from '../../apps/api/src/inventory/expiry-sweeper';
import {
  confirmBooking,
  countBookings,
  DECLINED_CARD,
  expireHold,
  holdFor,
  newClientId,
  readSeat,
  type SeededDatabase,
  startApi,
  startSeededDatabase,
  type TestApi,
} from '../support/api';

describe('POST /api/bookings/confirm', () => {
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

  describe('confirmación e idempotencia', () => {
    it('201 con el boleto; el asiento queda BOOKED y la reserva sin el número de tarjeta', async () => {
      const flightId = seeded.nextFlightId();
      const hold = await holdFor(api, flightId, '1A');
      api.clearEvents();

      const { status, body, raw } = await confirmBooking(api, hold);

      expect(status).toBe(201);
      expect(Object.keys(body).sort()).toEqual(
        ['amountCop', 'code', 'createdAt', 'flight', 'passenger', 'seatCode'].sort(),
      );
      expect(body.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
      expect(body).toMatchObject({
        seatCode: '1A',
        passenger: { firstName: 'Laura', lastName: 'Gómez' },
        amountCop: 289_000,
        flight: { id: flightId, origin: expect.any(String), destination: expect.any(String) },
      });
      expect(Object.keys(body.flight).sort()).toEqual(
        ['arrivalAt', 'departureAt', 'destination', 'flightNumber', 'id', 'origin'].sort(),
      );
      expect(body.createdAt).toMatch(/Z$/);
      // El boleto no lleva datos de pago, ni titular, ni token.
      for (const secret of ['4242424242424242', '4242', hold.clientId, hold.holdToken]) {
        expect(raw).not.toContain(secret);
      }

      expect(await readSeat(seeded.owner, flightId, '1A')).toMatchObject({
        status: 'BOOKED',
        held_by: null,
        hold_token: null,
        hold_expires_at: null,
        version: 3,
      });
      const [booking] = await seeded.owner.query(
        `SELECT code, amount_cop, card_last4, card_brand, payment_reference, request_hash
         FROM bookings WHERE flight_id = $1`,
        [flightId],
      );
      expect(booking).toMatchObject({
        code: body.code,
        amount_cop: 289_000,
        card_last4: '4242',
        card_brand: 'VISA',
      });
      expect(booking.payment_reference).toMatch(/^SIM-/);
      expect(booking.request_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(booking)).not.toContain('4242424242424242');

      expect(api.seatEvents(flightId)).toEqual([
        { flightId, seatCode: '1A', status: 'BOOKED', version: 3 },
      ]);
    });

    it('la misma clave y los mismos datos devuelven 200 con el mismo boleto, sin otra reserva', async () => {
      const flightId = seeded.nextFlightId();
      const hold = await holdFor(api, flightId, '2A');
      const idempotencyKey = randomUUID();
      const first = await confirmBooking(api, { ...hold, idempotencyKey });
      api.clearEvents();

      // Mismos datos con otra caja y otro número válido con la misma terminación.
      const again = await confirmBooking(api, {
        ...hold,
        idempotencyKey: idempotencyKey.toUpperCase(),
        flightId: flightId.toUpperCase(),
        firstName: '  Laura ',
        cardNumber: '4000056655694242',
      });

      expect(again.status).toBe(200);
      expect(again.body).toEqual(first.body);
      expect(await countBookings(seeded.owner, flightId)).toBe(1);
      expect(api.events).toHaveLength(0);
    });

    it('el reintento devuelve el boleto aunque el bloqueo ya se haya limpiado y venza', async () => {
      const flightId = seeded.nextFlightId();
      const hold = await holdFor(api, flightId, '3A');
      const idempotencyKey = randomUUID();
      const first = await confirmBooking(api, { ...hold, idempotencyKey });
      await api.app.get(ExpirySweeper).sweepOnce();

      const again = await confirmBooking(api, { ...hold, idempotencyKey });

      expect(again.status).toBe(200);
      expect(again.body).toEqual(first.body);
    });

    it('la misma clave con otros datos devuelve 422 IDEMPOTENCY_KEY_REUSED', async () => {
      const flightId = seeded.nextFlightId();
      const hold = await holdFor(api, flightId, '4A');
      const idempotencyKey = randomUUID();
      await confirmBooking(api, { ...hold, idempotencyKey });

      for (const patch of [{ lastName: 'Pérez' }, { cardNumber: '5555555555554444' }]) {
        const reused = await confirmBooking(api, { ...hold, idempotencyKey, ...patch });
        expect(reused.status).toBe(422);
        expect(errorCode(reused.body)).toBe('IDEMPOTENCY_KEY_REUSED');
      }
      expect(await countBookings(seeded.owner, flightId)).toBe(1);
    });
  });

  describe('pago', () => {
    it('402 con la tarjeta rechazada: el asiento sigue HELD y la misma clave sirve después', async () => {
      const flightId = seeded.nextFlightId();
      const hold = await holdFor(api, flightId, '1B');
      const idempotencyKey = randomUUID();
      api.clearEvents();

      const declined = await confirmBooking(api, {
        ...hold,
        idempotencyKey,
        cardNumber: DECLINED_CARD,
      });

      expect(declined.status).toBe(402);
      expect(errorCode(declined.body)).toBe('PAYMENT_DECLINED');
      expect(declined.raw).not.toContain(DECLINED_CARD);
      expect(await readSeat(seeded.owner, flightId, '1B')).toMatchObject({
        status: 'HELD',
        held_by: hold.clientId,
        version: 2,
      });
      expect(await countBookings(seeded.owner, flightId)).toBe(0);
      expect(api.events).toHaveLength(0);

      // La clave no quedó consumida: se corrige el pago dentro del plazo.
      const fixed = await confirmBooking(api, { ...hold, idempotencyKey });
      expect(fixed.status).toBe(201);
    });
  });

  describe('vigencia y titularidad del bloqueo', () => {
    it('409 HOLD_INACTIVE con un bloqueo vencido después del barrido', async () => {
      const flightId = seeded.nextFlightId();
      const hold = await holdFor(api, flightId, '5A');
      await expireHold(seeded.owner, flightId, '5A');
      await api.app.get(ExpirySweeper).sweepOnce();
      expect((await readSeat(seeded.owner, flightId, '5A')).status).toBe('AVAILABLE');
      api.clearEvents();

      const { status, body } = await confirmBooking(api, hold);

      expect(status).toBe(409);
      expect(errorCode(body)).toBe('HOLD_INACTIVE');
      expect(await countBookings(seeded.owner, flightId)).toBe(0);
      expect(api.events).toHaveLength(0);
    });

    it('409 HOLD_INACTIVE con el bloqueo vencido todavía en HELD (sin barrido)', async () => {
      const flightId = seeded.nextFlightId();
      const hold = await holdFor(api, flightId, '6A');
      await expireHold(seeded.owner, flightId, '6A');

      const { status, body } = await confirmBooking(api, hold);

      expect(status).toBe(409);
      expect(errorCode(body)).toBe('HOLD_INACTIVE');
      expect(await readSeat(seeded.owner, flightId, '6A')).toMatchObject({
        status: 'HELD',
        version: 2,
      });
    });

    it('409 HOLD_INACTIVE con un cliente o un token que no son los del titular', async () => {
      const flightId = seeded.nextFlightId();
      const hold = await holdFor(api, flightId, '2C');

      const otherClient = await confirmBooking(api, { ...hold, clientId: newClientId() });
      const otherToken = await confirmBooking(api, { ...hold, holdToken: randomUUID() });

      for (const result of [otherClient, otherToken]) {
        expect(result.status).toBe(409);
        expect(errorCode(result.body)).toBe('HOLD_INACTIVE');
      }
      expect((await readSeat(seeded.owner, flightId, '2C')).status).toBe('HELD');
    });

    it('404 si el vuelo o el asiento no existen', async () => {
      const hold = await holdFor(api, seeded.nextFlightId(), '1C');
      const noFlight = await confirmBooking(api, { ...hold, flightId: randomUUID() });
      const noSeat = await confirmBooking(api, { ...hold, seatCode: '9A' });

      expect(noFlight.status).toBe(404);
      expect(errorCode(noFlight.body)).toBe('FLIGHT_NOT_FOUND');
      expect(noSeat.status).toBe(404);
      expect(errorCode(noSeat.body)).toBe('SEAT_NOT_FOUND');
    });
  });

  describe('validación', () => {
    async function post(body: string, headers: Record<string, string> = {}) {
      const response = await fetch(`${api.baseUrl}/api/bookings/confirm`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-client-id': newClientId(),
          'idempotency-key': randomUUID(),
          ...headers,
        },
        body,
      });
      const raw = await response.text();
      return { status: response.status, body: raw ? JSON.parse(raw) : undefined, raw };
    }

    const valid = {
      flightId: randomUUID(),
      seatCode: '1A',
      holdToken: randomUUID(),
      passenger: { firstName: 'Laura', lastName: 'Gómez' },
      payment: { cardNumber: '4242424242424242' },
    };

    const fieldsOf = (body: unknown) =>
      ((body as ErrorResponse).error.fields ?? []).map((f) => `${f.field}:${f.reason}`).sort();

    it('informa cada campo inválido sin repetir valores', async () => {
      const { status, body, raw } = await post(
        JSON.stringify({
          flightId: 'abc',
          seatCode: '1E',
          holdToken: 42,
          passenger: { firstName: 'Ana\nMaría', lastName: '' },
          payment: { cardNumber: '4242424242424241', cvv: '123' },
          extra: true,
        }),
      );

      expect(status).toBe(400);
      expect(fieldsOf(body)).toEqual(
        [
          'body.extra:UNEXPECTED',
          'body.flightId:INVALID',
          'body.holdToken:INVALID',
          'body.passenger.firstName:INVALID',
          'body.passenger.lastName:INVALID',
          'body.payment.cardNumber:INVALID',
          'body.payment.cvv:UNEXPECTED',
          'body.seatCode:INVALID',
        ].sort(),
      );
      expect(raw).not.toContain('4242424242424241');
      expect(raw).not.toContain('123');
    });

    it('campos ausentes u objetos de otro tipo', async () => {
      const missing = await post(JSON.stringify({ flightId: valid.flightId }));
      expect(fieldsOf(missing.body)).toEqual(
        [
          'body.holdToken:REQUIRED',
          'body.passenger:REQUIRED',
          'body.payment:REQUIRED',
          'body.seatCode:REQUIRED',
        ].sort(),
      );

      const wrongType = await post(JSON.stringify({ ...valid, passenger: 'Laura' }));
      expect(fieldsOf(wrongType.body)).toEqual(['body.passenger:INVALID']);

      const array = await post(JSON.stringify([valid]));
      expect(fieldsOf(array.body)).toEqual(['body:INVALID']);
    });

    it('JSON mal formado → body INVALID; otro formato → 415', async () => {
      expect(fieldsOf((await post('{ "flightId": ')).body)).toEqual(['body:INVALID']);

      const text = await post('flightId=1', { 'content-type': 'text/plain' });
      expect(text.status).toBe(415);
      expect(errorCode(text.body)).toBe('UNSUPPORTED_MEDIA_TYPE');
    });

    it('exige Idempotency-Key como UUID v4', async () => {
      const response = await post(JSON.stringify(valid), { 'idempotency-key': 'clave-1' });
      expect(fieldsOf(response.body)).toEqual(['header.idempotency-key:INVALID']);
    });
  });
});
