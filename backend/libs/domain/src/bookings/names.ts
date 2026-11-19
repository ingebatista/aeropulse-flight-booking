import { NAME_MAX_LENGTH, NAME_MIN_LENGTH } from '@aeropulse/shared';

/** NFC y sin espacios en los extremos (contrato, validación de nombres). */
export function normalizeName(value: string): string {
  return value.normalize('NFC').trim();
}

/** Caracteres de control Unicode (incluye saltos de línea y tabuladores). */
const CONTROL = /\p{Cc}/u;

/**
 * 1 a 60 caracteres después de normalizar, sin caracteres de control. Admite
 * nombres compuestos, tildes y apóstrofos.
 */
export function isValidName(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const name = normalizeName(value);
  const length = [...name].length;
  return length >= NAME_MIN_LENGTH && length <= NAME_MAX_LENGTH && !CONTROL.test(name);
}

/** Igualdad del apellido sin distinguir mayúsculas, conservando los acentos (`Gómez` ≠ `Gomez`). */
export function sameLastName(stored: string, given: string): boolean {
  return normalizeName(stored).toLowerCase() === normalizeName(given).toLowerCase();
}
