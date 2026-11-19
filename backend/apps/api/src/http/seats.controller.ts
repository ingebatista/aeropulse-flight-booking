import type { HoldResponse } from '@aeropulse/shared';
import {
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { HoldService } from '../inventory/hold.service';
import { holdThrottle } from './rate-limit';
import { SeatParamsDto } from './seat-params.dto';
import { ClientId, HoldToken } from './validation/headers';
import { RejectBodyGuard } from './validation/reject-body.guard';

/** Bloqueo y liberación de un asiento (HU2). Ninguna de las dos rutas lleva cuerpo. */
@Controller('flights/:flightId/seats/:seatCode/hold')
@UseGuards(RejectBodyGuard)
export class SeatsController {
  constructor(private readonly holds: HoldService) {}

  /** `201` al adquirirlo; `200` si ya pertenece al mismo cliente y sigue vigente. */
  @Post()
  @Throttle(holdThrottle)
  async hold(
    @Param() params: SeatParamsDto,
    @ClientId() clientId: string,
    @Res({ passthrough: true }) response: { status(code: number): unknown },
  ): Promise<HoldResponse> {
    const outcome = await this.holds.hold(params.flightId, params.seatCode, clientId);
    response.status(outcome.created ? HttpStatus.CREATED : HttpStatus.OK);
    return outcome.response;
  }

  /** `204` al liberar o si ya no había un bloqueo vigente. */
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async release(
    @Param() params: SeatParamsDto,
    @ClientId() clientId: string,
    @HoldToken() holdToken: string,
  ): Promise<void> {
    await this.holds.release(params.flightId, params.seatCode, clientId, holdToken);
  }
}
