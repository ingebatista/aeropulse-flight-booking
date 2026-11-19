import type { FlightStatus } from '@aeropulse/shared';
import { isHoldActive, type SeatState } from './seat-state';

/**
 * Lo que se lee **después** de que la escritura condicional no afectó filas. La
 * decisión sobre el asiento ya la tomó el `UPDATE`; esta lectura solo elige la
 * respuesta (arch §4.3).
 */
export interface SeatLookup {
  /** Estado del vuelo, o `null` si no existe. */
  flightStatus: FlightStatus | null;
  /** Estado del asiento dentro del vuelo, o `null` si no existe. */
  seat: SeatState | null;
}

export type HoldFallback =
  | 'FLIGHT_NOT_FOUND'
  | 'SEAT_NOT_FOUND'
  | 'FLIGHT_CANCELLED'
  /** El mismo cliente ya tiene el bloqueo vigente: se responde `200` con él. */
  | 'OWN_ACTIVE_HOLD'
  | 'SEAT_UNAVAILABLE';

export function decideHoldFallback(lookup: SeatLookup, clientId: string, now: Date): HoldFallback {
  if (lookup.flightStatus === null) return 'FLIGHT_NOT_FOUND';
  if (lookup.seat === null) return 'SEAT_NOT_FOUND';
  if (lookup.flightStatus === 'CANCELLED') return 'FLIGHT_CANCELLED';
  if (isHoldActive(lookup.seat, now) && lookup.seat.heldBy === clientId) return 'OWN_ACTIVE_HOLD';
  return 'SEAT_UNAVAILABLE';
}

export type ReleaseFallback =
  | 'FLIGHT_NOT_FOUND'
  | 'SEAT_NOT_FOUND'
  /** Hay un bloqueo vigente de otro cliente o con otro token. */
  | 'HOLD_NOT_OWNED'
  /** Ya no hay un bloqueo vigente: la liberación es idempotente (`204`, sin evento). */
  | 'NOTHING_TO_RELEASE';

export function decideReleaseFallback(
  lookup: SeatLookup,
  clientId: string,
  holdToken: string,
  now: Date,
): ReleaseFallback {
  if (lookup.flightStatus === null) return 'FLIGHT_NOT_FOUND';
  if (lookup.seat === null) return 'SEAT_NOT_FOUND';
  const { seat } = lookup;
  if (isHoldActive(seat, now) && (seat.heldBy !== clientId || seat.holdToken !== holdToken)) {
    return 'HOLD_NOT_OWNED';
  }
  return 'NOTHING_TO_RELEASE';
}
