import type { HoldResponse, SeatEvent } from '@aeropulse/shared';
import { decideHoldFallback, decideReleaseFallback, type HoldFallback } from '@backend/domain';
import { type DomainEvent, EventBus, publishAll } from '@backend/events';
import { FlightEntity, SeatEntity } from '@backend/persistence';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, type EntityManager } from 'typeorm';
import { ApiError } from '../http/errors/api-error';
import { readHoldTtlSeconds } from './inventory.config';
import { lookupSeat } from './seat-lookup';

export interface HoldOutcome {
  /** `true` → `201` (bloqueo nuevo); `false` → `200` (el titular ya lo tenía vigente). */
  created: boolean;
  response: HoldResponse;
}

/** Fuerza el *rollback* cuando la adquisición no afectó filas: el paso 1 no debe quedar aplicado. */
class NotAcquired extends Error {}

/** Interbloqueo y choque del índice «un bloqueo por titular y vuelo» comparten un reintento (arch §4.3). */
const MAX_ATTEMPTS = 2;
const HOLDER_INDEX = 'seats_flight_holder_uidx';

const RELEASE_SET = {
  status: 'AVAILABLE' as const,
  heldBy: null,
  holdToken: null,
  holdExpiresAt: null,
  version: () => 'version + 1',
};

@Injectable()
export class HoldService {
  private readonly logger = new Logger(HoldService.name);
  private readonly ttlSeconds: number;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly bus: EventBus,
    config: ConfigService,
  ) {
    this.ttlSeconds = readHoldTtlSeconds(config);
  }

  /**
   * Bloqueo atómico, idempotente para su titular (arch §4.3). Toda la decisión
   * la toman dos `UPDATE` condicionales; los eventos se publican tras el commit.
   */
  async hold(flightId: string, seatCode: string, clientId: string): Promise<HoldOutcome> {
    for (let attempt = 1; ; attempt++) {
      // Eventos de este intento: si se revierte, se descartan con él.
      const events: DomainEvent[] = [];
      try {
        const response = await this.dataSource.transaction('READ COMMITTED', (manager) =>
          this.acquire(manager, flightId, seatCode, clientId, events),
        );
        publishAll(this.bus, events, this.logger);
        return { created: true, response };
      } catch (error) {
        if (error instanceof NotAcquired) return this.holdFallback(flightId, seatCode, clientId);
        if (attempt < MAX_ATTEMPTS && isRetryable(error)) {
          this.logger.warn(`Reintento del bloqueo tras ${describeRetry(error)}`);
          continue;
        }
        throw error;
      }
    }
  }

  private async acquire(
    manager: EntityManager,
    flightId: string,
    seatCode: string,
    clientId: string,
    events: DomainEvent[],
  ): Promise<HoldResponse> {
    // 1) Liberar el bloqueo previo del mismo cliente en este vuelo (otro asiento).
    const released = await manager
      .createQueryBuilder()
      .update(SeatEntity)
      .set(RELEASE_SET)
      .where(
        `flight_id = :flightId AND held_by = :clientId AND status = 'HELD' AND seat_code <> :seatCode`,
        { flightId, clientId, seatCode },
      )
      .returning(['seatCode', 'version'])
      .updateEntity(false)
      .execute();

    // 2) Adquirir el asiento con una sola escritura condicional, con el reloj de PostgreSQL.
    const holdToken = randomUUID();
    const acquired = await manager
      .createQueryBuilder()
      .update(SeatEntity)
      .set({
        status: 'HELD',
        heldBy: clientId,
        holdToken,
        holdExpiresAt: () => 'now() + make_interval(secs => :ttl)',
        version: () => 'version + 1',
      })
      .where(
        `flight_id = :flightId AND seat_code = :seatCode
         AND (status = 'AVAILABLE' OR (status = 'HELD' AND hold_expires_at <= now()))
         AND EXISTS (SELECT 1 FROM flights f WHERE f.id = :flightId AND f.status <> 'CANCELLED')`,
        { flightId, seatCode },
      )
      .setParameter('ttl', this.ttlSeconds)
      .returning(['version', 'holdExpiresAt'])
      .updateEntity(false)
      .execute();

    if (acquired.affected !== 1) throw new NotAcquired();
    const [row] = acquired.raw as Array<{ version: number; hold_expires_at: Date }>;

    // Asiento primero, vuelo después (invariante 6). Si una cancelación tiene la fila
    // del vuelo, esta lectura espera su commit y la ve.
    const flight = await manager
      .createQueryBuilder(FlightEntity, 'flight')
      .select(['flight.id', 'flight.status'])
      .where('flight.id = :flightId', { flightId })
      .setLock('pessimistic_read')
      .getOne();
    if (!flight || flight.status === 'CANCELLED') throw holdError('FLIGHT_CANCELLED');

    const serverNow = await databaseNow(manager);

    for (const seat of released.raw as Array<{ seat_code: string; version: number }>) {
      events.push(
        seatChanged({
          flightId,
          seatCode: seat.seat_code,
          status: 'AVAILABLE',
          version: seat.version,
        }),
      );
    }
    const seat: SeatEvent = { flightId, seatCode, status: 'HELD', version: row.version };
    events.push(seatChanged(seat));

    return {
      seat,
      hold: {
        seatCode,
        holdToken,
        holdExpiresAt: row.hold_expires_at.toISOString(),
        version: row.version,
      },
      serverNow: serverNow.toISOString(),
    };
  }

  /** Cero filas: la transacción ya se revirtió y una lectura elige la respuesta. */
  private async holdFallback(
    flightId: string,
    seatCode: string,
    clientId: string,
  ): Promise<HoldOutcome> {
    const { lookup, now } = await lookupSeat(this.dataSource, flightId, seatCode);
    const decision = decideHoldFallback(lookup, clientId, now);

    if (decision === 'OWN_ACTIVE_HOLD' && lookup.seat) {
      // Mismo token, vencimiento y versión: el reintento no extiende el plazo ni emite eventos.
      const { holdToken, holdExpiresAt, version } = lookup.seat;
      return {
        created: false,
        response: {
          seat: { flightId, seatCode, status: 'HELD', version },
          hold: {
            seatCode,
            holdToken: holdToken as string,
            holdExpiresAt: (holdExpiresAt as Date).toISOString(),
            version,
          },
          serverNow: now.toISOString(),
        },
      };
    }
    if (decision === 'OWN_ACTIVE_HOLD') throw holdError('SEAT_UNAVAILABLE');
    throw holdError(decision);
  }

  /**
   * Liberación explícita (arch §4.5). Solo un `UPDATE` condicional cambia el
   * asiento; si no afecta filas, una lectura decide entre `404`, `409` o `204`.
   * Se permite aunque el vuelo esté cancelado.
   */
  async release(
    flightId: string,
    seatCode: string,
    clientId: string,
    holdToken: string,
  ): Promise<void> {
    const result = await this.dataSource
      .createQueryBuilder()
      .update(SeatEntity)
      .set(RELEASE_SET)
      .where(
        `flight_id = :flightId AND seat_code = :seatCode AND status = 'HELD'
         AND held_by = :clientId AND hold_token = :holdToken AND hold_expires_at > now()`,
        { flightId, seatCode, clientId, holdToken },
      )
      .returning(['version'])
      .updateEntity(false)
      .execute();

    if (result.affected === 1) {
      const [row] = result.raw as Array<{ version: number }>;
      publishAll(
        this.bus,
        [seatChanged({ flightId, seatCode, status: 'AVAILABLE', version: row.version })],
        this.logger,
      );
      return;
    }

    const { lookup, now } = await lookupSeat(this.dataSource, flightId, seatCode);
    switch (decideReleaseFallback(lookup, clientId, holdToken, now)) {
      case 'FLIGHT_NOT_FOUND':
        throw holdError('FLIGHT_NOT_FOUND');
      case 'SEAT_NOT_FOUND':
        throw holdError('SEAT_NOT_FOUND');
      case 'HOLD_NOT_OWNED':
        throw new ApiError(
          'HOLD_NOT_OWNED',
          'El asiento tiene un bloqueo vigente de otro titular.',
        );
      case 'NOTHING_TO_RELEASE':
        return;
    }
  }
}

