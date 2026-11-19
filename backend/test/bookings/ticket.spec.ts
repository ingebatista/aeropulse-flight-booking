import type { ErrorResponse, Ticket } from '@aeropulse/shared';
import {
  confirmBooking,
  getTicket,
  holdFor,
  type SeededDatabase,
  startApi,
  startSeededDatabase,
  type TestApi,
} from '../support/api';

describe('GET /api/bookings/{code}?lastName=', () => {
  let seeded: SeededDatabase;
  let api: TestApi;
  let ticket: Ticket;

  beforeAll(async () => {
    seeded = await startSeededDatabase();
    api = await startApi(seeded);
    const hold = await holdFor(api, seeded.nextFlightId(), '1A');
    const confirmed = await confirmBooking(api, {
      ...hold,
      firstName: 'María José',
      lastName: 'Gómez',
    });
    expect(confirmed.status).toBe(201);
    ticket = confirmed.body;
  });

  afterAll(async () => {
    await api?.close();
    await seeded?.stop();
  });

  const errorCode = (body: unknown) => (body as ErrorResponse).error.code;

  it('devuelve el mismo boleto que la confirmación', async () => {
    const { status, body } = await getTicket(api, ticket.code, 'Gómez');
    expect(status).toBe(200);
    expect(body).toEqual(ticket);
  });

  it('acepta el código en minúscula y el apellido sin distinguir mayúsculas', async () => {
    for (const lastName of ['gómez', 'GÓMEZ', '  Gómez ']) {
      const { status, body } = await getTicket(api, ticket.code.toLowerCase(), lastName);
      expect(status).toBe(200);
      expect(body.code).toBe(ticket.code);
    }
  });

  it('conserva los acentos: «Gomez» no identifica a «Gómez»', async () => {
    const { status, body } = await getTicket(api, ticket.code, 'Gomez');
    expect(status).toBe(404);
    expect(errorCode(body)).toBe('BOOKING_NOT_FOUND');
  });

  it('404 BOOKING_NOT_FOUND igual para un código inexistente y para un apellido incorrecto', async () => {
    const unknownCode = ticket.code === 'AAAAAA' ? 'BBBBBB' : 'AAAAAA';
    const noCode = await getTicket(api, unknownCode, 'Gómez');
    const wrongName = await getTicket(api, ticket.code, 'Pérez');

    expect(noCode.status).toBe(404);
    expect(wrongName.status).toBe(404);
    expect(noCode.body).toEqual(wrongName.body);
    expect(errorCode(noCode.body)).toBe('BOOKING_NOT_FOUND');
  });

  it('valida el código y el apellido', async () => {
    const badCode = await getTicket(api, 'ABC10O', 'Gómez');
    expect(badCode.status).toBe(400);
    expect((badCode.body as unknown as ErrorResponse).error.fields).toEqual([
      { field: 'param.code', reason: 'INVALID' },
    ]);

    const noLastName = await fetch(`${api.baseUrl}/api/bookings/${ticket.code}`);
    expect(await noLastName.json()).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
        fields: [{ field: 'query.lastName', reason: 'REQUIRED' }],
      },
    });
  });
});
