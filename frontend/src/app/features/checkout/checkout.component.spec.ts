import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import {
  IDEMPOTENCY_KEY_HEADER,
  TEST_CARDS,
  UUID_V4_PATTERN,
  type Flight,
  type FlightSnapshot,
  type Ticket,
} from '@aeropulse/shared';
import { vi } from 'vitest';
import { routes } from '../../app.routes';
import { ClientIdentity } from '../../core/api/client-identity';
import {
  SOCKET_FACTORY,
  type SocketFactory,
  type SocketHandlers,
} from '../../core/socket/socket-factory';

const serverNow = '2026-11-19T08:00:00.000Z';
const flight: Flight = {
  id: 'd92a8037-1598-4b45-985f-84158129142f',
  flightNumber: 'AP105',
  origin: 'BOG',
  destination: 'MDE',
  departureAt: '2026-11-19T22:30:00.000Z',
  arrivalAt: '2026-11-19T23:30:00.000Z',
  status: 'SCHEDULED',
  soldOut: false,
  fareCop: 199_000,
  version: 1,
};
const snapshot: FlightSnapshot = {
  flight,
  seats: [{ flightId: flight.id, seatCode: '1A', status: 'HELD', version: 2 }],
  myHold: {
    seatCode: '1A',
    holdToken: '8d9540fe-8ef0-4a6b-abc8-82098c90b9ce',
    holdExpiresAt: '2026-11-19T08:05:00.000Z',
    version: 2,
  },
  serverNow,
};
const ticket: Ticket = {
  code: 'ABC234',
  flight: {
    id: flight.id,
    flightNumber: flight.flightNumber,
    origin: flight.origin,
    destination: flight.destination,
    departureAt: flight.departureAt,
    arrivalAt: flight.arrivalAt,
  },
  passenger: { firstName: 'Laura', lastName: 'Gómez' },
  seatCode: '1A',
  amountCop: 199_000,
  createdAt: serverNow,
};
const path = `/vuelos/${flight.id}/checkout`;
const confirmUrl = '/api/bookings/confirm';

