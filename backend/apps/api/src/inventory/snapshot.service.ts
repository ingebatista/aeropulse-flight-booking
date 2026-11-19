import type { FlightSnapshot, SeatEvent } from '@aeropulse/shared';
import { isHoldActive } from '@backend/domain';
import { FlightEntity, SeatEntity } from '@backend/persistence';
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { toFlight } from '../flights/flights.service';
import { ApiError } from '../http/errors/api-error';

/**
 * Instantánea de un vuelo para `join('flight:{id}')` (arch §4.6): vuelo,
 * asientos, bloqueo propio y `serverNow`, leídos juntos en una transacción
 * corta de solo lectura `REPEATABLE READ`.
 */
@Injectable()
export class SnapshotService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** `serverNow` de la instantánea de búsqueda, con el reloj de PostgreSQL. */
  async serverNow(): Promise<string> {
    const rows: Array<{ now: Date }> = await this.dataSource.query('SELECT now() AS now');
    return rows[0].now.toISOString();
  }

  flightSnapshot(flightId: string, clientId?: string): Promise<FlightSnapshot> {
    return this.dataSource.transaction('REPEATABLE READ', async (manager) => {
      await manager.query('SET TRANSACTION READ ONLY');

      const flight = await manager.findOneBy(FlightEntity, { id: flightId });
      if (!flight) throw new ApiError('FLIGHT_NOT_FOUND', 'El vuelo no existe.');

      const seats = (await manager.findBy(SeatEntity, { flightId })).sort(bySeatCode);
      const rows: Array<{ now: Date }> = await manager.query('SELECT now() AS now');
      const now = rows[0].now;

      // `myHold` solo para el titular de un bloqueo vigente; nunca se expone el de otros.
      const own = clientId
        ? seats.find((seat) => seat.heldBy === clientId && isHoldActive(seat, now))
        : undefined;

      return {
        flight: toFlight(flight),
        seats: seats.map((seat): SeatEvent => ({
          flightId: seat.flightId,
          seatCode: seat.seatCode,
          status: seat.status,
          version: seat.version,
        })),
        myHold: own
          ? {
              seatCode: own.seatCode,
              holdToken: own.holdToken as string,
              holdExpiresAt: (own.holdExpiresAt as Date).toISOString(),
              version: own.version,
            }
          : null,
        serverNow: now.toISOString(),
      };
    });
  }
}

/** Orden natural del mapa: fila numérica y después letra (`2A` antes que `10A`). */
function bySeatCode(a: SeatEntity, b: SeatEntity): number {
  return (
    parseInt(a.seatCode, 10) - parseInt(b.seatCode, 10) || a.seatCode.localeCompare(b.seatCode)
  );
}
