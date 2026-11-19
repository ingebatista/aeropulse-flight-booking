import { BOOKING_CODE_ALPHABET } from '@aeropulse/shared';
import { randomBytes as cryptoRandomBytes } from 'node:crypto';

export const BOOKING_CODE_LENGTH = 6;

/**
 * Código de reserva tipo PNR: 6 caracteres sin ambiguos (sin `0/O/1/I`). El
 * alfabeto tiene 32 símbolos, así que `byte % 32` no introduce sesgo. La
 * unicidad la garantiza `UNIQUE (code)` con reintento ante colisión.
 */
export function generateBookingCode(
  randomBytes: (size: number) => Uint8Array = cryptoRandomBytes,
): string {
  const bytes = randomBytes(BOOKING_CODE_LENGTH);
  let code = '';
  for (let i = 0; i < BOOKING_CODE_LENGTH; i++) {
    code += BOOKING_CODE_ALPHABET[bytes[i] % BOOKING_CODE_ALPHABET.length];
  }
  return code;
}

/** Se admite minúscula y se consulta en mayúscula (contrato). */
export function normalizeBookingCode(code: string): string {
  return code.toUpperCase();
}
