import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Un solo salto de proxy (Nginx en Docker): `req.ip` toma la IP real del
  // cliente desde X-Forwarded-For. Sin proxy delante, sigue siendo la del socket.
  app.set('trust proxy', 1);
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 3000), '0.0.0.0');
}

void bootstrap();
