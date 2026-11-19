import type { FlightStatus, SeatStatus } from '@aeropulse/shared';
import type { SeatLookup } from '@backend/domain';
import type { DataSource } from 'typeorm';

interface LookupRow {
  flight_status: FlightStatus | null;
  seat_status: SeatStatus | null;
  held_by: string | null;
  hold_token: string | null;
  hold_expires_at: Date | null;
  version: number | null;
  fare_cop: number | null;
  now: Date;
}

/**
 * Lectura posterior a una escritura condicional sin filas afectadas: estado del
 * vuelo, del asiento y `now()` de PostgreSQL en una sola sentencia. Solo sirve
 * para **elegir la respuesta**; la decisión sobre el asiento ya la tomó el
 * `UPDATE` (arch §4.3). Es de solo lectura y va fuera de toda transacción.
 */
export async function lookupSeat(
  dataSource: DataSource,
  flightId: string,
  seatCode: string,
): Promise<{ lookup: SeatLookup; now: Date; fareCop: number | null }> {
  const rows: LookupRow[] = await dataSource.query(
    `SELECT f.status AS flight_status, f.fare_cop, s.status AS seat_status, s.held_by,
            s.hold_token, s.hold_expires_at, s.version, now() AS now
     FROM (SELECT 1) AS one
     LEFT JOIN flights f ON f.id = $1
     LEFT JOIN seats s ON s.flight_id = f.id AND s.seat_code = $2`,
    [flightId, seatCode],
  );
  const row = rows[0];

  return {
    now: row.now,
    fareCop: row.fare_cop,
    lookup: {
      flightStatus: row.flight_status,
      seat:
        row.seat_status === null
          ? null
          : {
              status: row.seat_status,
              heldBy: row.held_by,
              holdToken: row.hold_token,
              holdExpiresAt: row.hold_expires_at,
              version: row.version ?? 0,
            },
    },
  };
}
