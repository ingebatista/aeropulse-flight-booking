import { Module } from '@nestjs/common';
import { FlightsModule } from '../flights/flights.module';
import { InventoryModule } from '../inventory/inventory.module';
import { FlightsController } from './flights.controller';
import { HealthController } from './health.controller';
import { SeatsController } from './seats.controller';

@Module({
  imports: [FlightsModule, InventoryModule],
  controllers: [HealthController, FlightsController, SeatsController],
})
export class PublicHttpModule {}
