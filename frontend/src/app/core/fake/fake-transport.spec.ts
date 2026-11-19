import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  CLIENT_ID_HEADER,
  HOLD_TOKEN_HEADER,
  TEST_CARDS,
  UUID_V4_PATTERN,
  type HoldResponse,
} from '@aeropulse/shared';
import { firstValueFrom } from 'rxjs';
import { vi } from 'vitest';
import { ClientIdentity } from '../api/client-identity';
import { ReservationApi } from '../api/reservation-api';
import { FlightRealtime } from '../socket/flight-realtime';
import { SOCKET_FACTORY } from '../socket/socket-factory';
import { FlightsStore } from '../stores/flights-store';
import { InventoryStore } from '../stores/inventory-store';
import { fakeHttp } from './fake-http';
import { FakeReservations } from './fake-reservations';
import { fakeSocket } from './fake-socket';

const query = { origin: 'BOG', destination: 'MDE', date: '2026-11-19' } as const;
const now = '2026-11-19T07:00:00.000Z';
const storageKey = 'aeropulse.clientId';

describe('Transporte fake', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date(now));
    sessionStorage.removeItem(storageKey);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(
          withInterceptors([
            fakeHttp({ search: true, seats: true, realtime: true, booking: true, admin: true }),
          ]),
        ),
        provideHttpClientTesting(),
        { provide: SOCKET_FACTORY, useFactory: () => fakeSocket(inject(FakeReservations)) },
      ],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    sessionStorage.removeItem(storageKey);
    vi.useRealTimers();
  });

  it('reutiliza la identidad de la pestaña, incluso con un inyector nuevo', () => {
    const id = TestBed.inject(ClientIdentity).id;
    expect(id).toMatch(UUID_V4_PATTERN);
    expect(sessionStorage.getItem(storageKey)).toBe(id);
    TestBed.resetTestingModule();
    expect(TestBed.inject(ClientIdentity).id).toBe(id);
  });

  it('valida fechas UTC y devuelve un catálogo vacío cuando no hay coincidencias', async () => {
    const api = TestBed.inject(ReservationApi);
    await expect(
      firstValueFrom(api.search({ ...query, date: '2026-11-31' })),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      status: 400,
    });
    await expect(firstValueFrom(api.search({ ...query, date: '2026-12-01' }))).resolves.toEqual({
      flights: [],
    });
    const { flights } = await firstValueFrom(api.search(query));
    expect(flights.map(({ departureAt }) => departureAt.slice(11, 13))).toEqual(['08', '14', '23']);
  });

  it('resuelve dos bloqueos competidores, recupera el bloqueo propio y publica el vencimiento', async () => {
    const api = TestBed.inject(ReservationApi);
    const http = TestBed.inject(HttpClient);
    const realtime = TestBed.inject(FlightRealtime);
    const { flights } = await firstValueFrom(api.search(query));
    const flight = flights[2];
    const inventory = TestBed.inject(InventoryStore).forFlight(flight.id);
    const path = `/api/flights/${flight.id}/seats/1A/hold`;
    realtime.watch({ flightId: flight.id, query });
    await vi.advanceTimersByTimeAsync(0);
    expect(realtime.connection().status).toBe('connected');
    expect(inventory.counts().AVAILABLE).toBe(6);
    expect(TestBed.inject(FlightsStore).results()).toEqual(flights);

    const [mine] = await Promise.all([
      firstValueFrom(api.hold(flight.id, '1A')),
      expect(
        firstValueFrom(
          http.post(path, null, { headers: { [CLIENT_ID_HEADER]: crypto.randomUUID() } }),
        ),
      ).rejects.toMatchObject({ status: 409, error: { error: { code: 'SEAT_UNAVAILABLE' } } }),
    ]);
    expect(mine.serverNow).toBe(now);
    expect(mine.hold.holdExpiresAt).toBe('2026-11-19T07:05:00.000Z');
    expect(inventory.counts().HELD).toBe(1);
    expect(inventory.myHold()).toEqual(mine.hold);

    const replay = await firstValueFrom(
      http.post(path, null, {
        observe: 'response',
        headers: { [CLIENT_ID_HEADER]: TestBed.inject(ClientIdentity).id },
      }),
    );
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual(mine);

    inventory.clearHold(mine.hold.holdToken);
    realtime.retry();
    await vi.advanceTimersByTimeAsync(0);
    expect(inventory.myHold()).toEqual(mine.hold);
    vi.advanceTimersByTime(300_000);
    await Promise.resolve();
    expect(inventory.myHold()).toBeNull();
    expect(inventory.counts().AVAILABLE).toBe(6);
    expect(inventory.seats().get('1A')?.version).toBe(3);
  });

  it('conserva la clave tras un pago rechazado y repite el boleto de una compra aprobada', async () => {
    const api = TestBed.inject(ReservationApi);
    const {
      flights: [flight],
    } = await firstValueFrom(api.search(query));
    const { hold } = await firstValueFrom(api.hold(flight.id, '1A'));
    const key = crypto.randomUUID();
    const booking = {
      flightId: flight.id,
      seatCode: '1A',
      holdToken: hold.holdToken,
      passenger: { firstName: 'Laura', lastName: 'Gómez' },
      payment: { cardNumber: TEST_CARDS[1].cardNumber },
    };
    await expect(firstValueFrom(api.confirm(booking, key))).rejects.toMatchObject({
      status: 402,
      code: 'PAYMENT_DECLINED',
    });
    const approved = { ...booking, payment: { cardNumber: TEST_CARDS[0].cardNumber } };
    const ticket = await firstValueFrom(api.confirm(approved, key));
    await expect(firstValueFrom(api.confirm(approved, key))).resolves.toEqual(ticket);
    await expect(firstValueFrom(api.ticket(ticket.code.toLowerCase(), 'gÓMEZ'))).resolves.toEqual(
      ticket,
    );
    await expect(firstValueFrom(api.ticket(ticket.code, 'Gomez'))).rejects.toMatchObject({
      code: 'BOOKING_NOT_FOUND',
    });
    await expect(
      firstValueFrom(
        api.confirm(
          {
            ...approved,
            passenger: { ...approved.passenger, firstName: 'Elena' },
          },
          key,
        ),
      ),
    ).rejects.toMatchObject({ status: 422, code: 'IDEMPOTENCY_KEY_REUSED' });
    expect(ticket).not.toHaveProperty('payment');
  });

  it('permite liberar un vuelo cancelado y un token viejo no afecta a un nuevo titular', async () => {
    const api = TestBed.inject(ReservationApi);
    const http = TestBed.inject(HttpClient);
    const {
      flights: [flight],
    } = await firstValueFrom(api.search(query));
    const { hold } = await firstValueFrom(api.hold(flight.id, '1A'));
    const path = `/api/flights/${flight.id}/seats/1A/hold`;
    const otherClient = crypto.randomUUID();
    const admin = 'aeropulse-admin-dev';

    await firstValueFrom(api.release(flight.id, '1A', hold.holdToken));
    await firstValueFrom(api.release(flight.id, '1A', hold.holdToken));
    const replacement = await firstValueFrom(
      http.post<HoldResponse>(path, null, { headers: { [CLIENT_ID_HEADER]: otherClient } }),
    );
    await expect(
      firstValueFrom(api.release(flight.id, '1A', hold.holdToken)),
    ).rejects.toMatchObject({ status: 409, code: 'HOLD_NOT_OWNED' });
    await expect(
      firstValueFrom(api.changeFlightStatus(flight.id, { status: 'CANCELLED' }, admin)),
    ).resolves.toMatchObject({ status: 'CANCELLED', version: 2 });
    await expect(firstValueFrom(api.hold(flight.id, '1B'))).rejects.toMatchObject({
      code: 'FLIGHT_CANCELLED',
    });
    const released = await firstValueFrom(
      http.delete(path, {
        observe: 'response',
        headers: {
          [CLIENT_ID_HEADER]: otherClient,
          [HOLD_TOKEN_HEADER]: replacement.hold.holdToken,
        },
      }),
    );
    expect(released.status).toBe(204);
  });
});
