import { HttpErrorResponse } from '@angular/common/http';
import { ERROR_CODES, type ErrorCode } from '@aeropulse/shared';

export type FrontendErrorCode = ErrorCode | 'NETWORK_ERROR' | 'JOIN_TIMEOUT';

const messages: Record<FrontendErrorCode, string> = {
  VALIDATION_ERROR: 'Revisa los datos enviados.',
  UNAUTHORIZED: 'El acceso de administración no está autorizado.',
  PAYMENT_DECLINED: 'El pago fue rechazado.',
  FLIGHT_NOT_FOUND: 'No se encontró el vuelo.',
  SEAT_NOT_FOUND: 'No se encontró el asiento.',
  BOOKING_NOT_FOUND: 'No se encontró la reserva.',
  NOT_FOUND: 'No se encontró el recurso solicitado.',
  FLIGHT_CANCELLED: 'El vuelo fue cancelado.',
  SEAT_UNAVAILABLE: 'El asiento ya no está disponible.',
  HOLD_INACTIVE: 'El bloqueo del asiento ya no está vigente.',
  HOLD_NOT_OWNED: 'El bloqueo pertenece a otro cliente o cambió.',
  INVALID_FLIGHT_TRANSITION: 'El vuelo no admite ese cambio de estado.',
  UNSUPPORTED_MEDIA_TYPE: 'El formato de la solicitud no es válido.',
  IDEMPOTENCY_KEY_REUSED: 'La clave de compra ya se utilizó con otros datos.',
  RATE_LIMITED: 'Espera un momento antes de volver a intentarlo.',
  INTERNAL_ERROR: 'Ocurrió un error. Intenta de nuevo.',
  NETWORK_ERROR: 'No hay conexión con el servidor.',
  JOIN_TIMEOUT: 'El servidor tardó demasiado en sincronizar.',
};

export class ApiError extends Error {
  constructor(
    readonly code: FrontendErrorCode,
    readonly status?: number,
    readonly retryAfterSeconds?: number,
  ) {
    super(messages[code]);
  }

  static fromHttp(error: unknown): ApiError {
    if (!(error instanceof HttpErrorResponse)) {
      return new ApiError('INTERNAL_ERROR');
    }
    const body: unknown = error.error;
    const detail = body && typeof body === 'object' && 'error' in body ? body.error : null;
    const code = detail && typeof detail === 'object' && 'code' in detail ? detail.code : null;
    const knownCode = ERROR_CODES.find((candidate) => candidate === code);
    const retryAfter = knownCode === 'RATE_LIMITED' ? error.headers.get('Retry-After') : null;
    const seconds = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) : undefined;
    return new ApiError(
      knownCode ?? (error.status === 0 ? 'NETWORK_ERROR' : 'INTERNAL_ERROR'),
      error.status,
      Number.isSafeInteger(seconds) ? seconds : undefined,
    );
  }
}
