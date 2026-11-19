export type CardBrand = 'VISA' | 'MASTERCARD' | 'AMEX' | 'OTHER';

/** Marca por prefijo (IIN). Solo se guarda la marca y los últimos cuatro dígitos, nunca el número. */
export function cardBrand(cardNumber: string): CardBrand {
  if (/^4/.test(cardNumber)) return 'VISA';
  if (/^3[47]/.test(cardNumber)) return 'AMEX';
  if (/^5[1-5]/.test(cardNumber)) return 'MASTERCARD';
  const prefix = Number(cardNumber.slice(0, 4));
  if (prefix >= 2221 && prefix <= 2720) return 'MASTERCARD';
  return 'OTHER';
}

export function cardLast4(cardNumber: string): string {
  return cardNumber.slice(-4);
}