describe('Confirmación y consulta de reservas', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  let handlers: SocketHandlers;
  let initial: FlightSnapshot;

  beforeEach(async () => {
    initial = snapshot;
    const factory: SocketFactory = (_auth, callbacks) => {
      handlers = callbacks;
      return {
        connect: () => callbacks.connect(),
        disconnect: () => undefined,
        join: (room, ack) => ack({ ok: true, data: room === 'search' ? { serverNow } : initial }),
      };
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ClientIdentity, useValue: { id: '53d65dc2-9904-43fb-9699-60c553a9d774' } },
        { provide: SOCKET_FACTORY, useValue: factory },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function page(): HTMLElement {
    return harness.routeNativeElement!;
  }

  function fill(id: string, value: string): void {
    const input = page().querySelector<HTMLInputElement>(id)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  function submit(): void {
    page()
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { cancelable: true }));
  }

  function fillCheckout(card: string): void {
    fill('#first-name', ' Laura ');
    fill('#last-name', 'Go\u0301mez');
    fill('#card', card);
  }

  function bookSeat(): void {
    handlers.events['seat.changed']({ ...snapshot.seats[0], status: 'BOOKED', version: 3 });
    handlers.events['flight.status_changed']({
      flightId: flight.id,
      status: flight.status,
      soldOut: true,
      version: 2,
    });
  }

  it('conserva la clave tras el rechazo, evita dobles envíos y muestra el boleto tras perder el bloqueo', async () => {
    await harness.navigateByUrl(path);
    fillCheckout(TEST_CARDS[1].cardNumber);
    submit();
    submit();
    const first = http.expectOne(confirmUrl);
    const key = first.request.headers.get(IDEMPOTENCY_KEY_HEADER);
    expect(key).toMatch(UUID_V4_PATTERN);
    expect(first.request.body.passenger).toEqual(ticket.passenger);
    expect(first.request.body.payment).toEqual({ cardNumber: TEST_CARDS[1].cardNumber });
    expect(page().querySelector<HTMLInputElement>('#card')?.value).toBe('');
    first.flush({ error: { code: 'PAYMENT_DECLINED' } }, { status: 402, statusText: 'Declined' });
    harness.detectChanges();
    expect(page().querySelector('#card-error')?.textContent).toContain('El pago fue rechazado');

    fill('#card', TEST_CARDS[0].cardNumber);
    submit();
    const retry = http.expectOne(confirmUrl);
    expect(retry.request.headers.get(IDEMPOTENCY_KEY_HEADER)).toBe(key);
    bookSeat();
    harness.detectChanges();
    expect(page().textContent).toContain('Confirmando');
    retry.flush(ticket, { status: 201, statusText: 'Created' });
    harness.detectChanges();
    expect(page().querySelector('.booking-code')?.textContent).toBe(ticket.code);
    expect(page().textContent).toContain('COP 199.000');
    expect(page().querySelector('.ticket-details time')?.getAttribute('datetime')).toBe(
      ticket.createdAt,
    );
    expect(page().querySelector('#card')).toBeNull();
  });

  it('recupera una compra tras un fallo de red aunque el servidor ya haya reservado el asiento', async () => {
    await harness.navigateByUrl(path);
    fillCheckout(TEST_CARDS[0].cardNumber);
    submit();
    const first = http.expectOne(confirmUrl);
    bookSeat();
    first.error(new ProgressEvent('error'));
    harness.detectChanges();
    expect(page().textContent).toContain('No pudimos confirmar el resultado');
    expect(page().querySelector<HTMLInputElement>('#first-name')?.readOnly).toBe(true);

    fill('#card', TEST_CARDS[1].cardNumber);
    submit();
    http.expectNone(confirmUrl);
    harness.detectChanges();
    expect(page().querySelector('#card-error')?.textContent).toContain('4242');

    fill('#card', TEST_CARDS[0].cardNumber);
    submit();
    const retry = http.expectOne(confirmUrl);
    expect(retry.request.headers.get(IDEMPOTENCY_KEY_HEADER)).toBe(
      first.request.headers.get(IDEMPOTENCY_KEY_HEADER),
    );
    expect(retry.request.body).toEqual(first.request.body);
    retry.flush(ticket);
    harness.detectChanges();
    expect(page().querySelector('.booking-code')?.textContent).toBe(ticket.code);
  });

  it('explica el vencimiento y permite volver al mapa sin enviar la compra', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    let now = 100;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    await harness.navigateByUrl(path);
    fillCheckout(TEST_CARDS[0].cardNumber);
    now += 300_000;
    vi.advanceTimersByTime(200);
    harness.detectChanges();
    expect(page().textContent).toContain('Necesitas un bloqueo vigente');
    expect(page().querySelector('a.booking-primary')?.getAttribute('href')).toBe(
      `/vuelos/${flight.id}/asientos`,
    );
    http.expectNone(confirmUrl);
  });

  it('trata un 500 como incierto y detiene el intento si el servidor devuelve 422', async () => {
    await harness.navigateByUrl(path);
    fillCheckout(TEST_CARDS[0].cardNumber);
    submit();
    const first = http.expectOne(confirmUrl);
    first.flush({ error: { code: 'INTERNAL_ERROR' } }, { status: 500, statusText: 'Server Error' });
    harness.detectChanges();
    expect(page().textContent).toContain('Reintentar confirmación');
    fill('#card', TEST_CARDS[0].cardNumber);
    submit();
    const retry = http.expectOne(confirmUrl);
    expect(retry.request.headers.get(IDEMPOTENCY_KEY_HEADER)).toBe(
      first.request.headers.get(IDEMPOTENCY_KEY_HEADER),
    );
    retry.flush(
      { error: { code: 'IDEMPOTENCY_KEY_REUSED' } },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    harness.detectChanges();
    expect(page().textContent).toContain('La clave de compra ya se utilizó con otros datos');
    expect(page().querySelector('form')).toBeNull();
  });

  it('muestra la cancelación recibida al confirmar y bloquea nuevos envíos', async () => {
    await harness.navigateByUrl(path);
    fillCheckout(TEST_CARDS[0].cardNumber);
    submit();
    http
      .expectOne(confirmUrl)
      .flush({ error: { code: 'FLIGHT_CANCELLED' } }, { status: 409, statusText: 'Conflict' });
    harness.detectChanges();
    expect(page().querySelector('[role="alert"]')?.textContent).toContain('El vuelo fue cancelado');
    expect(page().querySelector('form')).toBeNull();
  });

  it('valida el formato, consulta por código y apellido y muestra el boleto recibido', async () => {
    await harness.navigateByUrl('/boletos');
    fill('#booking-code', '000000');
    fill('#booking-name', 'Pérez');
    submit();
    http.expectNone((request) => request.url.startsWith('/api/bookings/'));
    harness.detectChanges();
    expect(page().querySelector('#lookup-code-error')).not.toBeNull();
    expect(page().querySelector('#booking-code')?.getAttribute('aria-describedby')).toBe(
      'lookup-code-help lookup-code-error',
    );
    expect(document.activeElement?.id).toBe('booking-code');

    fill('#booking-code', ticket.code.toLowerCase());
    submit();
    http
      .expectOne(`/api/bookings/${ticket.code}?lastName=P%C3%A9rez`)
      .flush({ error: { code: 'BOOKING_NOT_FOUND' } }, { status: 404, statusText: 'Not Found' });
    harness.detectChanges();
    expect(page().querySelector('[role="alert"]')?.textContent).toContain(
      'No encontramos un boleto',
    );

    fill('#booking-name', '  Go\u0301mez  ');
    submit();
    http.expectOne(`/api/bookings/${ticket.code}?lastName=G%C3%B3mez`).flush(ticket);
    harness.detectChanges();
    expect(page().querySelector('.booking-code')?.textContent).toBe(ticket.code);
    expect(page().querySelector('form')).toBeNull();
  });

  it('muestra la carga, reintenta un fallo de conexión y restaura el formulario vacío', async () => {
    await harness.navigateByUrl('/boletos');
    fill('#booking-code', ticket.code);
    fill('#booking-name', ticket.passenger.lastName);
    submit();
    submit();
    const lookupUrl = `/api/bookings/${ticket.code}?lastName=G%C3%B3mez`;
    const first = http.expectOne(lookupUrl);
    harness.detectChanges();
    const button = page().querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('Consultando…');
    first.error(new ProgressEvent('error'));
    harness.detectChanges();
    expect(button.disabled).toBe(false);
    expect(button.textContent).toContain('Reintentar consulta');
    expect(page().querySelector('[role="alert"]')).not.toBeNull();

    submit();
    http.expectOne(lookupUrl).flush(ticket);
    harness.detectChanges();
    expect(page().querySelector('form')).toBeNull();
    expect(page().querySelector('.booking-code')?.textContent).toBe(ticket.code);

    page().querySelector<HTMLButtonElement>('.lookup-reset')!.click();
    await harness.fixture.whenStable();
    expect(page().querySelector('app-ticket')).toBeNull();
    expect(page().querySelector<HTMLInputElement>('#booking-code')?.value).toBe('');
    expect(page().querySelector<HTMLInputElement>('#booking-name')?.value).toBe('');
    expect(document.activeElement?.id).toBe('booking-code');
    http.expectNone(lookupUrl);
  });

  it('copia solo el código, ofrece copia manual si falla e imprime el boleto', async () => {
    const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error());
    const navigatorWithClipboard: Navigator = Object.create(window.navigator);
    Object.defineProperty(navigatorWithClipboard, 'clipboard', { value: { writeText } });
    vi.spyOn(window, 'navigator', 'get').mockReturnValue(navigatorWithClipboard);
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);

    await harness.navigateByUrl('/boletos');
    fill('#booking-code', ticket.code);
    fill('#booking-name', ticket.passenger.lastName);
    submit();
    http.expectOne(`/api/bookings/${ticket.code}?lastName=G%C3%B3mez`).flush(ticket);
    harness.detectChanges();

    const copy = page().querySelector<HTMLButtonElement>('.code-actions button')!;
    copy.click();
    await Promise.resolve();
    harness.detectChanges();
    expect(writeText).toHaveBeenCalledWith(ticket.code);
    expect(page().querySelector('.copy-feedback')?.textContent).toBe('Código copiado.');

    copy.click();
    await Promise.resolve();
    harness.detectChanges();
    expect(page().querySelector('.copy-feedback')?.textContent).toContain('manualmente');
    page().querySelector<HTMLButtonElement>('.ticket-actions button')!.click();
    expect(print).toHaveBeenCalledOnce();
  });
});
