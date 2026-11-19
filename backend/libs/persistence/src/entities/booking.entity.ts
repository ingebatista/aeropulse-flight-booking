import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Reserva confirmada. Existe si y solo si su asiento está `BOOKED`.
 * Nunca guarda el número de tarjeta ni el CVV.
 */
@Entity({ name: 'bookings' })
export class BookingEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ type: 'char', length: 6 })
  code!: string;

  @Column({ name: 'flight_id', type: 'uuid' })
  flightId!: string;

  @Column({ name: 'seat_code', type: 'varchar', length: 3 })
  seatCode!: string;

  @Column({ name: 'passenger_first_name', type: 'varchar', length: 60 })
  passengerFirstName!: string;

  @Column({ name: 'passenger_last_name', type: 'varchar', length: 60 })
  passengerLastName!: string;

  @Column({ name: 'amount_cop', type: 'integer' })
  amountCop!: number;

  @Column({ name: 'card_last4', type: 'char', length: 4 })
  cardLast4!: string;

  @Column({ name: 'card_brand', type: 'varchar', length: 20 })
  cardBrand!: string;

  @Column({ name: 'payment_reference', type: 'varchar', length: 40 })
  paymentReference!: string;

  @Column({ name: 'idempotency_key', type: 'uuid' })
  idempotencyKey!: string;

  /** SHA-256 en hexadecimal de la huella de la solicitud. */
  @Column({ name: 'request_hash', type: 'char', length: 64 })
  requestHash!: string;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;
}
