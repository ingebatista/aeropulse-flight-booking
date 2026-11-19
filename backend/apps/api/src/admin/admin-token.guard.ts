import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';
import { ApiError } from '../http/errors/api-error';
import { readAdminToken } from './admin.config';

interface RequestWithHeaders {
  headers: Record<string, string | string[] | undefined>;
}

const BEARER = /^Bearer\s+(\S+)\s*$/i;

/**
 * `Authorization: Bearer <ADMIN_TOKEN>` (arch §5). Se compara con
 * `timingSafeEqual` sobre el SHA-256 de ambos valores, que siempre miden lo
 * mismo, así la comparación no filtra la longitud ni el prefijo del token.
 * Se instancia al arrancar: con un token inválido en producción, la API no inicia.
 */
@Injectable()
export class AdminTokenGuard implements CanActivate {
  private readonly expected: Buffer;

  constructor(config: ConfigService) {
    this.expected = digest(readAdminToken((name) => config.get<string>(name)));
  }

  canActivate(context: ExecutionContext): boolean {
    const { headers } = context.switchToHttp().getRequest<RequestWithHeaders>();
    const header = headers.authorization;
    const token = typeof header === 'string' ? BEARER.exec(header)?.[1] : undefined;
    if (!token || !timingSafeEqual(digest(token), this.expected)) {
      throw new ApiError(
        'UNAUTHORIZED',
        'Se requiere un token de administración válido.',
        undefined,
        undefined,
        { 'WWW-Authenticate': 'Bearer' },
      );
    }
    return true;
  }
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}
