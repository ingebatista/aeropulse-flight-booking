import { BookingEntity } from './booking.entity';
import { FlightEntity } from './flight.entity';
import { SeatEntity } from './seat.entity';

export { BookingEntity, FlightEntity, SeatEntity };

/**
 * Entidades de TypeORM. Igual que las migraciones, se listan como clases
 * importadas: con webpack no sirven los patrones de rutas.
 */
export const ENTITIES: Array<new () => object> = [FlightEntity, SeatEntity, BookingEntity];
