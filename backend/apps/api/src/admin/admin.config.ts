/** Token de administración por defecto, solo para desarrollo y la demo local (arch §5). */
export const DEV_ADMIN_TOKEN = 'aeropulse-admin-dev';

/**
 * Token de administración. Con `NODE_ENV=production` la API **no arranca** si
 * el token falta o es el de desarrollo. Nunca se registra su valor.
 */
export function readAdminToken(get: (name: string) => string | undefined): string {
  const token = get('ADMIN_TOKEN');
  if (get('NODE_ENV') === 'production') {
    if (!token || token === DEV_ADMIN_TOKEN) {
      throw new Error(
        'ADMIN_TOKEN debe configurarse con un valor propio (distinto del de desarrollo) cuando NODE_ENV=production',
      );
    }
    return token;
  }
  return token || DEV_ADMIN_TOKEN;
}
