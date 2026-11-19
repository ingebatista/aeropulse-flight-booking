import { HttpAdapterHost } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { ApiExceptionFilter } from './http/errors/api-exception.filter';
import { ApiValidationPipe } from './http/validation/api-validation.pipe';

/**
 * Configuración común de la API. `main.ts` y las pruebas de integración la
 * usan por igual, para probar lo mismo que se despliega.
 */
export function configureApp(app: NestExpressApplication): void {
  // Un solo salto de proxy (Nginx en Docker): `req.ip` toma la IP real del
  // cliente desde X-Forwarded-For. Sin proxy delante, sigue siendo la del socket.
  app.set('trust proxy', 1);
  // Cabeceras de seguridad (arch §5); también quita `X-Powered-By`.
  app.use(helmet());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ApiValidationPipe());
  app.useGlobalFilters(new ApiExceptionFilter(app.get(HttpAdapterHost)));
  app.enableShutdownHooks();
}
