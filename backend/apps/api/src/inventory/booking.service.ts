import type { Ticket } from '@aeropulse/shared';
import {
  cardLast4,
  type ConfirmFallback,
  decideConfirmFallback,
  generateBookingCode,
  normalizeBookingCode,
  normalizeName,
  requestHash,
  sameLastName,
} from '@backend/domain';
import { type DomainEvent, EventBus, publishAll } from '@backend/events';
import { BookingEntity, FlightEntity, SeatEntity } from '@backend/persistence';
import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, type EntityManager } from 'typeorm';
import { ApiError } from '../http/errors/api-error';
import { PaymentGateway } from '../payments/payment-gateway';
import { seatChanged } from './hold.service';
import { lookupSeat } from './seat-lookup';

export interface ConfirmCommand {
  clientId: string;
  idempotencyKey: string;
  flightId: string;
  seatCode: string;
  holdToken: string;
  firstName: string;
  lastName: string;
  /** Solo se usa para cobrar y para `last4`. Nunca se guarda ni se registra. */
  cardNumber: string;
}

export interface ConfirmOutcome {
  /** `true` → `201` (reserva nueva); `false` → `200` (reintento con la misma clave y huella). */
  created: boolean;
  ticket: Ticket;
}

interface Payment {
  reference: string;
  brand: string;
  last4: string;
}

/** Fuerza el *rollback* cuando el `UPDATE` de la confirmación no afectó filas. */
class NotConfirmed extends Error {}

/** Colisión del código de reserva: se reintenta la transacción completa (arch §6). */
const MAX_CODE_ATTEMPTS = 3;

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly payments: PaymentGateway,
    private readonly bus: EventBus,
  ) {}

  /**
   * Confirmación idempotente con pago simulado (arch §4.4). El pago se hace
   * fuera de la transacción; asiento, reserva y agotado se escriben juntos con
   * el mismo `EntityManager`, y los eventos se publican tras el commit.
   */
  async confirm(command: ConfirmCommand): Promise<ConfirmOutcome> {
    const hash = requestHash({ ...command, cardLast4: cardLast4(command.cardNumber) });

    // 1) ¿La clave ya produjo un boleto? Misma huella → 200; distinta → 422.
    const replay = await this.replay(command.idempotencyKey, hash);
    if (replay) return { created: false, ticket: replay };

    // 2) Precomprobación antes de cobrar. No decide el cambio de estado: lo decide el UPDATE.
    const { lookup, now, fareCop } = await lookupSeat(
      this.dataSource,
      command.flightId,
      command.seatCode,
    );
    if (decideConfirmFallback(lookup, command.clientId, command.holdToken, now) !== 'ELIGIBLE') {
      return this.afterConflict(command, hash);
    }

    // 3) Pago fuera de la transacción. Un rechazo no guarda nada y deja la clave libre.
    const charge = await this.payments.charge({
      cardNumber: command.cardNumber,
      amountCop: fareCop as number,
    });
    if (!charge.approved) {
      throw new ApiError('PAYMENT_DECLINED', 'El pago fue rechazado. Revisa la tarjeta.');
    }

    // 4) Transacción de confirmación.
    for (let attempt = 1; ; attempt++) {
      const events: DomainEvent[] = [];
      try {
        const ticket = await this.dataSource.transaction('READ COMMITTED', (manager) =>
          this.book(manager, command, hash, charge, events),
        );
        publishAll(this.bus, events, this.logger);
        return { created: true, ticket };
      } catch (error) {
        if (
          error instanceof NotConfirmed ||
          isUniqueViolation(error, 'bookings_idempotency_key_key')
        ) {
          return this.afterConflict(command, hash);
        }
        if (isUniqueViolation(error, 'bookings_code_key') && attempt < MAX_CODE_ATTEMPTS) {
          this.logger.warn('Colisión del código de reserva; se reintenta la confirmación');
          continue;
        }
        throw error;
      }
    }
  }

  private async book(
    manager: EntityManager,
    command: ConfirmCommand,
    hash: string,
    payment: Payment,
    events: DomainEvent[],
  ): Promise<Ticket> {
    const { flightId, seatCode } = command;

    // HELD → BOOKED solo si el bloqueo sigue vigente y es de este cliente y token.
    const booked = await manager
      .createQueryBuilder()
      .update(SeatEntity)
      .set({
        status: 'BOOKED',
        heldBy: null,
        holdToken: null,
        holdExpiresAt: null,
        version: () => 'version + 1',
      })
      .where(
        `flight_id = :flightId AND seat_code = :seatCode AND status = 'HELD'
         AND held_by = :clientId AND hold_token = :holdToken AND hold_expires_at > now()`,
        { flightId, seatCode, clientId: command.clientId, holdToken: command.holdToken },
      )
      .returning(['version'])
      .updateEntity(false)
      .execute();
    if (booked.affected !== 1) throw new NotConfirmed();
    const [seatRow] = booked.raw as Array<{ version: number }>;

    // Asiento primero, vuelo después (invariante 6). FOR UPDATE serializa el conteo del agotado.
    const flight = await manager
      .createQueryBuilder(FlightEntity, 'flight')
      .where('flight.id = :flightId', { flightId })
      .setLock('pessimistic_write')
      .getOne();
    if (!flight || flight.status === 'CANCELLED') {
      throw new ApiError('FLIGHT_CANCELLED', 'El vuelo está cancelado.');
    }

    const firstName = normalizeName(command.firstName);
    const lastName = normalizeName(command.lastName);
    const code = generateBookingCode();
    const inserted = await manager
      .createQueryBuilder()
      .insert()
      .into(BookingEntity)
      .values({
        id: randomUUID(),
        code,
        flightId,
        seatCode,
        passengerFirstName: firstName,
        passengerLastName: lastName,
        amountCop: flight.fareCop,
        cardLast4: payment.last4,
        cardBrand: payment.brand,
        paymentReference: payment.reference,
        idempotencyKey: command.idempotencyKey,
        requestHash: hash,
      })
      .returning(['createdAt'])
      .updateEntity(false)
      .execute();
    const [{ created_at: createdAt }] = inserted.raw as Array<{ created_at: Date }>;

    events.push(seatChanged({ flightId, seatCode, status: 'BOOKED', version: seatRow.version }));

    // ¿Era el último asiento? Bajo el bloqueo del vuelo, el conteo ve las confirmaciones previas.
    const pending = await manager
      .createQueryBuilder(SeatEntity, 'seat')
      .where(`seat.flightId = :flightId AND seat.status <> 'BOOKED'`, { flightId })
      .getCount();
    if (pending === 0 && !flight.soldOut) {
      const soldOut = await manager
        .createQueryBuilder()
        .update(FlightEntity)
        .set({ soldOut: true, version: () => 'version + 1' })
        .where('id = :flightId AND sold_out = false', { flightId })
        .returning(['version'])
        .updateEntity(false)
        .execute();
      if (soldOut.affected === 1) {
        const [{ version }] = soldOut.raw as Array<{ version: number }>;
        events.push({
          type: 'flight.status_changed',
          payload: { flightId, status: flight.status, soldOut: true, version },
        });
      }
    }

    return toTicket(flight, {
      code,
      seatCode,
      firstName,
      lastName,
      amountCop: flight.fareCop,
      createdAt,
    });
  }

  /**
   * Tras un conflicto de estado o de unicidad (ya revertido), se vuelve a
   * consultar la clave: otro intento pudo haber generado el boleto. Si no,
   * se elige el error en el orden del contrato.
   */
  private async afterConflict(command: ConfirmCommand, hash: string): Promise<ConfirmOutcome> {
    const replay = await this.replay(command.idempotencyKey, hash);
    if (replay) return { created: false, ticket: replay };

    const { lookup, now } = await lookupSeat(this.dataSource, command.flightId, command.seatCode);
    const decision = decideConfirmFallback(lookup, command.clientId, command.holdToken, now);
    throw confirmError(decision === 'ELIGIBLE' ? 'HOLD_INACTIVE' : decision);
  }

  /** Boleto ya emitido con esa clave: `null` si no existe, `422` si la huella difiere. */
  private async replay(idempotencyKey: string, hash: string): Promise<Ticket | null> {
    const booking = await this.dataSource.manager.findOneBy(BookingEntity, { idempotencyKey });
    if (!booking) return null;
    if (booking.requestHash !== hash) {
      throw new ApiError(
        'IDEMPOTENCY_KEY_REUSED',
        'La clave de idempotencia ya se usó con otros datos.',
      );
    }
    return this.ticketOf(booking);
  }

  /** `GET /api/bookings/{code}?lastName=`. Código inexistente y apellido distinto responden igual. */
  async findTicket(code: string, lastName: string): Promise<Ticket> {
    const booking = await this.dataSource.manager.findOneBy(BookingEntity, {
      code: normalizeBookingCode(code),
    });
    if (!booking || !sameLastName(booking.passengerLastName, lastName)) {
      throw new ApiError('BOOKING_NOT_FOUND', 'No encontramos un boleto con esos datos.');
    }
    return this.ticketOf(booking);
  }

  private async ticketOf(booking: BookingEntity): Promise<Ticket> {
    const flight = await this.dataSource.manager.findOneByOrFail(FlightEntity, {
      id: booking.flightId,
    });
    return toTicket(flight, {
      code: booking.code,
      seatCode: booking.seatCode,
      firstName: booking.passengerFirstName,
      lastName: booking.passengerLastName,
      amountCop: booking.amountCop,
      createdAt: booking.createdAt,
    });
  }
}

