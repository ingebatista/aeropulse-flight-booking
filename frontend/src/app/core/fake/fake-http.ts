import {
  HttpErrorResponse,
  HttpHeaders,
  HttpResponse,
  type HttpInterceptorFn,
  type HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import {
  ADMIN_FLIGHT_STATUSES,
  AIRPORT_CODES,
  BOOKING_CODE_PATTERN,
  CARD_NUMBER_PATTERN,
  CLIENT_ID_HEADER,
  DATE_PATTERN,
  ERROR_HTTP_STATUS,
  HOLD_TOKEN_HEADER,
  IDEMPOTENCY_KEY_HEADER,
  NAME_MAX_LENGTH,
  NAME_MIN_LENGTH,
  SEAT_CODE_PATTERN,
  UUID_V4_PATTERN,
  type ConfirmBookingRequest,
  type ErrorResponse,
  type ValidationReason,
} from '@aeropulse/shared';
import { defer, of } from 'rxjs';
import { FakeError, FakeReservations } from './fake-reservations';

type Capability = 'search' | 'seats' | 'realtime' | 'booking' | 'admin';
export type FakeCapabilities = Readonly<Record<Capability, boolean>>;

export function fakeHttp(capabilities: FakeCapabilities): HttpInterceptorFn {
  return (request, next) => {
    if (!request.url.startsWith('/api/')) return next(request);
    const url = new URL(request.urlWithParams, 'http://aeropulse.local');
    const dispatch = match(request.method, url.pathname, capabilities);
    if (!dispatch) return next(request);

    const fake = inject(FakeReservations);
    return defer(() => {
      try {
        return of(dispatch(fake, request, url.searchParams));
      } catch (cause) {
        const error = cause instanceof FakeError ? cause : new FakeError('INTERNAL_ERROR');
        const body: ErrorResponse = { error: { code: error.code, message: error.message } };
        if (error.fields) body.error.fields = error.fields;
        throw new HttpErrorResponse({
          error: body,
          status: ERROR_HTTP_STATUS[error.code],
          url: request.url,
          headers:
            error.code === 'UNAUTHORIZED'
              ? new HttpHeaders({ 'WWW-Authenticate': 'Bearer' })
              : undefined,
        });
      }
    });
  };
}

type Dispatch = (
  fake: FakeReservations,
  request: HttpRequest<unknown>,
  params: URLSearchParams,
) => HttpResponse<unknown>;

function match(method: string, path: string, capabilities: FakeCapabilities): Dispatch | undefined {
  if (capabilities.search && method === 'GET' && path === '/api/flights') {
    return (fake, request, params) => {
      withoutBody(request);
      const query = queryFields(params, ['origin', 'destination', 'date']);
      const origin = choice(query.origin, AIRPORT_CODES, 'query.origin');
      const destination = choice(query.destination, AIRPORT_CODES, 'query.destination');
      if (origin === destination) invalid('query.destination');
      const date = checked(query.date, DATE_PATTERN, 'query.date');
      const instant = new Date(date);
      if (!Number.isFinite(instant.getTime()) || instant.toISOString().slice(0, 10) !== date)
        invalid('query.date');
      return new HttpResponse({ body: fake.search({ origin, destination, date }) });
    };
  }

  const hold = /^\/api\/flights\/([^/]+)\/seats\/([^/]+)\/hold$/.exec(path);
  if (capabilities.seats && hold && (method === 'POST' || method === 'DELETE')) {
    return (fake, request, params) => {
      withoutBody(request);
      queryFields(params, []);
      const flightId = uuid(segment(hold[1], 'path.flightId'), 'path.flightId');
      const seatCode = checked(
        segment(hold[2], 'path.seatCode'),
        SEAT_CODE_PATTERN,
        'path.seatCode',
      );
      const clientId = uuid(header(request, CLIENT_ID_HEADER), `header.${CLIENT_ID_HEADER}`);
      if (method === 'POST') return new HttpResponse(fake.hold(flightId, seatCode, clientId));
      fake.release(
        flightId,
        seatCode,
        clientId,
        uuid(header(request, HOLD_TOKEN_HEADER), `header.${HOLD_TOKEN_HEADER}`),
      );
      return new HttpResponse({ status: 204 });
    };
  }

  if (capabilities.booking && path === '/api/bookings/confirm' && method === 'POST') {
    return (fake, request, params) => {
      queryFields(params, []);
      const clientId = uuid(header(request, CLIENT_ID_HEADER), `header.${CLIENT_ID_HEADER}`);
      const key = uuid(header(request, IDEMPOTENCY_KEY_HEADER), `header.${IDEMPOTENCY_KEY_HEADER}`);
      return new HttpResponse(fake.confirm(confirmation(json(request)), clientId, key));
    };
  }
  const booking = /^\/api\/bookings\/([^/]+)$/.exec(path);
  if (capabilities.booking && booking && method === 'GET') {
    return (fake, request, params) => {
      withoutBody(request);
      const code = checked(
        segment(booking[1], 'path.code').toUpperCase(),
        BOOKING_CODE_PATTERN,
        'path.code',
      );
      const { lastName } = queryFields(params, ['lastName']);
      return new HttpResponse({ body: fake.ticket(code, name(lastName, 'query.lastName')) });
    };
  }

  const admin = /^\/api\/admin\/flights\/([^/]+)\/status$/.exec(path);
  if (capabilities.admin && admin && method === 'PATCH') {
    return (fake, request, params) => {
      const token = header(request, 'Authorization')?.match(/^Bearer (\S+)$/i)?.[1];
      if (token !== 'aeropulse-admin-dev') {
        throw new FakeError('UNAUTHORIZED');
      }
      queryFields(params, []);
      const flightId = uuid(segment(admin[1], 'path.flightId'), 'path.flightId');
      const body = fields(json(request), ['status'], 'body');
      const status = choice(body.status, ADMIN_FLIGHT_STATUSES, 'body.status');
      return new HttpResponse({ body: fake.changeStatus(flightId, status) });
    };
  }
  return undefined;
}

function invalid(field: string, reason: ValidationReason = 'INVALID'): never {
  throw new FakeError('VALIDATION_ERROR', [{ field, reason }]);
}

function segment(value: string, field: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return invalid(field);
  }
}

