import type { SeatStatus } from '@aeropulse/shared';
import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Asiento de un vuelo. Los tres campos del bloqueo tienen valor solo en `HELD`
 * (lo impone un `CHECK` de la base).
 */
@Entity({ name: 'seats' })
export class SeatEntity {
  @PrimaryColumn({ name: 'flight_id', type: 'uuid' })
  flightId!: string;

  @PrimaryColumn({ name: 'seat_code', type: 'varchar', length: 3 })
  seatCode!: string;

  @Column({ type: 'varchar', length: 9, default: 'AVAILABLE' })
  status!: SeatStatus;

  /** `clientId` del titular. Nunca se difunde. */
  @Column({ name: 'held_by', type: 'uuid', nullable: true })
  heldBy!: string | null;

  /** Se entrega solo al titular. */
  @Column({ name: 'hold_token', type: 'uuid', nullable: true })
  holdToken!: string | null;

  @Column({ name: 'hold_expires_at', type: 'timestamptz', nullable: true })
  holdExpiresAt!: Date | null;

  @Column({ type: 'integer', default: 1 })
  version!: number;
}
