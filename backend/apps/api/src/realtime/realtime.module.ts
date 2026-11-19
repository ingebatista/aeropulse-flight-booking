import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { RealtimeGateway } from './realtime.gateway';

@Module({ imports: [InventoryModule], providers: [RealtimeGateway] })
export class RealtimeModule {}