/** El boleto nunca incluye datos de pago. */
function toTicket(
  flight: FlightEntity,
  booking: {
    code: string;
    seatCode: string;
    firstName: string;
    lastName: string;
    amountCop: number;
    createdAt: Date;
  },
): Ticket {
  return {
    code: booking.code,
    flight: {
      id: flight.id,
      flightNumber: flight.flightNumber,
      origin: flight.origin,
      destination: flight.destination,
      departureAt: flight.departureAt.toISOString(),
      arrivalAt: flight.arrivalAt.toISOString(),
    },
    seatCode: booking.seatCode,
    passenger: { firstName: booking.firstName, lastName: booking.lastName },
    amountCop: booking.amountCop,
    createdAt: booking.createdAt.toISOString(),
  };
}

function confirmError(decision: Exclude<ConfirmFallback, 'ELIGIBLE'>): ApiError {
  switch (decision) {
    case 'FLIGHT_NOT_FOUND':
      return new ApiError('FLIGHT_NOT_FOUND', 'El vuelo no existe.');
    case 'SEAT_NOT_FOUND':
      return new ApiError('SEAT_NOT_FOUND', 'El asiento no existe en este vuelo.');
    case 'FLIGHT_CANCELLED':
      return new ApiError('FLIGHT_CANCELLED', 'El vuelo está cancelado.');
    case 'HOLD_INACTIVE':
      return new ApiError('HOLD_INACTIVE', 'No hay un bloqueo vigente para confirmar.');
  }
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  const driver = ((error as { driverError?: unknown })?.driverError ?? error ?? {}) as {
    code?: string;
    constraint?: string;
  };
  return driver.code === '23505' && driver.constraint === constraint;
}
