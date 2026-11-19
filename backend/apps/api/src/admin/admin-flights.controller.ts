import {
  ADMIN_FLIGHT_STATUSES,
  type AdminFlightStatus,
  type ChangeFlightStatusRequest,
  type FlightStatusEvent,
  UUID_V4_PATTERN,
} from '@aeropulse/shared';
import { Body, Controller, Param, Patch, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Transform } from 'class-transformer';
import { IsIn, Matches } from 'class-validator';
import { FlightsService } from '../flights/flights.service';
import { adminThrottle } from '../http/rate-limit';
import { RequireJsonGuard } from '../http/validation/require-json.guard';
import { AdminTokenGuard } from './admin-token.guard';

export class FlightIdParamsDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @Matches(UUID_V4_PATTERN)
  flightId!: string;
}

/** Solo `DELAYED` o `CANCELLED`: `SCHEDULED` lo asigna únicamente el seed. */
export class ChangeFlightStatusDto implements ChangeFlightStatusRequest {
  @IsIn(ADMIN_FLIGHT_STATUSES)
  status!: AdminFlightStatus;
}

/** Administración de vuelos (HU1). El token se valida antes que cualquier otra cosa. */
@Controller('admin/flights')
@UseGuards(AdminTokenGuard)
@Throttle(adminThrottle)
export class AdminFlightsController {
  constructor(private readonly flights: FlightsService) {}

  /** `200` con `FlightStatusEvent`. Repetir el mismo estado devuelve la versión actual sin evento. */
  @Patch(':flightId/status')
  @UseGuards(RequireJsonGuard)
  changeStatus(
    @Param() params: FlightIdParamsDto,
    @Body() body: ChangeFlightStatusDto,
  ): Promise<FlightStatusEvent> {
    return this.flights.changeStatus(params.flightId, body.status);
  }
}
