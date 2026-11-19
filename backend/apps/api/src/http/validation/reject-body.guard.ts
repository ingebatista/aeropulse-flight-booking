import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { ApiError } from '../errors/api-error';

interface RequestWithHeaders {
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Las rutas sin cuerpo «se invocan sin enviar uno» (contrato, convenciones). Un
 * cuerpo presente responde `400 VALIDATION_ERROR` con `body` / `UNEXPECTED`.
 */
@Injectable()
export class RejectBodyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { headers } = context.switchToHttp().getRequest<RequestWithHeaders>();
    const length = Number(headers['content-length'] ?? 0);
    if (length > 0 || headers['transfer-encoding'] !== undefined) {
      throw ApiError.validation([{ field: 'body', reason: 'UNEXPECTED' }]);
    }
    return true;
  }
}
