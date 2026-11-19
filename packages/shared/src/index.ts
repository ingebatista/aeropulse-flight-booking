/**
 * Contratos v1 entre frontend y backend (etiqueta `contracts-v1`).
 *
 * Fuente de verdad: docs/handoff/contracts-and-open-questions.md. Este archivo solo
 * refleja lo que cruza el cable: tipos, valores cerrados y patrones de validación.
 * Congelado tras M0: cualquier cambio se pide como `CCR-n` al integrador.
 * No importa nada y no contiene lógica de negocio.
 */

// ---------------------------------------------------------------------------
// Valores cerrados
// ---------------------------------------------------------------------------

/** Catálogo cerrado de aeropuertos. También es un `CHECK` en la base de datos. */
export const AIRPORT_CODES = ['BAQ', 'BOG', 'MDE'] as const;
export type AirportCode = (typeof AIRPORT_CODES)[number];

export const SEAT_STATUSES = ['AVAILABLE', 'HELD', 'BOOKED'] as const;
export type SeatStatus = (typeof SEAT_STATUSES)[number];

export const FLIGHT_STATUSES = ['SCHEDULED', 'DELAYED', 'CANCELLED'] as const;
export type FlightStatus = (typeof FLIGHT_STATUSES)[number];

/** Estados que administración puede asignar. `SCHEDULED` solo lo asigna el seed. */
export const ADMIN_FLIGHT_STATUSES = ['DELAYED', 'CANCELLED'] as const;
export type AdminFlightStatus = (typeof ADMIN_FLIGHT_STATUSES)[number];

/** Códigos de error del catálogo. El frontend decide por `code`, nunca por el mensaje. */
export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'PAYMENT_DECLINED',
  'FLIGHT_NOT_FOUND',
  'SEAT_NOT_FOUND',
  'BOOKING_NOT_FOUND',
  'NOT_FOUND',
  'FLIGHT_CANCELLED',
  'SEAT_UNAVAILABLE',
  'HOLD_INACTIVE',
  'HOLD_NOT_OWNED',
  'INVALID_FLIGHT_TRANSITION',
  'UNSUPPORTED_MEDIA_TYPE',
  'IDEMPOTENCY_KEY_REUSED',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** Estado HTTP de cada código de error del catálogo. */
export const ERROR_HTTP_STATUS: Readonly<Record<ErrorCode, number>> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  PAYMENT_DECLINED: 402,
  FLIGHT_NOT_FOUND: 404,
  SEAT_NOT_FOUND: 404,
  BOOKING_NOT_FOUND: 404,
  NOT_FOUND: 404,
  FLIGHT_CANCELLED: 409,
  SEAT_UNAVAILABLE: 409,
  HOLD_INACTIVE: 409,
  HOLD_NOT_OWNED: 409,
  INVALID_FLIGHT_TRANSITION: 409,
  UNSUPPORTED_MEDIA_TYPE: 415,
  IDEMPOTENCY_KEY_REUSED: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

export const VALIDATION_REASONS = ['REQUIRED', 'INVALID', 'UNEXPECTED', 'DUPLICATE'] as const;
export type ValidationReason = (typeof VALIDATION_REASONS)[number];

// ---------------------------------------------------------------------------
// Convenciones de transporte
// ---------------------------------------------------------------------------

/** Encabezados HTTP en minúsculas (se comparan sin distinguir mayúsculas). */
export const CLIENT_ID_HEADER = 'x-client-id';
export const HOLD_TOKEN_HEADER = 'x-hold-token';
export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';

/** Ruta del servidor Socket.IO y nombres de sala. */
export const SOCKET_PATH = '/ws';
export const SEARCH_ROOM = 'search';
export type SearchRoom = typeof SEARCH_ROOM;
export type FlightRoom = `flight:${string}`;
export type RoomName = SearchRoom | FlightRoom;

export function flightRoom(flightId: string): FlightRoom {
  return `flight:${flightId}`;
}

// ---------------------------------------------------------------------------
// Validación de entradas (los patrones validan formato; la existencia la decide el servidor)
// ---------------------------------------------------------------------------

/** UUID v4 con guiones. Se acepta cualquier caja y se normaliza a minúsculas. */
export const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** `YYYY-MM-DD`. Que sea una fecha real lo comprueba quien valida. */
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const SEAT_CODE_PATTERN = /^[0-9]{1,2}[A-D]$/;
/** Alfabeto del código de reserva: sin `0`, `O`, `1` ni `I`. */
export const BOOKING_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** Código ya normalizado a mayúsculas. */
export const BOOKING_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;
/** Número de tarjeta: 13 a 19 dígitos ASCII sin separadores (Luhn lo valida el servidor). */
export const CARD_NUMBER_PATTERN = /^[0-9]{13,19}$/;
export const NAME_MIN_LENGTH = 1;
export const NAME_MAX_LENGTH = 60;

/**
 * Tarjetas de prueba del simulador de pago (ambas válidas según Luhn).
 * Terminada en 4242 se aprueba; terminada en 0002 se rechaza con `402`.
 */
export const TEST_CARDS = [
  { label: 'Aprobada', cardNumber: '4242424242424242' },
  { label: 'Rechazada', cardNumber: '4000000000000002' },
] as const;

