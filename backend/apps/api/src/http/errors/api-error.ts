import {
  ERROR_HTTP_STATUS,
  type ErrorCode,
  type ErrorResponse,
  type ValidationErrorField,
} from '@aeropulse/shared';
import { HttpException } from '@nestjs/common';

export const VALIDATION_MESSAGE = 'Revisa los datos enviados.';

/**
 * Error del catálogo del contrato. El estado HTTP sale de `ERROR_HTTP_STATUS`
 * y el cuerpo ya tiene la forma `{ error: { code, message, fields? } }`.
 * El mensaje es público: nunca debe llevar valores recibidos, tokens ni datos de pago.
 */
export class ApiError extends HttpException {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly fields?: ValidationErrorField[],
    status: number = ERROR_HTTP_STATUS[code],
    /** Cabeceras de la respuesta de error, por ejemplo `WWW-Authenticate` en un `401`. */
    readonly headers: Readonly<Record<string, string>> = {},
  ) {
    const body: ErrorResponse = { error: { code, message, ...(fields ? { fields } : {}) } };
    super(body, status);
  }

  static validation(fields: ValidationErrorField[]): ApiError {
    return new ApiError('VALIDATION_ERROR', VALIDATION_MESSAGE, fields);
  }
}
