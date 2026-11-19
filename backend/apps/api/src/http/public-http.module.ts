import { Module } from '@nestjs/common';
import { FlightsModule } from '../flights/flights.module';
import { FlightsController } from './flights.controller';
import { HealthController } from './health.controller';

@Module({
  imports: [FlightsModule],
  controllers: [HealthController, FlightsController],
})
export class PublicHttpModule {}
