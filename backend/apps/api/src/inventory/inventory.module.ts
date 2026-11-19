import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { BookingService } from './booking.service';
import { ExpirySweeper } from './expiry-sweeper';
import { HoldService } from './hold.service';
import { SnapshotService } from './snapshot.service';

/**
 * Inventario de asientos (arch §3.3): bloqueo, liberación, expiración,
 * instantánea y confirmación. Asientos y reservas son un mismo agregado; solo
 * dentro de la confirmación escribe `flights.sold_out`. El `EventBus` llega del
 * módulo global de eventos.
 */
@Module({
  imports: [PaymentsModule],
  providers: [HoldService, ExpirySweeper, SnapshotService, BookingService],
  exports: [HoldService, SnapshotService, ExpirySweeper, BookingService],
})
export class InventoryModule {}
