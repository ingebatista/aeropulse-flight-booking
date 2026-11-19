import type {
  AdminFlightStatus,
  Flight,
  FlightStatus,
  FlightStatusEvent,
  SearchFlightsQuery,
} from '@aeropulse/shared';
import { allowedOrigins, decideStatusChange } from '@backend/domain';
import { EventBus, publishAll } from '@backend/events';
import { FlightEntity } from '@backend/persistence';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { And, LessThan, MoreThanOrEqual, Repository } from 'typeorm';
import { ApiError } from '../http/errors/api-error';

const DAY_MS = 86_400_000;

@Injectable()
export class FlightsService {
  private readonly logger = new Logger(FlightsService.name);

  // Lecturas y una sola sentencia por operación, sin transacción: la invariante 3
  // solo prohíbe el repositorio inyectado dentro de `dataSource.transaction()`.
  constructor(
    @InjectRepository(FlightEntity) private readonly flights: Repository<FlightEntity>,
    private readonly bus: EventBus,
  ) {}

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

  /**
   * Cambio de estado operativo desde administración (arch §4.7). Un solo
   * `UPDATE` condicional decide: solo toma la fila del vuelo, sube la versión y
   * publica `flight.status_changed` tras el commit. Si no afecta filas, una
   * lectura elige la respuesta: `404`, `200` sin cambios o `409`.
   */
  async changeStatus(flightId: string, status: AdminFlightStatus): Promise<FlightStatusEvent> {
    const result = await this.flights.manager
      .createQueryBuilder()
      .update(FlightEntity)
      .set({ status, version: () => 'version + 1' })
      .where('id = :flightId AND status IN (:...origins)', {
        flightId,
        origins: allowedOrigins(status),
      })
      .returning(['status', 'soldOut', 'version'])
      .updateEntity(false)
      .execute();

    if (result.affected === 1) {
      const [row] = result.raw as Array<{
        status: FlightStatus;
        sold_out: boolean;
        version: number;
      }>;
      const event: FlightStatusEvent = {
        flightId,
        status: row.status,
        soldOut: row.sold_out,
        version: row.version,
      };
      publishAll(this.bus, [{ type: 'flight.status_changed', payload: event }], this.logger);
      this.logger.log(`Vuelo ${flightId}: estado ${status} (versión ${row.version})`);
      return event;
    }

    const flight = await this.flights.findOneBy({ id: flightId });
    if (!flight) throw new ApiError('FLIGHT_NOT_FOUND', 'El vuelo no existe.');

    if (decideStatusChange(flight.status, status) === 'UNCHANGED') {
      // Repetir el mismo estado devuelve la versión actual, sin evento.
      return {
        flightId,
        status: flight.status,
        soldOut: flight.soldOut,
        version: flight.version,
      };
    }
    this.logger.log(`Vuelo ${flightId}: transición rechazada ${flight.status} → ${status}`);
    throw new ApiError(
      'INVALID_FLIGHT_TRANSITION',
      `Un vuelo ${flight.status === 'CANCELLED' ? 'cancelado' : 'en este estado'} no puede pasar a ${status}.`,
    );
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
