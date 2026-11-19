import type { AdminFlightStatus, FlightStatus } from '@aeropulse/shared';

/**
 * Transiciones operativas del vuelo (contrato, administración): de `SCHEDULED`
 * a `DELAYED` o `CANCELLED`, y de `DELAYED` a `CANCELLED`. `CANCELLED` es
 * terminal. `soldOut` es independiente y no cambia aquí.
 */
const ALLOWED_FROM: Readonly<Record<AdminFlightStatus, readonly FlightStatus[]>> = {
  DELAYED: ['SCHEDULED'],
  CANCELLED: ['SCHEDULED', 'DELAYED'],
};

/** Estados de origen desde los que se puede llegar a `to`. Es el filtro del `UPDATE` condicional. */
export function allowedOrigins(to: AdminFlightStatus): readonly FlightStatus[] {
  return ALLOWED_FROM[to];
}

export function canChangeFlightStatus(from: FlightStatus, to: AdminFlightStatus): boolean {
  return ALLOWED_FROM[to].includes(from);
}

export type StatusChangeDecision =
  /** Mismo estado: se responde la versión actual, sin evento. */
  'UNCHANGED' | 'ALLOWED' | 'INVALID_TRANSITION';

export function decideStatusChange(
  current: FlightStatus,
  requested: AdminFlightStatus,
): StatusChangeDecision {
  if (current === requested) return 'UNCHANGED';
  return canChangeFlightStatus(current, requested) ? 'ALLOWED' : 'INVALID_TRANSITION';
}
