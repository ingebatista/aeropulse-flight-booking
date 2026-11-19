import { FlightEntity } from '@backend/persistence';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FlightsService } from './flights.service';

@Module({
  imports: [TypeOrmModule.forFeature([FlightEntity])],
  providers: [FlightsService],
  exports: [FlightsService],
})
export class FlightsModule {}
