import type { Flight, SearchFlightsQuery } from '@aeropulse/shared';
import { FlightEntity } from '@backend/persistence';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { And, LessThan, MoreThanOrEqual, Repository } from 'typeorm';

const DAY_MS = 86_400_000;

@Injectable()
export class FlightsService {
  // Solo lectura y fuera de transacción: la invariante 3 limita el repositorio inyectado a las escrituras.
  constructor(@InjectRepository(FlightEntity) private readonly flights: Repository<FlightEntity>) {}

  /**
   * Vuelos de una ruta en un día UTC: desde su inicio, inclusive, hasta el
   * inicio del día siguiente, exclusivo. Incluye cancelados y agotados.
   */
  async search({ origin, destination, date }: SearchFlightsQuery): Promise<Flight[]> {
    const start = new Date(`${date}T00:00:00.000Z`);
    const end = new Date(start.getTime() + DAY_MS);

    const rows = await this.flights.find({
      where: {
        origin,
        destination,
        departureAt: And(MoreThanOrEqual(start), LessThan(end)),
      },
      order: { departureAt: 'ASC', id: 'ASC' },
    });

    return rows.map(toFlight);
  }
}

export function toFlight(row: FlightEntity): Flight {
  return {
    id: row.id,
    flightNumber: row.flightNumber,
    origin: row.origin,
    destination: row.destination,
    departureAt: row.departureAt.toISOString(),
    arrivalAt: row.arrivalAt.toISOString(),
    fareCop: row.fareCop,
    status: row.status,
    soldOut: row.soldOut,
    version: row.version,
  };
}
