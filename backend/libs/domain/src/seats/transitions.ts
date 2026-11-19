import { isHoldActive, isHoldExpired, type SeatState } from './seat-state';

/**
 * Transiciones del asiento (arch §4.1). Reflejan el `WHERE` de cada sentencia
 * SQL y sirven para documentarlas y probarlas; **no reemplazan al SQL**, que es
 * quien decide de forma atómica (arch §4.2).
 */

export interface HoldParams {
  clientId: string;
  holdToken: string;
  holdExpiresAt: Date;
}

/** Se puede bloquear un asiento disponible o uno cuyo bloqueo ya venció. */
export function canHold(seat: SeatState, now: Date): boolean {
  return seat.status === 'AVAILABLE' || isHoldExpired(seat, now);
}

/** Solo libera el titular, con su token, mientras el bloqueo sigue vigente. */
export function canRelease(
  seat: SeatState,
  clientId: string,
  holdToken: string,
  now: Date,
): boolean {
  return isHoldActive(seat, now) && seat.heldBy === clientId && seat.holdToken === holdToken;
}

/** El barrido solo toca bloqueos vencidos. */
export function canExpire(seat: SeatState, now: Date): boolean {
  return isHoldExpired(seat, now);
}

export function applyHold(seat: SeatState, now: Date, params: HoldParams): SeatState {
  if (!canHold(seat, now)) throw new IllegalSeatTransition('hold', seat.status);
  return {
    status: 'HELD',
    heldBy: params.clientId,
    holdToken: params.holdToken,
    holdExpiresAt: params.holdExpiresAt,
    version: seat.version + 1,
  };
}

export function applyRelease(
  seat: SeatState,
  clientId: string,
  holdToken: string,
  now: Date,
): SeatState {
  if (!canRelease(seat, clientId, holdToken, now)) {
    throw new IllegalSeatTransition('release', seat.status);
  }
  return available(seat);
}

export function applyExpire(seat: SeatState, now: Date): SeatState {
  if (!canExpire(seat, now)) throw new IllegalSeatTransition('expire', seat.status);
  return available(seat);
}

/** `AVAILABLE` con los tres campos del bloqueo en `NULL` y una versión nueva. */
function available(seat: SeatState): SeatState {
  return {
    status: 'AVAILABLE',
    heldBy: null,
    holdToken: null,
    holdExpiresAt: null,
    version: seat.version + 1,
  };
}

export class IllegalSeatTransition extends Error {
  constructor(
    readonly action: 'hold' | 'release' | 'expire',
    readonly from: SeatState['status'],
  ) {
    super(`Transición ilegal del asiento: ${action} desde ${from}`);
    this.name = 'IllegalSeatTransition';
  }
}
