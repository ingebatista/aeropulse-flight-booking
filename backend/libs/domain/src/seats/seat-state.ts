import type { SeatStatus } from '@aeropulse/shared';

/** Estado de un asiento tal como lo guarda la base de datos. */
export interface SeatState {
  status: SeatStatus;
  /** `clientId` del titular. Nunca se difunde. */
  heldBy: string | null;
  holdToken: string | null;
  holdExpiresAt: Date | null;
  version: number;
}

/**
 * Bloqueo vigente: `HELD` y `holdExpiresAt > now`. Es la misma frontera que usa
 * el SQL con `now()` de PostgreSQL: en `holdExpiresAt == now` ya está vencido.
 */
export function isHoldActive(seat: SeatState, now: Date): boolean {
  return (
    seat.status === 'HELD' &&
    seat.holdExpiresAt !== null &&
    seat.holdExpiresAt.getTime() > now.getTime()
  );
}

/** Sigue en `HELD`, pero su vencimiento ya pasó (lo libera el barrido o una nueva adquisición). */
export function isHoldExpired(seat: SeatState, now: Date): boolean {
  return (
    seat.status === 'HELD' &&
    seat.holdExpiresAt !== null &&
    seat.holdExpiresAt.getTime() <= now.getTime()
  );
}
