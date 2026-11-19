import { SEAT_CODE_PATTERN, UUID_V4_PATTERN } from '@aeropulse/shared';
import { Transform } from 'class-transformer';
import { Matches } from 'class-validator';

/** Parámetros de ruta `/flights/{flightId}/seats/{seatCode}/hold`. */
export class SeatParamsDto {
  /** UUID v4 en cualquier caja; se normaliza a minúsculas. */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @Matches(UUID_V4_PATTERN)
  flightId!: string;

  /** Formato del contrato; la existencia del asiento se comprueba dentro del vuelo. */
  @Matches(SEAT_CODE_PATTERN)
  seatCode!: string;
}
