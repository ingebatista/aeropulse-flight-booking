import type { AirportCode, FlightStatus } from '@aeropulse/shared';
import { Column, Entity, PrimaryColumn } from 'typeorm';

/** Vuelo del catálogo. Lo crea solo el seed; la aplicación asigna el UUID v4. */
@Entity({ name: 'flights' })
export class FlightEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'flight_number', type: 'varchar', length: 8 })
  flightNumber!: string;

  @Column({ type: 'char', length: 3 })
  origin!: AirportCode;

  @Column({ type: 'char', length: 3 })
  destination!: AirportCode;

  @Column({ name: 'departure_at', type: 'timestamptz' })
  departureAt!: Date;

  @Column({ name: 'arrival_at', type: 'timestamptz' })
  arrivalAt!: Date;

  @Column({ name: 'fare_cop', type: 'integer' })
  fareCop!: number;

  @Column({ type: 'varchar', length: 10, default: 'SCHEDULED' })
  status!: FlightStatus;

  @Column({ name: 'sold_out', type: 'boolean', default: false })
  soldOut!: boolean;

  /** Sube en cada cambio con `version = version + 1` en la misma sentencia. */
  @Column({ type: 'integer', default: 1 })
  version!: number;
}
