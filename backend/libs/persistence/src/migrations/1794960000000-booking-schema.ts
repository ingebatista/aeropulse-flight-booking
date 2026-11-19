import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Esquema de negocio del MVP: `flights`, `seats` y `bookings`, con sus
 * restricciones e índices (docs/persistence.md).
 *
 * Los permisos del rol `app` los cubren los privilegios por defecto de
 * `AppRoleGrants`: aquí no hay `GRANT`. `down()` no usa `CASCADE`, para que una
 * dependencia inesperada detenga la reversión.
 */
export class BookingSchema1794960000000 implements MigrationInterface {
  name = 'BookingSchema1794960000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE flights (
        id uuid NOT NULL,
        flight_number varchar(8) NOT NULL,
        origin char(3) NOT NULL,
        destination char(3) NOT NULL,
        departure_at timestamptz NOT NULL,
        arrival_at timestamptz NOT NULL,
        fare_cop integer NOT NULL,
        status varchar(10) NOT NULL DEFAULT 'SCHEDULED',
        sold_out boolean NOT NULL DEFAULT false,
        version integer NOT NULL DEFAULT 1,
        CONSTRAINT flights_pkey PRIMARY KEY (id),
        CONSTRAINT flights_number_departure_key UNIQUE (flight_number, departure_at),
        CONSTRAINT flights_origin_check CHECK (origin IN ('BAQ', 'BOG', 'MDE')),
        CONSTRAINT flights_destination_check CHECK (destination IN ('BAQ', 'BOG', 'MDE')),
        CONSTRAINT flights_route_check CHECK (origin <> destination),
        CONSTRAINT flights_schedule_check CHECK (arrival_at > departure_at),
        CONSTRAINT flights_fare_check CHECK (fare_cop > 0),
        CONSTRAINT flights_status_check CHECK (status IN ('SCHEDULED', 'DELAYED', 'CANCELLED')),
        CONSTRAINT flights_version_check CHECK (version > 0)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE seats (
        flight_id uuid NOT NULL,
        seat_code varchar(3) NOT NULL,
        status varchar(9) NOT NULL DEFAULT 'AVAILABLE',
        held_by uuid,
        hold_token uuid,
        hold_expires_at timestamptz,
        version integer NOT NULL DEFAULT 1,
        CONSTRAINT seats_pkey PRIMARY KEY (flight_id, seat_code),
        CONSTRAINT seats_flight_fkey FOREIGN KEY (flight_id)
          REFERENCES flights (id) ON DELETE RESTRICT,
        CONSTRAINT seats_code_check CHECK (seat_code ~ '^[0-9]{1,2}[A-D]$'),
        CONSTRAINT seats_status_check CHECK (status IN ('AVAILABLE', 'HELD', 'BOOKED')),
        CONSTRAINT seats_hold_check CHECK (
          (status = 'HELD'
            AND held_by IS NOT NULL
            AND hold_token IS NOT NULL
            AND hold_expires_at IS NOT NULL)
          OR
          (status IN ('AVAILABLE', 'BOOKED')
            AND held_by IS NULL
            AND hold_token IS NULL
            AND hold_expires_at IS NULL)
        ),
        CONSTRAINT seats_version_check CHECK (version > 0)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE bookings (
        id uuid NOT NULL,
        code char(6) NOT NULL,
        flight_id uuid NOT NULL,
        seat_code varchar(3) NOT NULL,
        passenger_first_name varchar(60) NOT NULL,
        passenger_last_name varchar(60) NOT NULL,
        amount_cop integer NOT NULL,
        card_last4 char(4) NOT NULL,
        card_brand varchar(20) NOT NULL,
        payment_reference varchar(40) NOT NULL,
        idempotency_key uuid NOT NULL,
        request_hash char(64) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT bookings_pkey PRIMARY KEY (id),
        CONSTRAINT bookings_seat_fkey FOREIGN KEY (flight_id, seat_code)
          REFERENCES seats (flight_id, seat_code) ON DELETE RESTRICT,
        CONSTRAINT bookings_seat_key UNIQUE (flight_id, seat_code),
        CONSTRAINT bookings_code_key UNIQUE (code),
        CONSTRAINT bookings_idempotency_key_key UNIQUE (idempotency_key),
        CONSTRAINT bookings_code_check CHECK (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
        CONSTRAINT bookings_amount_check CHECK (amount_cop > 0)
      )
    `);

    await queryRunner.query(
      `CREATE INDEX flights_route_departure_idx ON flights (origin, destination, departure_at, id)`,
    );
    await queryRunner.query(
      `CREATE INDEX seats_held_expiry_idx ON seats (hold_expires_at) WHERE status = 'HELD'`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX seats_flight_holder_uidx ON seats (flight_id, held_by) WHERE status = 'HELD'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX seats_flight_holder_uidx`);
    await queryRunner.query(`DROP INDEX seats_held_expiry_idx`);
    await queryRunner.query(`DROP INDEX flights_route_departure_idx`);
    await queryRunner.query(`DROP TABLE bookings`);
    await queryRunner.query(`DROP TABLE seats`);
    await queryRunner.query(`DROP TABLE flights`);
  }
}
