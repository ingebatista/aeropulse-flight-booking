import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import {
  CLIENT_ID_HEADER,
  HOLD_TOKEN_HEADER,
  type Flight,
  type FlightSnapshot,
  type JoinResult,
  type RoomName,
  type SeatEvent,
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
const clientId = '53d65dc2-9904-43fb-9699-60c553a9d774';
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
const path = `/vuelos/${flight.id}`;
const held: SeatEvent = { flightId: flight.id, seatCode: '1A', status: 'HELD', version: 2 };
const hold = {
  seatCode: '1A',
  holdToken: '8d9540fe-8ef0-4a6b-abc8-82098c90b9ce',
  holdExpiresAt: '2026-11-19T08:00:02.000Z',
  version: 2,
};

function snapshot(rows: number, letters: string, myHold = false): FlightSnapshot {
  const seats = Array.from({ length: rows }, (_, row) =>
    [...letters].map((letter): SeatEvent => ({
      flightId: flight.id,
      seatCode: `${row + 1}${letter}`,
      status: 'AVAILABLE',
      version: 1,
    })),
  ).flat();
  if (myHold) seats[0] = held;
  return { flight, seats, myHold: myHold ? hold : null, serverNow };
}

describe('Mapa y ocupación de un vuelo', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  let sockets: { handlers: SocketHandlers; acks: Map<RoomName, (result: JoinResult) => void> }[];
  let monotonicTime: number;

  beforeEach(async () => {
    sockets = [];
    monotonicTime = 100;
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    vi.spyOn(performance, 'now').mockImplementation(() => monotonicTime);
    const factory: SocketFactory = (_auth, handlers) => {
      const acks = new Map<RoomName, (result: JoinResult) => void>();
      sockets.push({ handlers, acks });
      return {
        connect: () => undefined,
        disconnect: () => undefined,
        join: (room, ack) => acks.set(room, ack),
      };
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SOCKET_FACTORY, useValue: factory },
        { provide: ClientIdentity, useValue: { id: clientId } },
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

  function connect(): (result: JoinResult) => void {
    const socket = sockets.at(-1)!;
    socket.handlers.connect();
    socket.acks.get('search')!({ ok: true, data: { serverNow } });
    return socket.acks.get(`flight:${flight.id}`)!;
  }

  function render(data: FlightSnapshot): void {
    connect()({ ok: true, data });
    harness.detectChanges();
  }

  function page(): HTMLElement {
    return harness.routeNativeElement!;
  }

  function seatButton(code: string): HTMLButtonElement {
    const seats = [...page().querySelectorAll<HTMLButtonElement>('button.seat')];
    return seats.find((seat) => seat.querySelector('.seat-code')?.textContent === code)!;
  }

  it('espera la instantánea inicial y conserva el socket al cambiar al dashboard', async () => {
    await harness.navigateByUrl(`${path}/asientos`);
    const ack = connect();
    const socket = sockets[0];
    socket.handlers.events['seat.changed'](held);
    harness.detectChanges();
    expect(page().textContent).toContain('Cargando asientos');
    expect(page().querySelector('.cabin')).toBeNull();
    ack({ ok: true, data: snapshot(6, 'ABCD') });
    harness.detectChanges();
    expect(page().querySelectorAll('button.seat')).toHaveLength(24);
    expect(seatButton('1A').textContent).toContain('Bloqueado');

    await harness.navigateByUrl(`${path}/ocupacion`);
    expect(sockets).toHaveLength(1);
    expect(page().querySelectorAll('.cabin .seat')).toHaveLength(24);
    expect(page().querySelector('button.seat')).toBeNull();
    expect(page().querySelector('.capacity-total dd')?.textContent).toBe('24 plazas');
    expect(page().querySelector('.flight-summary time')?.textContent).toContain('22:30 UTC');
    expect(page().querySelector('.flight-badge')?.textContent).toContain('Programado');
    expect(page().querySelector('.seat-columns')?.textContent?.replace(/\s+/g, '')).toBe('ABCD');
    expect(page().querySelector(".count[data-status='HELD'] dd")?.textContent).toBe('1');
    expect(page().querySelector(".count[data-status='HELD'] .count-ratio")?.textContent).toMatch(
      /4,2\s*% del total/,
    );
    expect(page().querySelector('.distribution-bar [data-status="BOOKED"]')).toBeNull();
    socket.handlers.events['seat.changed']({ ...held, status: 'BOOKED', version: 3 });
    socket.handlers.events['seat.changed']({ ...held, status: 'AVAILABLE', version: 3 });
    socket.handlers.events['seat.changed'](held);
    harness.detectChanges();
    expect(page().querySelector(".count[data-status='AVAILABLE'] dd")?.textContent).toBe('23');
    expect(page().querySelector(".count[data-status='BOOKED'] dd")?.textContent).toBe('1');
    expect(page().querySelector(".cabin [data-status='BOOKED']")?.textContent).toContain('1A');
    const bar = page().querySelector('.distribution-bar');
    expect(bar?.querySelector<HTMLElement>('[data-status="AVAILABLE"]')?.style.flexGrow).toBe('23');
    expect(bar?.querySelector<HTMLElement>('[data-status="BOOKED"]')?.style.flexGrow).toBe('1');
    expect(bar?.querySelector('[data-status="HELD"]')).toBeNull();

    socket.handlers.disconnect();
    harness.detectChanges();
    expect(page().textContent).toContain('Sin conexión');
    expect(page().querySelector('.distribution-bar')).toBe(bar);
    render(snapshot(6, 'ABCD'));
    expect(page().querySelector('.distribution-bar')).toBe(bar);
    expect(page().querySelector(".cabin [data-status='BOOKED']")?.textContent).toContain('1A');
  });

  it('muestra el inventario vacío sin porcentajes ni barra de distribución', async () => {
    await harness.navigateByUrl(`${path}/ocupacion`);
    render(snapshot(0, ''));

    expect(page().querySelector('.capacity-total dd')?.textContent).toBe('0 plazas');
    expect([...page().querySelectorAll('.count-value')].map((count) => count.textContent)).toEqual([
      '0',
      '0',
      '0',
    ]);
    expect(page().querySelector('.count-ratio, .distribution-bar, .seat-legend')).toBeNull();
    expect(page().textContent).toContain('No hay asientos registrados para este vuelo.');
  });

  it('bloquea por HTTP, conserva el asiento anterior ante un 409 y lo libera por su token', async () => {
    await harness.navigateByUrl(`${path}/asientos`);
    render(snapshot(2, 'ABC'));
    expect(page().querySelectorAll('button.seat')).toHaveLength(6);
    const url = `/api/flights/${flight.id}/seats`;
    seatButton('1A').click();
    const request = http.expectOne({ method: 'POST', url: `${url}/1A/hold` });
    harness.detectChanges();
    expect(request.request.headers.get(CLIENT_ID_HEADER)).toBe(clientId);
    expect(page().querySelector('.own-hold')).toBeNull();
    request.flush({ seat: held, hold, serverNow });
    harness.detectChanges();
    expect(seatButton('1A').textContent).toContain('Mi asiento');

    seatButton('1B').click();
    http
      .expectOne({ method: 'POST', url: `${url}/1B/hold` })
      .flush({ error: { code: 'SEAT_UNAVAILABLE' } }, { status: 409, statusText: 'Conflicto' });
    harness.detectChanges();
    expect(page().querySelector('[role="alert"]')?.textContent).toContain('ya no está disponible');
    expect(seatButton('1A').textContent).toContain('Mi asiento');
    render(snapshot(2, 'ABC', true));

    page().querySelector<HTMLButtonElement>('.own-hold button')!.click();
    const release = http.expectOne({ method: 'DELETE', url: `${url}/1A/hold` });
    expect(release.request.headers.get(HOLD_TOKEN_HEADER)).toBe(hold.holdToken);
    release.flush(null, { status: 204, statusText: 'No Content' });
    harness.detectChanges();
    expect(page().querySelector('.own-hold')).toBeNull();
    expect(seatButton('1A').textContent).toContain('Bloqueado');
    sockets.at(-1)!.handlers.events['seat.changed']({ ...held, status: 'AVAILABLE', version: 3 });
    harness.detectChanges();
    expect(seatButton('1A').textContent).toContain('Disponible');
    expect(page().textContent).not.toContain('Venció el bloqueo');
  });

  it('recupera myHold al reconectar y espera seat.changed tras el vencimiento local', async () => {
    await harness.navigateByUrl(`${path}/asientos`);
    render(snapshot(2, 'ABC'));
    const seat = seatButton('1B');
    sockets[0].handlers.disconnect();
    harness.detectChanges();
    expect(page().textContent).toContain('Sin conexión');
    expect(seatButton('1B')).toBe(seat);
    seat.click();
    http.expectNone((request) => request.method === 'POST');

    render(snapshot(2, 'ABC', true));
    expect(page().querySelector('.countdown')?.textContent).toBe('00:02');
    monotonicTime = 2100;
    vi.advanceTimersByTime(200);
    harness.detectChanges();
    expect(page().textContent).toContain('Venció el bloqueo del asiento 1A');
    expect(seatButton('1A').textContent).toContain('Bloqueado');
    expect(seatButton('1A').getAttribute('aria-disabled')).toBe('true');
    sockets[0].handlers.events['seat.changed']({ ...held, status: 'AVAILABLE', version: 3 });
    harness.detectChanges();
    expect(seatButton('1A').textContent).toContain('Disponible');
  });

  it('anuncia el vencimiento cuando el barrido llega antes del último tick', async () => {
    await harness.navigateByUrl(`${path}/asientos`);
    render(snapshot(2, 'ABC', true));
    monotonicTime = 2099;
    sockets[0].handlers.events['seat.changed']({ ...held, status: 'AVAILABLE', version: 3 });
    harness.detectChanges();
    expect(page().textContent).toContain('Venció el bloqueo del asiento 1A');
    expect(seatButton('1A').textContent).toContain('Disponible');
  });

  it('muestra salida a la búsqueda para un identificador inválido o desconocido', async () => {
    await harness.navigateByUrl('/vuelos/invalido/asientos');
    expect(page().textContent).toContain('No se encontró el vuelo');
    expect(page().querySelector('.back')?.getAttribute('href')).toBe('/');
    expect(sockets).toHaveLength(0);

    await harness.navigateByUrl(`${path}/ocupacion`);
    connect()({
      ok: false,
      error: { code: 'FLIGHT_NOT_FOUND', message: 'No se encontró el vuelo.' },
    });
    harness.detectChanges();
    expect(page().textContent).toContain('No se encontró el vuelo');
    expect(page().querySelector('.cabin')).toBeNull();
  });
});