export function seatChanged(payload: SeatEvent): DomainEvent {
  return { type: 'seat.changed', payload };
}

async function databaseNow(manager: EntityManager): Promise<Date> {
  const rows: Array<{ now: Date }> = await manager.query('SELECT now() AS now');
  return rows[0].now;
}

function holdError(code: Exclude<HoldFallback, 'OWN_ACTIVE_HOLD'>): ApiError {
  switch (code) {
    case 'FLIGHT_NOT_FOUND':
      return new ApiError('FLIGHT_NOT_FOUND', 'El vuelo no existe.');
    case 'SEAT_NOT_FOUND':
      return new ApiError('SEAT_NOT_FOUND', 'El asiento no existe en este vuelo.');
    case 'FLIGHT_CANCELLED':
      return new ApiError('FLIGHT_CANCELLED', 'El vuelo está cancelado.');
    case 'SEAT_UNAVAILABLE':
      return new ApiError('SEAT_UNAVAILABLE', 'El asiento no está disponible.');
  }
}

function pgError(error: unknown): { code?: string; constraint?: string } {
  return ((error as { driverError?: unknown })?.driverError ?? error ?? {}) as {
    code?: string;
    constraint?: string;
  };
}

function isRetryable(error: unknown): boolean {
  const { code, constraint } = pgError(error);
  return code === '40P01' || (code === '23505' && constraint === HOLDER_INDEX);
}

function describeRetry(error: unknown): string {
  return pgError(error).code === '40P01' ? 'un interbloqueo' : 'un choque del índice por titular';
}
