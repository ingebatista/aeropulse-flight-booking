import type { ErrorResponse } from '@aeropulse/shared';
import {
  type ArgumentsHost,
  BadRequestException,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { HttpAdapterHost } from '@nestjs/core';
import { ThrottlerException } from '@nestjs/throttler';
import { ApiError } from './api-error';

/**
 * Convierte toda excepción HTTP en `{ error: { code, message, fields? } }`.
 * Lo que no es un error del catálogo se responde con un mensaje genérico; el
 * detalle solo va al log, nunca a la respuesta.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') return;

    const error = this.toApiError(exception);
    const body = error.getResponse() as ErrorResponse;
    const { httpAdapter } = this.adapterHost;
    const response = host.switchToHttp().getResponse();
    for (const [name, value] of Object.entries(error.headers)) {
      httpAdapter.setHeader(response, name, value);
    }
    httpAdapter.reply(response, body, error.getStatus());
  }

  private toApiError(exception: unknown): ApiError {
    if (exception instanceof ApiError) return exception;

    // Límite de tasa. ThrottlerGuard ya puso `Retry-After` en la respuesta.
    if (exception instanceof ThrottlerException) {
      return new ApiError(
        'RATE_LIMITED',
        'Demasiadas solicitudes. Espera unos segundos antes de reintentar.',
      );
    }

    // Nest convierte el SyntaxError de body-parser (JSON mal formado) y el
    // URIError de un parámetro con codificación inválida en BadRequestException.
    if (exception instanceof BadRequestException) {
      const field = /decode param/i.test(exception.message) ? 'param' : 'body';
      return ApiError.validation([{ field, reason: 'INVALID' }]);
    }

    // Ruta inexistente. Provisional hasta resolver CCR-1 (no hay código NOT_FOUND en el contrato).
    if (exception instanceof NotFoundException) {
      return new ApiError('INTERNAL_ERROR', 'El recurso solicitado no existe.', undefined, 404);
    }

    // Otros errores 4xx de body-parser (cuerpo demasiado grande, codificación no admitida).
    const external = exception as { status?: number; type?: string; expose?: boolean };
    if (
      !(exception instanceof HttpException) &&
      external?.expose &&
      Number(external.status) < 500
    ) {
      if (external.type === 'charset.unsupported' || external.type === 'encoding.unsupported') {
        return new ApiError('UNSUPPORTED_MEDIA_TYPE', 'El formato del cuerpo no es compatible.');
      }
      return ApiError.validation([{ field: 'body', reason: 'INVALID' }]);
    }

    this.logger.error(
      'Error no controlado',
      exception instanceof Error ? exception.stack : String(exception),
    );
    return new ApiError('INTERNAL_ERROR', 'Ocurrió un error inesperado.');
  }
}
