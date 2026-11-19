import {
  CLIENT_ID_HEADER,
  HOLD_TOKEN_HEADER,
  IDEMPOTENCY_KEY_HEADER,
  UUID_V4_PATTERN,
  type ValidationReason,
} from '@aeropulse/shared';
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { ApiError } from '../errors/api-error';

interface RequestWithHeaders {
  /** Node ≥ 18.3: cada encabezado como arreglo, para detectar repeticiones. */
  headersDistinct: Record<string, string[] | undefined>;
}

/**
 * Lee un encabezado UUID v4 obligatorio del contrato y lo normaliza a minúsculas.
 * El error se informa como `header.<nombre>` y nunca repite el valor recibido.
 */
export function readUuidHeader(request: RequestWithHeaders, name: string): string {
  const values = request.headersDistinct[name];
  const fail = (reason: ValidationReason) =>
    ApiError.validation([{ field: `header.${name}`, reason }]);

  if (!values || values.length === 0 || values[0] === '') throw fail('REQUIRED');
  if (values.length > 1) throw fail('DUPLICATE');
  if (!UUID_V4_PATTERN.test(values[0])) throw fail('INVALID');
  return values[0].toLowerCase();
}

const uuidHeader = (name: string) =>
  createParamDecorator((_data: unknown, ctx: ExecutionContext): string =>
    readUuidHeader(ctx.switchToHttp().getRequest<RequestWithHeaders>(), name),
  )();

/** `X-Client-Id`: identifica a la pestaña. Es un secreto de portador: nunca se registra. */
export const ClientId = (): ParameterDecorator => uuidHeader(CLIENT_ID_HEADER);

/** `X-Hold-Token`: token del bloqueo, solo lo conoce su titular. */
export const HoldToken = (): ParameterDecorator => uuidHeader(HOLD_TOKEN_HEADER);

/** `Idempotency-Key`: UUID v4, uno por intento de compra. */
export const IdempotencyKey = (): ParameterDecorator => uuidHeader(IDEMPOTENCY_KEY_HEADER);
