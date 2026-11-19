import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { ApiError } from '../errors/api-error';

interface RequestWithHeaders {
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Las rutas que esperan un cuerpo requieren `Content-Type: application/json`.
 * Un cuerpo en otro formato responde `415 UNSUPPORTED_MEDIA_TYPE`. Sin cuerpo,
 * decide la validación (`body` / `REQUIRED`).
 */
@Injectable()
export class RequireJsonGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { headers } = context.switchToHttp().getRequest<RequestWithHeaders>();
    const hasBody =
      Number(headers['content-length'] ?? 0) > 0 || headers['transfer-encoding'] !== undefined;
    const type = String(headers['content-type'] ?? '')
      .split(';')[0]
      .trim()
      .toLowerCase();
    if (hasBody && type !== 'application/json') {
      throw new ApiError(
        'UNSUPPORTED_MEDIA_TYPE',
        'El cuerpo debe enviarse como application/json.',
      );
    }
    return true;
  }
}