// ---------------------------------------------------------------------------
// Objetos de intercambio
// ---------------------------------------------------------------------------

/** Instante ISO 8601 en UTC con `Z`, por ejemplo `2026-11-18T14:30:00.000Z`. */
export type IsoUtcString = string;

export interface Flight {
  id: string;
  flightNumber: string;
  origin: AirportCode;
  destination: AirportCode;
  departureAt: IsoUtcString;
  arrivalAt: IsoUtcString;
  /** Tarifa en pesos colombianos (entero). */
  fareCop: number;
  status: FlightStatus;
  /** Independiente de `status`: un vuelo retrasado puede estar agotado. */
  soldOut: boolean;
  version: number;
}

/** Estado público de un asiento. Nunca incluye titular, token ni datos del pasajero. */
export interface SeatEvent {
  flightId: string;
  seatCode: string;
  status: SeatStatus;
  version: number;
}

/** Bloqueo propio: solo lo recibe su titular. */
export interface OwnHold {
  seatCode: string;
  holdToken: string;
  holdExpiresAt: IsoUtcString;
  /** Versión del asiento al obtener el bloqueo. */
  version: number;
}

export interface FlightStatusEvent {
  flightId: string;
  status: FlightStatus;
  soldOut: boolean;
  version: number;
}

export interface Passenger {
  firstName: string;
  lastName: string;
}

export interface TicketFlight {
  id: string;
  flightNumber: string;
  origin: AirportCode;
  destination: AirportCode;
  departureAt: IsoUtcString;
  arrivalAt: IsoUtcString;
}

/** Boleto. Nunca incluye datos de pago. */
export interface Ticket {
  code: string;
  flight: TicketFlight;
  seatCode: string;
  passenger: Passenger;
  amountCop: number;
  createdAt: IsoUtcString;
}

// ---------------------------------------------------------------------------
// HTTP: solicitudes y respuestas
// ---------------------------------------------------------------------------

/** `GET /api/flights?origin&destination&date`. Los tres parámetros son obligatorios. */
export interface SearchFlightsQuery {
  origin: AirportCode;
  destination: AirportCode;
  /** Día UTC, `YYYY-MM-DD`. */
  date: string;
}

export interface SearchFlightsResponse {
  flights: Flight[];
}

/** Respuesta de `POST /api/flights/{flightId}/seats/{seatCode}/hold` (`201` o `200`). */
export interface HoldResponse {
  seat: SeatEvent;
  hold: OwnHold;
  serverNow: IsoUtcString;
}

export interface ConfirmBookingRequest {
  flightId: string;
  seatCode: string;
  holdToken: string;
  passenger: Passenger;
  /** Único campo de pago. Nunca se guarda ni se registra. */
  payment: { cardNumber: string };
}

/** `PATCH /api/admin/flights/{flightId}/status`. Responde con `FlightStatusEvent`. */
export interface ChangeFlightStatusRequest {
  status: AdminFlightStatus;
}

export interface HealthResponse {
  status: 'ok';
}

export interface ValidationErrorField {
  /** Nombre del campo, por ejemplo `query.date` o `body.passenger.lastName`. */
  field: string;
  reason: ValidationReason;
}

export interface ErrorBody {
  code: ErrorCode;
  message: string;
  /** Solo en `VALIDATION_ERROR`. */
  fields?: ValidationErrorField[];
}

/** Forma de todo error HTTP: `{ "error": { "code", "message" } }`. */
export interface ErrorResponse {
  error: ErrorBody;
}

// ---------------------------------------------------------------------------
// Socket.IO
// ---------------------------------------------------------------------------

/** `auth` del handshake. Sin `clientId` la conexión es de solo lectura pública. */
export interface SocketAuth {
  clientId?: string;
}

/** `connect_error.data` cuando `auth.clientId` es inválido. */
export interface SocketConnectErrorData {
  code: 'VALIDATION_ERROR';
}

/** Respuesta de `join('search')`. Después el cliente consulta `GET /api/flights`. */
export interface SearchSnapshot {
  serverNow: IsoUtcString;
}

/** Respuesta de `join('flight:{id}')`. `myHold` es `null` para espectadores. */
export interface FlightSnapshot {
  flight: Flight;
  seats: SeatEvent[];
  myHold: OwnHold | null;
  serverNow: IsoUtcString;
}

export type JoinResult =
  | { ok: true; data: SearchSnapshot | FlightSnapshot }
  | { ok: false; error: { code: ErrorCode; message: string } };

/** Distingue la instantánea de un vuelo de la de búsqueda. */
export function isFlightSnapshot(data: SearchSnapshot | FlightSnapshot): data is FlightSnapshot {
  return 'flight' in data;
}

/** Eventos servidor → cliente. El WebSocket solo difunde: no recibe comandos. */
export interface ServerToClientEvents {
  /** Sala `flight:{flightId}`. */
  'seat.changed': (event: SeatEvent) => void;
  /** Sala `search`. */
  'flight.status_changed': (event: FlightStatusEvent) => void;
}

/** Único mensaje cliente → servidor. Se emite en cada `connect`, incluidas las reconexiones. */
export interface ClientToServerEvents {
  join: (room: RoomName, ack: (result: JoinResult) => void) => void;
}
