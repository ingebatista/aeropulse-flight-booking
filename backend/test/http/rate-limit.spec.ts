import type { ErrorResponse, JoinResult } from '@aeropulse/shared';
import { randomUUID } from 'node:crypto';
import { io } from 'socket.io-client';
import {
  type SeededDatabase,
  snapshotEnv,
  startApi,
  startSeededDatabase,
  TEST_ADMIN_TOKEN,
  type TestApi,
} from '../support/api';

/** Límites bajos para provocar el 429. Cada prueba usa su propia IP (X-Forwarded-For). */
const LOW_LIMITS = {
  RATE_LIMIT_GLOBAL: '3',
  RATE_LIMIT_HOLD: '2',
  RATE_LIMIT_CONFIRM: '1',
  RATE_LIMIT_ADMIN: '2',
};

describe('límite de tasa y cabeceras de seguridad', () => {
  let seeded: SeededDatabase;
  let api: TestApi;
  let restoreEnv: () => void;
  let ipCounter = 10;

  beforeAll(async () => {
    restoreEnv = snapshotEnv();
    seeded = await startSeededDatabase();
    api = await startApi(seeded, LOW_LIMITS);
  });

  afterAll(async () => {
    await api?.close();
    restoreEnv();
    await seeded?.stop();
  });

  /** IP de documentación (RFC 5737) distinta en cada prueba: así no comparten contador. */
  const nextIp = () => `203.0.113.${ipCounter++}`;

  async function call(
    method: string,
    path: string,
    ip: string,
    headers: Record<string, string> = {},
    body?: string,
  ) {
    const response = await fetch(`${api.baseUrl}${path}`, {
      method,
      headers: { 'x-forwarded-for': ip, ...headers },
      body,
    });
    const raw = await response.text();
    return {
      status: response.status,
      headers: response.headers,
      body: raw ? JSON.parse(raw) : undefined,
    };
  }

  async function expectThrottledAfter(
    allowed: number,
    request: () => ReturnType<typeof call>,
  ): Promise<void> {
    for (let i = 0; i < allowed; i++) expect((await request()).status).not.toBe(429);

    const blocked = await request();
    expect(blocked.status).toBe(429);
    expect((blocked.body as ErrorResponse).error.code).toBe('RATE_LIMITED');
    const retryAfter = Number(blocked.headers.get('retry-after'));
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThan(0);
  }

  it('límite global por IP en la búsqueda, con Retry-After', async () => {
    const ip = nextIp();
    await expectThrottledAfter(3, () =>
      call('GET', '/api/flights?origin=BOG&destination=MDE&date=2026-11-19', ip),
    );
  });

  it('una IP no consume el límite de otra', async () => {
    const busy = nextIp();
    for (let i = 0; i < 4; i++) {
      await call('GET', '/api/flights?origin=BOG&destination=MDE&date=2026-11-19', busy);
    }
    const other = await call(
      'GET',
      '/api/flights?origin=BOG&destination=MDE&date=2026-11-19',
      nextIp(),
    );
    expect(other.status).toBe(200);
  });

  it('hold tiene un límite más estricto que el global', async () => {
    const ip = nextIp();
    const flightId = seeded.nextFlightId();
    await expectThrottledAfter(2, () =>
      call('POST', `/api/flights/${flightId}/seats/1A/hold`, ip, { 'x-client-id': randomUUID() }),
    );
  });

  it('confirm tiene el límite más estricto', async () => {
    const ip = nextIp();
    const body = JSON.stringify({
      flightId: randomUUID(),
      seatCode: '1A',
      holdToken: randomUUID(),
      passenger: { firstName: 'Laura', lastName: 'Gómez' },
      payment: { cardNumber: '4242424242424242' },
    });
    await expectThrottledAfter(1, () =>
      call(
        'POST',
        '/api/bookings/confirm',
        ip,
        {
          'content-type': 'application/json',
          'x-client-id': randomUUID(),
          'idempotency-key': randomUUID(),
        },
        body,
      ),
    );
  });

  it('/api/admin tiene su propio límite, aplicado incluso antes de autenticar', async () => {
    const ip = nextIp();
    const flightId = seeded.nextFlightId();
    await expectThrottledAfter(2, () =>
      call(
        'PATCH',
        `/api/admin/flights/${flightId}/status`,
        ip,
        { 'content-type': 'application/json', authorization: `Bearer ${TEST_ADMIN_TOKEN}` },
        JSON.stringify({ status: 'DELAYED' }),
      ),
    );
  });

  it('el gateway de Socket.IO no pasa por el límite HTTP', async () => {
    const socket = io(api.baseUrl, { path: '/ws', transports: ['websocket'], reconnection: false });
    try {
      await new Promise<void>((resolve) => socket.once('connect', resolve));
      for (let i = 0; i < 6; i++) {
        const result: JoinResult = await socket.timeout(5_000).emitWithAck('join', 'search');
        expect(result.ok).toBe(true);
      }
    } finally {
      socket.disconnect();
    }
  });

  it('helmet: nosniff y sin X-Powered-By', async () => {
    const { headers } = await call('GET', '/api/health', nextIp());
    expect(headers.get('x-content-type-options')).toBe('nosniff');
    expect(headers.get('x-powered-by')).toBeNull();
    expect(headers.get('x-frame-options')).toBe('SAMEORIGIN');
  });

  it('un límite inválido detiene el arranque', async () => {
    await expect(startApi(seeded, { ...LOW_LIMITS, RATE_LIMIT_HOLD: '0' }, false)).rejects.toThrow(
      /RATE_LIMIT_HOLD/,
    );
  });
});
