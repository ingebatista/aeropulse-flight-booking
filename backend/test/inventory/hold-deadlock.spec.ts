import {
  holdSeat,
  newClientId,
  readSeat,
  type SeededDatabase,
  startApi,
  startSeededDatabase,
  type TestApi,
  waitForLockWaiters,
} from '../support/api';

/**
 * Interbloqueo al cambiar de asiento (arch §4.3). Se provoca de forma
 * determinista con una transacción del propietario:
 *
 * 1. La prueba toma la fila del asiento destino (1B).
 * 2. La API, en su primer intento, libera el asiento previo del cliente (1A,
 *    queda bloqueado por ella) y espera por 1B.
 * 3. La prueba intenta escribir 1A → ciclo de espera.
 *
 * La prueba sube su `deadlock_timeout` para que PostgreSQL detecte el ciclo
 * desde la sesión de la API, que es la que se aborta con `40P01`. La API debe
 * revertir ese intento por completo, reintentar una vez y responder `201`.
 */
describe('interbloqueo al cambiar de asiento', () => {
  let seeded: SeededDatabase;
  let api: TestApi;

  beforeAll(async () => {
    seeded = await startSeededDatabase();
    api = await startApi(seeded);
  });

  afterAll(async () => {
    await api?.close();
    await seeded?.stop();
  });

  it('se revierte el intento abortado y el reintento completa el cambio', async () => {
    const flightId = seeded.nextFlightId();
    const client = newClientId();
    const first = await holdSeat(api, flightId, '1A', client);
    expect(first.status).toBe(201);
    api.clearEvents();

    const runner = seeded.owner.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      // Solo un superusuario puede cambiarlo; así la víctima del ciclo es la API.
      await runner.query(`SET LOCAL deadlock_timeout = '10s'`);
      await runner.query(
        `SELECT 1 FROM seats WHERE flight_id = $1 AND seat_code = '1B' FOR UPDATE`,
        [flightId],
      );

      const pending = holdSeat(api, flightId, '1B', client);
      await waitForLockWaiters(seeded.owner);

      // Cierra el ciclo. Esta sentencia solo termina si PostgreSQL abortó el primer
      // intento de la API (que tenía la fila 1A); si no, la prueba agotaría su tiempo.
      await runner.query(
        `UPDATE seats SET version = version WHERE flight_id = $1 AND seat_code = '1A'`,
        [flightId],
      );
      await runner.rollbackTransaction();

      const result = await pending;
      expect(result.status).toBe(201);
      expect(result.body.seat).toEqual({ flightId, seatCode: '1B', status: 'HELD', version: 2 });
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();
    }

    // Estado final del reintento, con una sola subida de versión por asiento.
    expect(await readSeat(seeded.owner, flightId, '1A')).toMatchObject({
      status: 'AVAILABLE',
      version: 3,
    });
    expect(await readSeat(seeded.owner, flightId, '1B')).toMatchObject({
      status: 'HELD',
      held_by: client,
      version: 2,
    });

    // Ningún evento del intento revertido: uno por asiento, del intento confirmado.
    expect(api.seatEvents(flightId)).toHaveLength(2);
    expect(api.seatEvents(flightId)).toEqual(
      expect.arrayContaining([
        { flightId, seatCode: '1A', status: 'AVAILABLE', version: 3 },
        { flightId, seatCode: '1B', status: 'HELD', version: 2 },
      ]),
    );
  });
});
