import { Module } from '@nestjs/common';
import { AdminFlightsController } from '../admin/admin-flights.controller';
import { AdminTokenGuard } from '../admin/admin-token.guard';
import { FlightsModule } from '../flights/flights.module';

/**
 * Rutas de `/api/admin`. `AdminTokenGuard` se registra como proveedor para que
 * se instancie al arrancar: así un `ADMIN_TOKEN` inválido en producción detiene
 * la API antes de aceptar tráfico.
 */
@Module({
  imports: [FlightsModule],
  controllers: [AdminFlightsController],
  providers: [AdminTokenGuard],
})
export class AdminHttpModule {}
