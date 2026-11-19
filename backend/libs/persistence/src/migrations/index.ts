import { AppRoleGrants1763510400000 } from './1763510400000-app-role-grants';
import { BookingSchema1794960000000 } from './1794960000000-booking-schema';

/**
 * Migraciones en orden. Webpack junta el backend en un solo archivo, así que
 * TypeORM no puede descubrirlas con un patrón de rutas (`dist/**\/*.js`):
 * cada migración nueva se importa y se agrega aquí.
 */
export const MIGRATIONS = [AppRoleGrants1763510400000, BookingSchema1794960000000];
