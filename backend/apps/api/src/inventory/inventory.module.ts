import { Module } from '@nestjs/common';
import { ExpirySweeper } from './expiry-sweeper';
import { HoldService } from './hold.service';
import { SnapshotService } from './snapshot.service';

/**
 * Inventario de asientos (arch §3.3): bloqueo, liberación, expiración e
 * instantánea. Escribe `seats`; el `EventBus` llega del módulo global de eventos.
 */
@Module({
  providers: [HoldService, ExpirySweeper, SnapshotService],
  exports: [HoldService, SnapshotService, ExpirySweeper],
})
export class InventoryModule {}
