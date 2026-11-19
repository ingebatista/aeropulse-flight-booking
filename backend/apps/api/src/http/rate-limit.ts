import { type ExecutionContext, Injectable } from '@nestjs/common';
import { type Throttle, ThrottlerGuard } from '@nestjs/throttler';

/**
 * Límite de tasa (arch §5): `@nestjs/throttler` global y por IP (`trust proxy`
 * toma la IP real detrás de Nginx), más estricto en `hold`, `confirm` y
 * `/api/admin`. El contador es por ruta y por IP, en ventanas de 60 s.
 *
 * Un solo *throttler* llamado `default`: así la cabecera es `Retry-After` sin sufijo.
 */
export const RATE_LIMIT_TTL_MS = 60_000;

/** Valores por defecto aprobados por el humano (solicitudes por minuto). */
export const DEFAULT_RATE_LIMITS = { GLOBAL: 120, HOLD: 30, CONFIRM: 10, ADMIN: 30 } as const;
export type RateLimitName = keyof typeof DEFAULT_RATE_LIMITS;

/** `RATE_LIMIT_<NOMBRE>`: entero positivo; sin valor, el de por defecto. */
export function rateLimit(name: RateLimitName): number {
  const raw = process.env[`RATE_LIMIT_${name}`];
  if (raw === undefined || raw === '') return DEFAULT_RATE_LIMITS[name];
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`RATE_LIMIT_${name} debe ser un entero positivo`);
  }
  return value;
}

/** Valida todos los límites al arrancar, para no descubrir un valor inválido en una petición. */
export function assertRateLimits(): void {
  for (const name of Object.keys(DEFAULT_RATE_LIMITS) as RateLimitName[]) rateLimit(name);
}

type ThrottleOptions = Parameters<typeof Throttle>[0];

const limitFor = (name: RateLimitName): ThrottleOptions => ({
  default: { limit: () => rateLimit(name), ttl: RATE_LIMIT_TTL_MS },
});

export const holdThrottle = limitFor('HOLD');
export const confirmThrottle = limitFor('CONFIRM');
export const adminThrottle = limitFor('ADMIN');

/** Solo HTTP: el *gateway* de Socket.IO no pasa por este límite. */
@Injectable()
export class HttpThrottlerGuard extends ThrottlerGuard {
  protected override shouldSkip(context: ExecutionContext): Promise<boolean> {
    return Promise.resolve(context.getType() !== 'http');
  }
}
