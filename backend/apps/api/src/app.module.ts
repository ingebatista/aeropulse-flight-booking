import { postgresOptions } from '@backend/persistence';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventsModule } from './events/events.module';
import { AdminHttpModule } from './http/admin-http.module';
import { PublicHttpModule } from './http/public-http.module';
import {
  assertRateLimits,
  HttpThrottlerGuard,
  RATE_LIMIT_TTL_MS,
  rateLimit,
} from './http/rate-limit';
import { RealtimeModule } from './realtime/realtime.module';

@Module({
  imports: [
    ConfigModule.forRoot({ envFilePath: '../.env', isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        postgresOptions(config.get('DATABASE_URL'), {
          database: config.get('DB_NAME'),
          host: config.get('PGHOST'),
          port: config.get('PGPORT'),
          username: 'app',
          password: config.get('APP_DB_PASSWORD') ?? 'app_dev',
        }),
    }),
    ThrottlerModule.forRootAsync({
      useFactory: () => {
        assertRateLimits();
        return {
          throttlers: [
            { name: 'default', ttl: RATE_LIMIT_TTL_MS, limit: () => rateLimit('GLOBAL') },
          ],
        };
      },
    }),
    EventsModule,
    PublicHttpModule,
    AdminHttpModule,
    RealtimeModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: HttpThrottlerGuard }],
})
export class AppModule {}
