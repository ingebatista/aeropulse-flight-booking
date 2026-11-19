import type { Ticket } from '@aeropulse/shared';
import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { BookingService } from '../inventory/booking.service';
import { BookingCodeParamsDto, ConfirmBookingDto, TicketQueryDto } from './confirm-booking.dto';
import { confirmThrottle } from './rate-limit';
import { ClientId, IdempotencyKey } from './validation/headers';
import { RejectBodyGuard } from './validation/reject-body.guard';
import { RequireJsonGuard } from './validation/require-json.guard';

/** Confirmación con pago simulado y consulta del boleto (HU3). */
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingService) {}

  /** `201` con el boleto al crearlo; `200` con el mismo boleto al repetir la misma compra. */
  @Post('confirm')
  @Throttle(confirmThrottle)
  @UseGuards(RequireJsonGuard)
  async confirm(
    @Body() body: ConfirmBookingDto,
    @ClientId() clientId: string,
    @IdempotencyKey() idempotencyKey: string,
    @Res({ passthrough: true }) response: { status(code: number): unknown },
  ): Promise<Ticket> {
    const outcome = await this.bookings.confirm({
      clientId,
      idempotencyKey,
      flightId: body.flightId,
      seatCode: body.seatCode,
      holdToken: body.holdToken,
      firstName: body.passenger.firstName,
      lastName: body.passenger.lastName,
      cardNumber: body.payment.cardNumber,
    });
    response.status(outcome.created ? HttpStatus.CREATED : HttpStatus.OK);
    return outcome.ticket;
  }

  @Get(':code')
  @UseGuards(RejectBodyGuard)
  ticket(@Param() params: BookingCodeParamsDto, @Query() query: TicketQueryDto): Promise<Ticket> {
    return this.bookings.findTicket(params.code, query.lastName);
  }
}
