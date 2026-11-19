import type { LoggerService } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ExpirySweeper } from '../../apps/api/src/inventory/expiry-sweeper';
import {
  APPROVED_CARD,
  changeFlightStatus,
  confirmBooking,
  DECLINED_CARD,
  expireHold,
  holdFor,
  holdSeat,
  newClientId,
  releaseSeat,
  type SeededDatabase,
  startApi,
  startSeededDatabase,
  TEST_ADMIN_TOKEN,
  type TestApi,
} from '../support/api';

/** Captura todo lo que la API registra, en cualquier nivel. */
class CaptureLogger implements LoggerService {
  readonly lines: string[] = [];
  private push = (...parts: unknown[]) =>
    this.lines.push(parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join(' '));
  log = this.push;
  error = this.push;
  warn = this.push;
  debug = this.push;
  verbose = this.push;
  fatal = this.push;
}

/**
 * Checklist §5 M4: registros de bloqueos, confirmaciones, expiraciones y
 * conflictos útiles para depurar, sin tokens, identificadores de cliente ni
 * datos de pago o del pasajero.
 */
describe('registros sin datos sensibles', () => {
  let seeded: SeededDatabase;
  let api: TestApi;
  const logger = new CaptureLogger();

  beforeAll(async () => {
    seeded = await startSeededDatabase();
    api = await startApi(seeded, {}, logger);
  });

  afterAll(async () => {
    await api?.close();
    await seeded?.stop();
  });

  it('registra cada operación sin exponer secretos', async () => {
    const flightId = seeded.nextFlightId();
    const secrets: string[] = [TEST_ADMIN_TOKEN, APPROVED_CARD, DECLINED_CARD, 'Laura', 'Gómez'];

    // Bloqueo, liberación y nuevo bloqueo.
    const first = await holdFor(api, flightId, '1A');
    secrets.push(first.clientId, first.holdToken);
    await releaseSeat(api, flightId, '1A', first.clientId, first.holdToken);
    const hold = await holdFor(api, flightId, '1B', first.clientId);
    secrets.push(hold.holdToken);

    // Conflicto de otro cliente.
    const intruder = newClientId();
    secrets.push(intruder);
    await holdSeat(api, flightId, '1B', intruder);

    // Pago rechazado, confirmación, reintento y clave reutilizada.
    const key = randomUUID();
    secrets.push(key);
    await confirmBooking(api, { ...hold, idempotencyKey: key, cardNumber: DECLINED_CARD });
    const ticket = await confirmBooking(api, { ...hold, idempotencyKey: key });
    secrets.push(ticket.body.code);
    await confirmBooking(api, { ...hold, idempotencyKey: key });
    await confirmBooking(api, { ...hold, idempotencyKey: key, lastName: 'Pérez' });

    // Expiración por el barrido y cambio de estado del vuelo.
    const expiring = await holdFor(api, flightId, '2A');
    secrets.push(expiring.clientId, expiring.holdToken);
    await expireHold(seeded.owner, flightId, '2A');
    await api.app.get(ExpirySweeper).sweepOnce();
    await changeFlightStatus(api, flightId, 'DELAYED');

    const log = logger.lines.join('\n');

    // Hay un registro útil de cada tipo de operación.
    for (const expected of [
      `Bloqueo ${flightId}/1A`,
      `Liberación ${flightId}/1A`,
      `Bloqueo rechazado ${flightId}/1B: SEAT_UNAVAILABLE`,
      `Confirmación rechazada ${flightId}/1B: PAYMENT_DECLINED`,
      `Reserva confirmada ${flightId}/1B`,
      `Confirmación repetida con la misma clave ${flightId}/1B`,
      `Confirmación rechazada ${flightId}/1B: IDEMPOTENCY_KEY_REUSED`,
      `Barrido: 1 bloqueo(s) vencido(s) liberado(s): ${flightId}/2A`,
      `Vuelo ${flightId}: estado DELAYED`,
    ]) {
      expect(log).toContain(expected);
    }

    // Y ninguno lleva identificadores de cliente, tokens, claves, datos del pasajero ni de pago.
    for (const secret of secrets) expect(log).not.toContain(secret);
    expect(log).not.toMatch(/4242|0002/);
  });
});
