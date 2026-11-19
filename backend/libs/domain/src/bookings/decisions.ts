import type { SeatLookup } from '../seats/decisions';
import { isHoldActive } from '../seats/seat-state';

export type ConfirmFallback =
  | 'FLIGHT_NOT_FOUND'
  | 'SEAT_NOT_FOUND'
  | 'FLIGHT_CANCELLED'
  /** Bloqueo vencido, retirado, ajeno o sustituido. */
  | 'HOLD_INACTIVE'
  /** Hay un bloqueo vigente que coincide: se puede intentar confirmar. */
  | 'ELIGIBLE';

/**
 * Orden del contrato para un intento nuevo: existencia del vuelo y del asiento,
 * después el estado del vuelo y después la vigencia y titularidad del bloqueo.
 * Sirve para precomprobar antes de cobrar y para elegir la respuesta cuando el
 * `UPDATE` de la confirmación no afectó filas; nunca decide el cambio de estado.
 */
export function decideConfirmFallback(
  lookup: SeatLookup,
  clientId: string,
  holdToken: string,
  now: Date,
): ConfirmFallback {
  if (lookup.flightStatus === null) return 'FLIGHT_NOT_FOUND';
  if (lookup.seat === null) return 'SEAT_NOT_FOUND';
  if (lookup.flightStatus === 'CANCELLED') return 'FLIGHT_CANCELLED';
  const { seat } = lookup;
  if (isHoldActive(seat, now) && seat.heldBy === clientId && seat.holdToken === holdToken) {
    return 'ELIGIBLE';
  }
  return 'HOLD_INACTIVE';
}
