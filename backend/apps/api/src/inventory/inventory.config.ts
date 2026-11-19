import type { ConfigService } from '@nestjs/config';

/** Duración del bloqueo por defecto (arch §4.5); 30 s para demostraciones. */
export const DEFAULT_HOLD_TTL_SECONDS = 300;
/** Periodo del barrido de bloqueos vencidos (arch §4.5). */
export const DEFAULT_SWEEP_INTERVAL_MS = 1_000;

/** `HOLD_TTL_SECONDS`: entero positivo. Un valor inválido detiene el arranque. */
export function readHoldTtlSeconds(config: ConfigService): number {
  return readPositiveInteger(config, 'HOLD_TTL_SECONDS', DEFAULT_HOLD_TTL_SECONDS, false);
}

/**
 * `SWEEP_INTERVAL_MS`: periodo del barrido. `0` lo desactiva; solo lo usan las
 * pruebas que necesitan controlar cuándo se libera un bloqueo vencido.
 */
export function readSweepIntervalMs(config: ConfigService): number {
  return readPositiveInteger(config, 'SWEEP_INTERVAL_MS', DEFAULT_SWEEP_INTERVAL_MS, true);
}

function readPositiveInteger(
  config: ConfigService,
  name: string,
  fallback: number,
  allowZero: boolean,
): number {
  const raw = config.get<string>(name);
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || (value === 0 && !allowZero)) {
    throw new Error(`${name} debe ser un entero ${allowZero ? 'no negativo' : 'positivo'}`);
  }
  return value;
}
