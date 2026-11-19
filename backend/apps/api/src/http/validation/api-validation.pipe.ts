import type { ValidationErrorField, ValidationReason } from '@aeropulse/shared';
import {
  type ArgumentMetadata,
  Injectable,
  ValidationPipe,
  type ValidationPipeOptions,
} from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import { ApiError } from '../errors/api-error';

/** Errores de class-validator en bruto; solo viajan entre `exceptionFactory` y `transform`. */
class RawValidationErrors extends Error {
  constructor(readonly errors: ValidationError[]) {
    super('validation failed');
  }
}

const PIPE_OPTIONS: ValidationPipeOptions = {
  whitelist: true,
  forbidNonWhitelisted: true,
  forbidUnknownValues: true,
  transform: true,
  // Sin conversión implícita: un número en un campo de texto es un error, no se coacciona.
  transformOptions: { enableImplicitConversion: false },
  exceptionFactory: (errors) => new RawValidationErrors(errors),
};

/**
 * `ValidationPipe` estricta que responde con el contrato del proyecto:
 * `400 VALIDATION_ERROR` y `fields: [{ field, reason }]`. El nombre del campo
 * lleva su origen (`query.date`, `body.passenger.lastName`) y la respuesta
 * nunca repite el valor recibido.
 */
@Injectable()
export class ApiValidationPipe extends ValidationPipe {
  constructor() {
    super(PIPE_OPTIONS);
  }

  override async transform(value: unknown, metadata: ArgumentMetadata): Promise<unknown> {
    try {
      return await super.transform(value, metadata);
    } catch (error) {
      if (error instanceof RawValidationErrors) {
        throw ApiError.validation(toFields(error.errors, [metadata.type]));
      }
      throw error;
    }
  }
}

/** Aplana los errores anidados, con un solo motivo por campo (el primero que se informa). */
export function toFields(errors: ValidationError[], path: string[]): ValidationErrorField[] {
  const fields = new Map<string, ValidationReason>();

  const visit = (error: ValidationError, parent: string[]): void => {
    const current = [...parent, error.property];
    if (error.constraints) {
      const name = current.join('.');
      if (!fields.has(name)) fields.set(name, reasonOf(error));
    }
    for (const child of error.children ?? []) visit(child, current);
  };
  for (const error of errors) visit(error, path);

  return [...fields].map(([field, reason]) => ({ field, reason }));
}

function reasonOf(error: ValidationError): ValidationReason {
  const constraints = Object.keys(error.constraints ?? {});
  if (constraints.includes('whitelistValidation')) return 'UNEXPECTED';
  if (error.value === undefined || error.value === null) return 'REQUIRED';
  // Un parámetro de consulta repetido llega como arreglo.
  if (Array.isArray(error.value)) return 'DUPLICATE';
  return 'INVALID';
}
