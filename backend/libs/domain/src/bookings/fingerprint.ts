import { createHash } from 'node:crypto';
import { normalizeName } from './names';

export interface ConfirmFingerprint {
  flightId: string;
  seatCode: string;
  clientId: string;
  holdToken: string;
  firstName: string;
  lastName: string;
  /** Últimos cuatro dígitos: dos números válidos con la misma terminación son equivalentes. */
  cardLast4: string;
}

/**
 * Huella de un intento de compra (arch §4.4): SHA-256 en hexadecimal del
 * arreglo JSON en UTF-8 con estos valores, en orden. UUID en minúsculas y
 * nombres normalizados a NFC y recortados.
 */
export function requestHash(input: ConfirmFingerprint): string {
  const values = [
    input.flightId.toLowerCase(),
    input.seatCode,
    input.clientId.toLowerCase(),
    input.holdToken.toLowerCase(),
    normalizeName(input.firstName),
    normalizeName(input.lastName),
    input.cardLast4,
  ];
  return createHash('sha256').update(JSON.stringify(values), 'utf8').digest('hex');
}
