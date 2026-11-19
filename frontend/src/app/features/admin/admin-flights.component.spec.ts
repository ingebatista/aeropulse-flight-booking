import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { type Flight } from '@aeropulse/shared';
import { vi } from 'vitest';
import { routes } from '../../app.routes';
import { ClientIdentity } from '../../core/api/client-identity';
import {
  SOCKET_FACTORY,
  type SocketFactory,
  type SocketHandlers,
} from '../../core/socket/socket-factory';
import { AdminSession } from './admin-session';

const serverNow = '2026-11-19T08:00:00.000Z';
const searchUrl = '/api/flights?origin=BOG&destination=MDE&date=2026-11-19';
const flight: Flight = {
  id: 'd92a8037-1598-4b45-985f-84158129142f',
  flightNumber: 'AP105',
  origin: 'BOG',
  destination: 'MDE',
  departureAt: '2026-11-19T22:30:00.000Z',
  arrivalAt: '2026-11-19T23:30:00.000Z',
  status: 'SCHEDULED',
  soldOut: true,
  fareCop: 199_000,
  version: 1,
};
const patchUrl = `/api/admin/flights/${flight.id}/status`;

describe('Administración y estado de vuelos', () => {
  let harness: RouterTestingHarness;
  let http: HttpTestingController;
  let handlers: SocketHandlers;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(serverNow));
    const factory: SocketFactory = (_auth, callbacks) => {
      handlers = callbacks;
      return {
        connect: () => callbacks.connect(),
        disconnect: () => undefined,
        join: (_room, ack) => ack({ ok: true, data: { serverNow } }),
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
    vi.useRealTimers();
  });

  function page(): HTMLElement {
    return harness.routeNativeElement!;
  }

  async function openAdmin(): Promise<void> {
    TestBed.inject(AdminSession).start('token-de-test');
    await harness.navigateByUrl('/admin');
    http.expectOne(searchUrl).flush({ flights: [flight] });
    harness.detectChanges();
  }

  function action(selector: string): HTMLButtonElement {
    return page().querySelector<HTMLButtonElement>(selector)!;
  }

  it('redirige sin token y conserva la credencial solo en memoria al entrar', async () => {
    await harness.navigateByUrl('/admin');
    expect(TestBed.inject(Router).url).toBe('/admin/acceso');
    expect(page().querySelector<HTMLInputElement>('#admin-token')?.type).toBe('password');
    http.expectNone(searchUrl);

    const field = page().querySelector<HTMLInputElement>('#admin-token')!;
    field.value = 'token-de-test';
    page()
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { cancelable: true }));
    expect(field.value).toBe('');
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/admin');
    http.expectOne(searchUrl).flush({ flights: [flight] });
    expect(JSON.stringify(localStorage)).not.toContain('token-de-test');
    expect(JSON.stringify(sessionStorage)).not.toContain('token-de-test');
  });

  it('limpia la sesión y vuelve al acceso cuando el servidor devuelve 401', async () => {
    await openAdmin();
    action('.flight__actions button').click();
    const request = http.expectOne(patchUrl);
    expect(request.request.headers.get('Authorization')).toBe('Bearer token-de-test');
    request.flush({ error: { code: 'UNAUTHORIZED' } }, { status: 401, statusText: 'Unauthorized' });
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/admin/acceso');
    expect(TestBed.inject(AdminSession).token).toBe('');
    expect(page().querySelector('[role="alert"]')?.textContent).toContain('no está autorizado');
  });

  it('funde el retraso y el evento duplicado por versión, y confirma la cancelación de forma explícita', async () => {
    await openAdmin();
    const delay = action('.flight__actions button');
    delay.click();
    delay.click();
    const request = http.expectOne({ url: patchUrl, method: 'PATCH' });
    expect(request.request.body).toEqual({ status: 'DELAYED' });
    const delayed = { flightId: flight.id, status: 'DELAYED', soldOut: true, version: 2 } as const;
    handlers.events['flight.status_changed'](delayed);
    request.flush(delayed);
    handlers.events['flight.status_changed']({ ...delayed, status: 'SCHEDULED' });
    harness.detectChanges();
    expect(page().querySelector('[data-status="DELAYED"]')).not.toBeNull();
    expect(page().querySelector('[data-status="SOLD_OUT"]')).not.toBeNull();
    expect(page().querySelectorAll('.flight__actions button')).toHaveLength(1);

    const dialog = page().querySelector('dialog')!;
    // jsdom permite probar el flujo de cierre, pero el navegador aplica el foco nativo.
    dialog.showModal = () => dialog.setAttribute('open', '');
    dialog.close = () => {
      dialog.removeAttribute('open');
      dialog.dispatchEvent(new Event('close'));
    };
    action('.flight__actions button').click();
    harness.detectChanges();
    expect(dialog.open).toBe(true);
    expect(dialog.textContent).toContain(flight.flightNumber);
    http.expectNone(patchUrl);
    action('.confirm-danger').click();
    const cancellation = http.expectOne(patchUrl);
    expect(cancellation.request.body).toEqual({ status: 'CANCELLED' });
    cancellation.flush({ ...delayed, status: 'CANCELLED', version: 3 });
    harness.detectChanges();
    expect(page().querySelector('[data-status="CANCELLED"]')).not.toBeNull();
    expect(page().querySelector('.flight__actions button')).toBeNull();
  });

  it('muestra la espera de Retry-After y actualiza el listado ante un conflicto', async () => {
    await openAdmin();
    action('.flight__actions button').click();
    http
      .expectOne(patchUrl)
      .flush(
        { error: { code: 'RATE_LIMITED' } },
        { status: 429, statusText: 'Too Many Requests', headers: { 'Retry-After': '8' } },
      );
    harness.detectChanges();
    expect(page().querySelector('[role="alert"]')?.textContent).toContain('8 segundos');
    action('.flight__actions button').click();
    http
      .expectOne(patchUrl)
      .flush(
        { error: { code: 'INVALID_FLIGHT_TRANSITION' } },
        { status: 409, statusText: 'Conflict' },
      );
    http.expectOne(searchUrl).flush({ flights: [{ ...flight, status: 'CANCELLED', version: 2 }] });
    harness.detectChanges();
    expect(page().querySelector('[role="alert"]')?.textContent).toContain('no admite ese cambio');
    expect(page().querySelector('[data-status="CANCELLED"]')).not.toBeNull();
  });

  it('ofrece ocupación y el acceso administrativo desde la vista pública de estado', async () => {
    await harness.navigateByUrl('/estado-de-vuelos');
    http.expectOne(searchUrl).flush({ flights: [{ ...flight, soldOut: false }] });
    harness.detectChanges();
    expect(page().querySelector('h1')?.textContent?.trim()).toBe('Estado de vuelos');
    expect(page().querySelector('a[href="/admin"]')).not.toBeNull();
    expect(page().querySelector(`a[href="/vuelos/${flight.id}/ocupacion"]`)).not.toBeNull();
    expect(page().querySelector('.flight__choose')).toBeNull();
  });
});
