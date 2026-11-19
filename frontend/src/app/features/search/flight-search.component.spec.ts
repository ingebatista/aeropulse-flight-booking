import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { type Flight, type JoinResult } from '@aeropulse/shared';
import { vi } from 'vitest';
import { ClientIdentity } from '../../core/api/client-identity';
import {
  SOCKET_FACTORY,
  type SocketFactory,
  type SocketHandlers,
} from '../../core/socket/socket-factory';
import { FlightSearchComponent } from './flight-search.component';

const serverNow = '2026-11-19T07:00:00.000Z';
const url = '/api/flights?origin=BOG&destination=MDE&date=2026-11-19';
const flight: Flight = {
  id: 'd92a8037-1598-4b45-985f-84158129142f',
  flightNumber: 'AP108',
  origin: 'BOG',
  destination: 'MDE',
  departureAt: '2026-11-19T08:00:00.000Z',
  arrivalAt: '2026-11-19T09:00:00.000Z',
  fareCop: 240_000,
  status: 'SCHEDULED',
  soldOut: false,
  version: 1,
};

describe('Búsqueda de vuelos', () => {
  let fixture: ComponentFixture<FlightSearchComponent>;
  let page: HTMLElement;
  let http: HttpTestingController;
  let handlers: SocketHandlers;
  let ack: (result: JoinResult) => void;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(serverNow));
    const factory: SocketFactory = (_auth, events) => {
      handlers = events;
      return {
        connect: () => undefined,
        disconnect: () => undefined,
        join: (room, callback) => {
          expect(room).toBe('search');
          ack = callback;
        },
      };
    };
    TestBed.configureTestingModule({
      imports: [FlightSearchComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ClientIdentity, useValue: { id: '53d65dc2-9904-43fb-9699-60c553a9d774' } },
        { provide: SOCKET_FACTORY, useValue: factory },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(FlightSearchComponent);
    page = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  function connect(): void {
    handlers.connect();
    ack({ ok: true, data: { serverNow } });
  }

  function submit(): void {
    page.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
  }

  function field(selector: string, value: string, event: 'input' | 'change'): void {
    const control = page.querySelector<HTMLInputElement | HTMLSelectElement>(selector)!;
    control.value = value;
    control.dispatchEvent(new Event(event));
  }

  it('espera el reconocimiento, intercambia los aeropuertos y envía los filtros sin cambiar la fecha', async () => {
    http.expectNone(url);
    expect(page.querySelector<HTMLSelectElement>('#origin')?.value).toBe('BOG');
    expect(page.querySelector<HTMLSelectElement>('#destination')?.value).toBe('MDE');
    connect();
    http.expectOne(url).flush({ flights: [flight] });
    await fixture.whenStable();

    page.querySelector<HTMLButtonElement>('.swap')!.click();
    await fixture.whenStable();
    expect(page.querySelector<HTMLSelectElement>('#origin')?.value).toBe('MDE');
    expect(page.querySelector<HTMLSelectElement>('#destination')?.value).toBe('BOG');
    expect(page.querySelector<HTMLInputElement>('#flight-date')?.value).toBe('2026-11-19');
    submit();
    http
      .expectOne('/api/flights?origin=MDE&destination=BOG&date=2026-11-19')
      .flush({ flights: [] });
    await fixture.whenStable();
    expect(page.textContent).toContain('No hay vuelos para esta búsqueda');
  });

  it('impide consultas con aeropuertos iguales o sin fecha', async () => {
    connect();
    http.expectOne(url).flush({ flights: [flight] });
    field('#destination', 'BOG', 'change');
    await fixture.whenStable();
    submit();
    expect(page.querySelector('#destination')?.getAttribute('aria-invalid')).toBe('true');
    expect(page.textContent).toContain('Elige un destino distinto del origen');

    field('#destination', 'MDE', 'change');
    field('#flight-date', '', 'input');
    await fixture.whenStable();
    submit();
    expect(page.querySelector('#flight-date')?.getAttribute('aria-invalid')).toBe('true');
    expect(page.textContent).toContain('Introduce una fecha válida');
    http.expectNone((request) => request.url === '/api/flights');
  });

  it('ofrece el día siguiente una vez cuando el día inicial está vacío', async () => {
    connect();
    http.expectOne(url).flush({ flights: [] });
    await fixture.whenStable();
    http.expectOne(url.replace('19', '20')).flush({ flights: [] });
    await fixture.whenStable();
    expect(page.querySelector<HTMLInputElement>('#flight-date')?.value).toBe('2026-11-20');
    expect(page.textContent).toContain('No hay vuelos para esta búsqueda');
    http.expectNone((request) => request.url === '/api/flights');
  });

  it('respeta una edición del usuario mientras llega la consulta inicial', async () => {
    connect();
    const request = http.expectOne(url);
    field('#flight-date', '2026-11-22', 'input');
    request.flush({ flights: [] });
    await fixture.whenStable();
    expect(page.querySelector<HTMLInputElement>('#flight-date')?.value).toBe('2026-11-22');
    http.expectNone((candidate) => candidate.url === '/api/flights');
  });

  it('reintenta el HTTP y actualiza el mismo nodo con el estado más reciente', async () => {
    connect();
    http
      .expectOne(url)
      .flush({ error: { code: 'INTERNAL_ERROR' } }, { status: 500, statusText: 'Error' });
    await fixture.whenStable();
    expect(page.querySelector('[role="alert"]')?.textContent).toContain('Intenta de nuevo');
    page.querySelector<HTMLButtonElement>('.retry')!.click();
    handlers.events['flight.status_changed']({
      flightId: flight.id,
      status: 'DELAYED',
      soldOut: true,
      version: 2,
    });
    http.expectOne(url).flush({ flights: [flight] });
    await fixture.whenStable();
    const row = page.querySelector('.flight');
    expect(row?.textContent).toContain('Retrasado');
    expect(row?.textContent).toContain('Agotado');
    expect(row?.textContent).toContain('08:00');
    expect(row?.textContent).toContain('COP 240.000');

    handlers.events['flight.status_changed']({
      flightId: flight.id,
      status: 'CANCELLED',
      soldOut: true,
      version: 3,
    });
    await fixture.whenStable();
    expect(page.querySelector('.flight')).toBe(row);
    expect(row?.textContent).toContain('Cancelado');
    http.expectNone((request) => request.url === '/api/flights');
  });

  it('mantiene las filas al perder la conexión y repite la consulta al reconectar', async () => {
    connect();
    http.expectOne(url).flush({ flights: [flight] });
    await fixture.whenStable();
    const row = page.querySelector('.flight');
    handlers.disconnect();
    await fixture.whenStable();
    expect(page.textContent).toContain('Sin conexión');
    expect(page.querySelector('.flight')).toBe(row);

    connect();
    const refreshed = http.expectOne(url);
    await fixture.whenStable();
    expect(page.querySelector('.flight')).toBe(row);
    refreshed.flush({ flights: [flight] });
    await fixture.whenStable();
    expect(page.textContent).toContain('Conexión restablecida');
  });
});
