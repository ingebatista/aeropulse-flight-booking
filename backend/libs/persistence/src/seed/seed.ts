import { randomUUID } from 'node:crypto';
import type { DataSource, EntityManager } from 'typeorm';
import { FlightEntity } from '../entities/flight.entity';
import { SeatEntity } from '../entities/seat.entity';
import { buildCatalog } from './catalog';

export interface SeedOptions {
  /** Instante de referencia. Por defecto, `now()` de PostgreSQL. Solo las pruebas lo fijan. */
  now?: Date;
}

export interface SeedResult {
  catalogFlights: number;
  flightsInserted: number;
  seatsInserted: number;
}

/** Filas por sentencia, lejos del límite de 65 535 parámetros de PostgreSQL. */
const SEAT_CHUNK = 1_000;

/**
 * Seed idempotente del catálogo. Clave natural de vuelos `(flight_number,
 * departure_at)` y de asientos `(flight_id, seat_code)`, ambas con
 * `ON CONFLICT DO NOTHING`: nunca cambia estado, tarifa, bloqueos ni reservas de
 * lo que ya existe; solo completa lo que falta. Todo en una transacción.
 */
export function runSeed(dataSource: DataSource, options: SeedOptions = {}): Promise<SeedResult> {
  return dataSource.transaction(async (manager) => {
    const now = options.now ?? (await databaseNow(manager));
    const catalog = buildCatalog(now);
    if (catalog.length === 0) return { catalogFlights: 0, flightsInserted: 0, seatsInserted: 0 };

    const insertedFlights = await manager
      .createQueryBuilder()
      .insert()
      .into(FlightEntity)
      .values(
        catalog.map((flight) => ({
          id: randomUUID(),
          flightNumber: flight.flightNumber,
          origin: flight.origin,
          destination: flight.destination,
          departureAt: flight.departureAt,
          arrivalAt: flight.arrivalAt,
          fareCop: flight.fareCop,
        })),
      )
      .orIgnore()
      .returning(['id'])
      .updateEntity(false)
      .execute();

    // Identificadores reales (nuevos o ya existentes) por clave natural.
    const rows = await manager
      .createQueryBuilder(FlightEntity, 'flight')
      .select(['flight.id', 'flight.flightNumber', 'flight.departureAt'])
      .where(
        `(flight.flight_number, flight.departure_at) IN (
          SELECT * FROM unnest(CAST(:numbers AS varchar[]), CAST(:departures AS timestamptz[]))
        )`,
        {
          numbers: catalog.map((flight) => flight.flightNumber),
          departures: catalog.map((flight) => flight.departureAt.toISOString()),
        },
      )
      .getMany();
    const idByKey = new Map(rows.map((row) => [naturalKey(row), row.id]));

    const seats = catalog.flatMap((flight) => {
      const flightId = idByKey.get(naturalKey(flight));
      if (!flightId) throw new Error(`Seed: falta el vuelo ${flight.flightNumber}`);
      return flight.seatCodes.map((seatCode) => ({ flightId, seatCode }));
    });

    let seatsInserted = 0;
    for (let start = 0; start < seats.length; start += SEAT_CHUNK) {
      const result = await manager
        .createQueryBuilder()
        .insert()
        .into(SeatEntity)
        .values(seats.slice(start, start + SEAT_CHUNK))
        .orIgnore()
        // Con un arreglo, `returning` recibe nombres de propiedad, no de columna.
        .returning(['seatCode'])
        .updateEntity(false)
        .execute();
      seatsInserted += rowCount(result.raw);
    }

    return {
      catalogFlights: catalog.length,
      flightsInserted: rowCount(insertedFlights.raw),
      seatsInserted,
    };
  });
}

async function databaseNow(manager: EntityManager): Promise<Date> {
  const rows: Array<{ now: Date }> = await manager.query('SELECT now() AS now');
  return rows[0].now;
}

function naturalKey(flight: { flightNumber: string; departureAt: Date }): string {
  return `${flight.flightNumber}|${flight.departureAt.toISOString()}`;
}

function rowCount(raw: unknown): number {
  return Array.isArray(raw) ? raw.length : 0;
}
