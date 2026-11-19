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
        join: (room, ack) =>
          ack({
            ok: true,
            data:
              room === 'search' ? { serverNow } : { flight, seats: [], myHold: null, serverNow },
          }),
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

  async function openAdmin(flights: readonly Flight[] = [flight]): Promise<void> {
    TestBed.inject(AdminSession).start('token-de-test');
    await harness.navigateByUrl('/admin');
    http.expectOne(searchUrl).flush({ flights });
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
    action('.token-visibility').click();
    harness.detectChanges();
    expect(field.type).toBe('text');
    expect(field.value).toBe('token-de-test');
    action('.token-visibility').click();
    harness.detectChanges();
    expect(field.type).toBe('password');
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
    action('.admin-actions button').click();
    const request = http.expectOne(patchUrl);
    expect(request.request.headers.get('Authorization')).toBe('Bearer token-de-test');
    request.flush({ error: { code: 'UNAUTHORIZED' } }, { status: 401, statusText: 'Unauthorized' });
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/admin/acceso');
    expect(TestBed.inject(AdminSession).token).toBe('');
    expect(page().querySelector('[role="alert"]')?.textContent).toContain(
      `rechazó el token de administración al actualizar el vuelo ${flight.flightNumber}`,
    );
  });

  it('funde el retraso y el evento duplicado por versión, y confirma la cancelación de forma explícita', async () => {
    const other: Flight = {
      ...flight,
      id: '2cf76df7-e693-40ab-9ac1-0dd3e664501c',
      flightNumber: 'AP107',
    };
    await openAdmin([other, flight]);
    action(`#admin-flight-${flight.id}`).click();
    harness.detectChanges();
    expect(page().querySelector('.search-page--public')).toBeNull();
    expect(page().querySelector('h1')?.textContent?.trim()).toBe('Administración');
    const delay = action('.admin-actions button');
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
    expect(page().querySelectorAll('.admin-actions button')).toHaveLength(1);
    expect(TestBed.inject(Router).url).toBe('/admin');

    const dialog = page().querySelector('dialog')!;
    // jsdom permite probar el flujo de cierre, pero el navegador aplica el foco nativo.
    dialog.showModal = () => dialog.setAttribute('open', '');
    dialog.close = () => {
      dialog.removeAttribute('open');
      dialog.dispatchEvent(new Event('close'));
    };
    const cancel = action('.admin-actions button');
    cancel.click();
    harness.detectChanges();
    dialog.close();
    harness.detectChanges();
    http.expectNone(patchUrl);
    expect(document.activeElement).toBe(cancel);

    cancel.click();
    harness.detectChanges();
    expect(dialog.open).toBe(true);
    expect(dialog.textContent).toContain(flight.flightNumber);
    http.expectNone(patchUrl);
    action('.confirm-danger').click();
    const cancellation = http.expectOne({ url: patchUrl, method: 'PATCH' });
    expect(cancellation.request.headers.get('Authorization')).toBe('Bearer token-de-test');
    expect(cancellation.request.body).toEqual({ status: 'CANCELLED' });
    cancellation.flush({ ...delayed, status: 'CANCELLED', version: 3 });
    harness.detectChanges();
    expect(page().querySelector('[data-status="CANCELLED"]')).not.toBeNull();
    expect(page().querySelector('.admin-actions button')).toBeNull();
    expect(document.activeElement).toBe(action(`#admin-flight-${flight.id}`));
    expect(
      action(`#admin-flight-${other.id}`).querySelector('[data-status="SCHEDULED"]'),
    ).not.toBeNull();
    expect(TestBed.inject(Router).url).toBe('/admin');
  });

  it('selecciona el primer vuelo y conserva la selección por ID al recibir cambios', async () => {
    const second: Flight = {
      ...flight,
      id: '2cf76df7-e693-40ab-9ac1-0dd3e664501c',
      flightNumber: 'AP107',
    };
    await openAdmin([flight, second]);
    const firstOption = action(`#admin-flight-${flight.id}`);
    const secondOption = action(`#admin-flight-${second.id}`);
    expect(firstOption.getAttribute('aria-pressed')).toBe('true');
    expect(page().querySelector('#admin-detail-title')?.textContent).toBe(flight.flightNumber);

    secondOption.click();
    handlers.events['flight.status_changed']({
      flightId: second.id,
      status: 'DELAYED',
      soldOut: false,
      version: 2,
    });
    harness.detectChanges();
    expect(firstOption.getAttribute('aria-pressed')).toBe('false');
    expect(secondOption.getAttribute('aria-pressed')).toBe('true');
    expect(page().querySelector('#admin-detail-title')?.textContent).toBe(second.flightNumber);
    expect(page().querySelector('.admin-detail [data-status="DELAYED"]')).not.toBeNull();
    expect(page().querySelector('.admin-detail a')?.getAttribute('href')).toBe(
      `/vuelos/${second.id}/ocupacion?from=admin`,
    );
  });

  it('muestra la espera de Retry-After y actualiza el listado ante un conflicto', async () => {
    await openAdmin();
    action('.admin-actions button').click();
    http
      .expectOne(patchUrl)
      .flush(
        { error: { code: 'RATE_LIMITED' } },
        { status: 429, statusText: 'Too Many Requests', headers: { 'Retry-After': '8' } },
      );
    harness.detectChanges();
    expect(page().querySelector('[role="alert"]')?.textContent).toContain('8 segundos');
    action('.admin-actions button').click();
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

  it('vuelve al panel administrativo tras abrir la ocupación y visitar el mapa', async () => {
    await openAdmin();
    page().querySelector<HTMLAnchorElement>('.admin-occupancy a')!.click();
    await harness.fixture.whenStable();
    expect(page().querySelector('#occupancy-title')?.textContent).toContain('Ocupación del vuelo');

    page().querySelector<HTMLAnchorElement>('.detail-nav a')!.click();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe(`/vuelos/${flight.id}/asientos?from=admin`);
    page().querySelector<HTMLAnchorElement>('.detail-nav__occupancy')!.click();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe(`/vuelos/${flight.id}/ocupacion?from=admin`);

    const back = page().querySelector<HTMLAnchorElement>('.back')!;
    expect(back.textContent).toContain('Volver a administración');
    back.click();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/admin');
    http.expectOne(searchUrl).flush({ flights: [flight] });
    harness.detectChanges();
    expect(page().querySelector('.admin-tools button')?.textContent).toContain('Cerrar sesión');
  });

  it('pide acceso al regresar a administración si la sesión ya terminó', async () => {
    await harness.navigateByUrl(`/vuelos/${flight.id}/ocupacion?from=admin`);
    page().querySelector<HTMLAnchorElement>('.back')!.click();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/admin/acceso');
  });

  it('regresa desde ocupación a la vista pública de estado', async () => {
    TestBed.inject(AdminSession).start('token-de-test');
    await harness.navigateByUrl('/estado-de-vuelos');
    http.expectOne(searchUrl).flush({ flights: [{ ...flight, soldOut: false }] });
    harness.detectChanges();
    expect(page().querySelector('.search-page--public')).toBeNull();
    expect(page().querySelector('h1')?.textContent?.trim()).toBe('Estado de vuelos');
    expect(page().querySelector('.flight__choose')).toBeNull();

    page().querySelector<HTMLAnchorElement>('.flight__actions a')!.click();
    await harness.fixture.whenStable();
    expect(page().querySelector('#occupancy-title')?.textContent).toContain('Ocupación del vuelo');
    page().querySelector<HTMLAnchorElement>('.back')!.click();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/estado-de-vuelos');
    http.expectOne(searchUrl).flush({ flights: [flight] });
  });
});