function header(request: HttpRequest<unknown>, key: string): string | undefined {
  const values = request.headers.getAll(key) ?? [];
  if (values.length > 1) invalid(`header.${key.toLowerCase()}`, 'DUPLICATE');
  return values[0];
}

function queryFields(params: URLSearchParams, keys: readonly string[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of params) {
    if (!keys.includes(key)) invalid(`query.${key}`, 'UNEXPECTED');
    if (Object.hasOwn(values, key)) invalid(`query.${key}`, 'DUPLICATE');
    values[key] = value;
  }
  return values;
}

function fields(value: unknown, keys: readonly string[], prefix: string): Record<string, unknown> {
  if (value === undefined) invalid(prefix, 'REQUIRED');
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(prefix);
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) invalid(`${prefix}.${key}`, 'UNEXPECTED');
  }
  return value as Record<string, unknown>;
}

function withoutBody(request: HttpRequest<unknown>): void {
  if (request.body !== null) invalid('body', 'UNEXPECTED');
}

function json(request: HttpRequest<unknown>): unknown {
  if (request.body === null) return undefined;
  const type = header(request, 'Content-Type') ?? request.detectContentTypeHeader();
  if (type?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new FakeError('UNSUPPORTED_MEDIA_TYPE');
  }
  if (typeof request.body !== 'string') return request.body;
  try {
    return JSON.parse(request.body) as unknown;
  } catch {
    return invalid('body');
  }
}

function checked(value: unknown, pattern: RegExp, field: string): string {
  if (value === undefined) invalid(field, 'REQUIRED');
  if (typeof value !== 'string' || !pattern.test(value)) invalid(field);
  return value;
}

function choice<T extends string>(value: unknown, options: readonly T[], field: string): T {
  const match = options.find((option) => option === value);
  if (match === undefined) invalid(field, value === undefined ? 'REQUIRED' : 'INVALID');
  return match;
}

function uuid(value: unknown, field: string): string {
  return checked(value, UUID_V4_PATTERN, field).toLowerCase();
}

function name(value: unknown, field: string): string {
  const clean = checked(value, /^[^\p{Cc}\p{Zl}\p{Zp}]*$/u, field)
    .normalize('NFC')
    .trim();
  if (clean.length < NAME_MIN_LENGTH || clean.length > NAME_MAX_LENGTH) invalid(field);
  return clean;
}

function confirmation(value: unknown): ConfirmBookingRequest {
  const body = fields(value, ['flightId', 'seatCode', 'holdToken', 'passenger', 'payment'], 'body');
  const passenger = fields(body.passenger, ['firstName', 'lastName'], 'body.passenger');
  const payment = fields(body.payment, ['cardNumber'], 'body.payment');
  const cardNumber = checked(payment.cardNumber, CARD_NUMBER_PATTERN, 'body.payment.cardNumber');
  const sum = [...cardNumber].reverse().reduce((total, char, index) => {
    const digit = Number(char) * (index % 2 === 0 ? 1 : 2);
    return total + (digit > 9 ? digit - 9 : digit);
  }, 0);
  if (sum % 10 !== 0) invalid('body.payment.cardNumber');
  return {
    flightId: uuid(body.flightId, 'body.flightId'),
    seatCode: checked(body.seatCode, SEAT_CODE_PATTERN, 'body.seatCode'),
    holdToken: uuid(body.holdToken, 'body.holdToken'),
    passenger: {
      firstName: name(passenger.firstName, 'body.passenger.firstName'),
      lastName: name(passenger.lastName, 'body.passenger.lastName'),
    },
    payment: { cardNumber },
  };
}
