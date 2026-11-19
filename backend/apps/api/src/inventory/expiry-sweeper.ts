import { EventBus, publishAll } from '@backend/events';
import { SeatEntity } from '@backend/persistence';
import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { seatChanged } from './hold.service';
import { readSweepIntervalMs } from './inventory.config';

/**
 * Expiración activa (arch §4.5): cada segundo, un único `UPDATE` condicional
 * libera los bloqueos vencidos según el reloj de PostgreSQL y publica un
 * `seat.changed` (`AVAILABLE`) por fila, después del commit. Funciona aunque no
 * haya clientes conectados. Varias pasadas simultáneas no se pisan: solo la que
 * modifica la fila la publica.
 */
@Injectable()
export class ExpirySweeper implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ExpirySweeper.name);
  private readonly intervalMs: number;
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly bus: EventBus,
    config: ConfigService,
  ) {
    this.intervalMs = readSweepIntervalMs(config);
  }

  onApplicationBootstrap(): void {
    if (this.intervalMs === 0) return;
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Una pasada del barrido. Devuelve cuántos bloqueos liberó. */
  async sweepOnce(): Promise<number> {
    const result = await this.dataSource
      .createQueryBuilder()
      .update(SeatEntity)
      .set({
        status: 'AVAILABLE',
        heldBy: null,
        holdToken: null,
        holdExpiresAt: null,
        version: () => 'version + 1',
      })
      .where(`status = 'HELD' AND hold_expires_at <= now()`)
      .returning(['flightId', 'seatCode', 'version'])
      .updateEntity(false)
      .execute();

    const rows = result.raw as Array<{ flight_id: string; seat_code: string; version: number }>;
    publishAll(
      this.bus,
      rows.map((row) =>
        seatChanged({
          flightId: row.flight_id,
          seatCode: row.seat_code,
          status: 'AVAILABLE',
          version: row.version,
        }),
      ),
      this.logger,
    );
    return rows.length;
  }

  /** Evita pasadas solapadas si una tarda más que el periodo. */
  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.sweepOnce();
    } catch (error) {
      this.logger.error(
        'Falló el barrido de bloqueos vencidos',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }
}
