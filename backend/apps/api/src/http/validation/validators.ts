import { DATE_PATTERN } from '@aeropulse/shared';
import { isValidLuhn, isValidName } from '@backend/domain';
import { registerDecorator, type ValidationOptions } from 'class-validator';

/** Fecha real `YYYY-MM-DD` (rechaza `2026-02-30`). El formato lo fija `DATE_PATTERN`. */
export function isRealDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export function IsRealDate(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyName) =>
    registerDecorator({
      name: 'isRealDate',
      target: target.constructor,
      propertyName: propertyName as string,
      options,
      validator: { validate: isRealDate },
    });
}

/** El valor debe ser distinto del de otra propiedad (por ejemplo, destino distinto de origen). */
export function IsDifferentFrom(other: string, options?: ValidationOptions): PropertyDecorator {
  return (target, propertyName) =>
    registerDecorator({
      name: 'isDifferentFrom',
      target: target.constructor,
      propertyName: propertyName as string,
      constraints: [other],
      options,
      validator: {
        validate: (value: unknown, args) =>
          value !== (args?.object as Record<string, unknown>)[other],
      },
    });
}

/** Nombre del pasajero: 1 a 60 caracteres tras NFC y `trim`, sin caracteres de control. */
export function IsPassengerName(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyName) =>
    registerDecorator({
      name: 'isPassengerName',
      target: target.constructor,
      propertyName: propertyName as string,
      options,
      validator: { validate: isValidName },
    });
}

/** Número de tarjeta válido según Luhn (el formato lo fija `CARD_NUMBER_PATTERN`). */
export function IsLuhn(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyName) =>
    registerDecorator({
      name: 'isLuhn',
      target: target.constructor,
      propertyName: propertyName as string,
      options,
      validator: { validate: (value: unknown) => typeof value === 'string' && isValidLuhn(value) },
    });
}
