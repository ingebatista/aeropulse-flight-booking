import {
  BOOKING_CODE_PATTERN,
  CARD_NUMBER_PATTERN,
  type ConfirmBookingRequest,
  SEAT_CODE_PATTERN,
  UUID_V4_PATTERN,
} from '@aeropulse/shared';
import { Transform, Type } from 'class-transformer';
import { IsDefined, IsObject, Matches, ValidateNested } from 'class-validator';
import { IsLuhn, IsPassengerName } from './validation/validators';

const lowerCase = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.toLowerCase() : value;
const upperCase = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.toUpperCase() : value;

export class PassengerDto {
  @IsPassengerName()
  firstName!: string;

  @IsPassengerName()
  lastName!: string;
}

/** Único campo de pago. Nunca se guarda ni se registra. */
export class PaymentDto {
  @IsLuhn()
  @Matches(CARD_NUMBER_PATTERN)
  cardNumber!: string;
}

/** Cuerpo de `POST /api/bookings/confirm`. */
export class ConfirmBookingDto implements ConfirmBookingRequest {
  @Transform(lowerCase)
  @Matches(UUID_V4_PATTERN)
  flightId!: string;

  @Matches(SEAT_CODE_PATTERN)
  seatCode!: string;

  @Transform(lowerCase)
  @Matches(UUID_V4_PATTERN)
  holdToken!: string;

  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => PassengerDto)
  passenger!: PassengerDto;

  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => PaymentDto)
  payment!: PaymentDto;
}

/** `GET /api/bookings/{code}`: se admite minúscula y se consulta en mayúscula. */
export class BookingCodeParamsDto {
  @Transform(upperCase)
  @Matches(BOOKING_CODE_PATTERN)
  code!: string;
}

/** `?lastName=`: obligatorio, con las mismas reglas que el nombre del pasajero. */
export class TicketQueryDto {
  @IsPassengerName()
  lastName!: string;
}
