import type { SearchFlightsResponse } from '@aeropulse/shared';
import { Controller, Get, Query } from '@nestjs/common';
import { FlightsService } from '../flights/flights.service';
import { SearchFlightsQueryDto } from './search-flights.query';

@Controller('flights')
export class FlightsController {
  constructor(private readonly flights: FlightsService) {}

  @Get()
  async search(@Query() query: SearchFlightsQueryDto): Promise<SearchFlightsResponse> {
    return { flights: await this.flights.search(query) };
  }
}
