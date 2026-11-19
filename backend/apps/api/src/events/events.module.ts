import { EventBus, InProcessEventBus } from '@backend/events';
import { Global, Logger, Module } from '@nestjs/common';

/** Bus de eventos en proceso, disponible para toda la API (arch §3.3). */
@Global()
@Module({
  providers: [
    {
      provide: EventBus,
      useFactory: () => new InProcessEventBus(new Logger('EventBus')),
    },
  ],
  exports: [EventBus],
})
export class EventsModule {}
