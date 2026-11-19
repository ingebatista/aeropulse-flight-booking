import { CARD_NUMBER_PATTERN, NAME_MAX_LENGTH, NAME_MIN_LENGTH } from '@aeropulse/shared';

export function normalizePassengerName(value: string): string | null {
  if (/[\p{Cc}\p{Zl}\p{Zp}]/u.test(value)) return null;
  const name = value.normalize('NFC').trim();
  return name.length >= NAME_MIN_LENGTH && name.length <= NAME_MAX_LENGTH ? name : null;
}

export function validCardNumber(value: string): boolean {
  if (!CARD_NUMBER_PATTERN.test(value)) return false;
  const sum = [...value].reverse().reduce((total, char, index) => {
    const digit = Number(char) * (index % 2 === 0 ? 1 : 2);
    return total + (digit > 9 ? digit - 9 : digit);
  }, 0);
  return sum % 10 === 0;
}
