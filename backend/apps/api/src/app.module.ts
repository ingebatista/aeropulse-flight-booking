import { postgresOptions } from '@backend/persistence';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminHttpModule } from './http/admin-http.module';
import { PublicHttpModule } from './http/public-http.module';
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
    PublicHttpModule,
    AdminHttpModule,
    RealtimeModule,
  ],
})
export class AppModule {}
