import { AIRPORT_CODES, type AirportCode, type SearchFlightsQuery } from '@aeropulse/shared';
import { IsIn } from 'class-validator';
import { IsDifferentFrom, IsRealDate } from './validation/validators';

/** `GET /api/flights?origin&destination&date`. Los tres parámetros son obligatorios. */
export class SearchFlightsQueryDto implements SearchFlightsQuery {
  @IsIn(AIRPORT_CODES)
  origin!: AirportCode;

  @IsDifferentFrom('origin')
  @IsIn(AIRPORT_CODES)
  destination!: AirportCode;

  /** Día UTC, `YYYY-MM-DD`, y fecha real. */
  @IsRealDate()
  date!: string;
}
