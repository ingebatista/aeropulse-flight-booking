import type { HoldResponse, SeatEvent } from '@aeropulse/shared';
import { type DomainEvent, EventBus } from '@backend/events';
import { runSeed } from '@backend/persistence';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import type { DataSource } from 'typeorm';
import { AppModule } from '../../apps/api/src/app.module';
import { configureApp } from '../../apps/api/src/bootstrap';
import { startTestDatabase, type TestDatabase } from './postgres';

/** Instante fijo del seed: los datos no dependen del día real. */
export const SEED_NOW = new Date('2026-11-18T12:00:00.000Z');

export interface SeededDatabase {
  db: TestDatabase;
  /** Conexión del propietario, para preparar escenarios y leer el estado real. */
  owner: DataSource;
  /** Devuelve un vuelo habitual (24 asientos) distinto en cada llamada. */
  nextFlightId(): string;
  /** Vuelos de demostración (6 asientos), en orden de salida. */
  demoFlightIds: string[];
  stop(): Promise<void>;
}

/** PostgreSQL real con las migraciones aplicadas por el propietario y el seed. */
export async function startSeededDatabase(): Promise<SeededDatabase> {
  const db = await startTestDatabase();
  const owner = await db.owner().initialize();
  await owner.runMigrations();
  await runSeed(owner, { now: SEED_NOW });

  const standard: Array<{ id: string }> = await owner.query(
    `SELECT id FROM flights WHERE flight_number <> 'AP105' ORDER BY departure_at, id`,
  );
  const demo: Array<{ id: string }> = await owner.query(
    `SELECT id FROM flights WHERE flight_number = 'AP105' ORDER BY departure_at, id`,
  );
  let next = 0;

  return {
    db,
    owner,
    nextFlightId: () => standard[next++].id,
    demoFlightIds: demo.map((row) => row.id),
    stop: async () => {
      await owner.destroy();
      await db.stop();
    },
  };
}

export interface TestApi {
  app: NestExpressApplication;
  baseUrl: string;
  /** Eventos publicados en el bus desde que arrancó la API (o desde el último `clearEvents`). */
  events: DomainEvent[];
  seatEvents(flightId: string, seatCode?: string): SeatEvent[];
  clearEvents(): void;
  close(): Promise<void>;
}

/**
 * Arranca la API real (mismo `AppModule` y `configureApp` que producción) con
 * el rol `app`. Por defecto el barrido automático queda apagado para que las
 * pruebas controlen cuándo vence un bloqueo.
 */
export async function startApi(
  { db }: SeededDatabase,
  env: Record<string, string> = {},
): Promise<TestApi> {
  Object.assign(process.env, {
    PGHOST: db.container.getHost(),
    PGPORT: String(db.container.getPort()),
    DB_NAME: 'flights',
    APP_DB_PASSWORD: 'app_test',
    HOLD_TTL_SECONDS: '300',
    SWEEP_INTERVAL_MS: '0',
    ...env,
  });
  delete process.env.DATABASE_URL;

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ['error'] });
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  const baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');

  const events: DomainEvent[] = [];
  app.get(EventBus).subscribe((event) => events.push(event));

  return {
    app,
    baseUrl,
    events,
    seatEvents: (flightId, seatCode) =>
      events
        .filter((e) => e.type === 'seat.changed')
        .map((e) => e.payload as SeatEvent)
        .filter((e) => e.flightId === flightId && (!seatCode || e.seatCode === seatCode)),
    clearEvents: () => {
      events.length = 0;
    },
    close: () => app.close(),
  };
}

export interface ApiResult<T = unknown> {
  status: number;
  body: T;
  raw: string;
}

async function send<T>(response: Response): Promise<ApiResult<T>> {
  const raw = await response.text();
  return { status: response.status, body: (raw ? JSON.parse(raw) : undefined) as T, raw };
}

export function holdSeat(
  api: TestApi,
  flightId: string,
  seatCode: string,
  clientId: string,
): Promise<ApiResult<HoldResponse>> {
  return fetch(`${api.baseUrl}/api/flights/${flightId}/seats/${seatCode}/hold`, {
    method: 'POST',
    headers: { 'x-client-id': clientId },
  }).then((r) => send<HoldResponse>(r));
}

export function releaseSeat(
  api: TestApi,
  flightId: string,
  seatCode: string,
  clientId: string,
  holdToken: string,
): Promise<ApiResult> {
  return fetch(`${api.baseUrl}/api/flights/${flightId}/seats/${seatCode}/hold`, {
    method: 'DELETE',
    headers: { 'x-client-id': clientId, 'x-hold-token': holdToken },
  }).then((r) => send(r));
}

/** Petición con encabezados repetidos, que `fetch` uniría en uno solo. */
export function rawRequest(
  api: TestApi,
  method: string,
  path: string,
  headers: Record<string, string | string[]>,
): Promise<ApiResult> {
  const url = new URL(`${api.baseUrl}${path}`);
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { method, hostname: url.hostname, port: url.port, path: url.pathname, headers },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, body: raw ? JSON.parse(raw) : undefined, raw }),
        );
      },
    );
    req.on('error', reject);
    req.end();
  });
}

export interface SeatRow {
  status: string;
  held_by: string | null;
  hold_token: string | null;
  hold_expires_at: Date | null;
  version: number;
}

export async function readSeat(
  owner: DataSource,
  flightId: string,
  seatCode: string,
): Promise<SeatRow> {
  const rows: SeatRow[] = await owner.query(
    `SELECT status, held_by, hold_token, hold_expires_at, version FROM seats
     WHERE flight_id = $1 AND seat_code = $2`,
    [flightId, seatCode],
  );
  return rows[0];
}

/** Vence un bloqueo moviendo su vencimiento al pasado, con el reloj de la base. */
export async function expireHold(owner: DataSource, flightId: string, seatCode: string) {
  await owner.query(
    `UPDATE seats SET hold_expires_at = now() - interval '1 second'
     WHERE flight_id = $1 AND seat_code = $2 AND status = 'HELD'`,
    [flightId, seatCode],
  );
}

/** Espera hasta que `n` sesiones del rol `app` estén bloqueadas esperando un lock de fila. */
export async function waitForLockWaiters(owner: DataSource, n = 1, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows: Array<{ count: number }> = await owner.query(
      `SELECT count(*)::int AS count FROM pg_stat_activity
       WHERE usename = 'app' AND wait_event_type = 'Lock'`,
    );
    if (rows[0].count >= n) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`Ninguna sesión de app quedó esperando un lock en ${timeoutMs} ms`);
}

export async function waitFor(check: () => Promise<boolean>, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`La condición no se cumplió en ${timeoutMs} ms`);
}

export const newClientId = (): string => randomUUID();
