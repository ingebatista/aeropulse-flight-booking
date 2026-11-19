import { decideHoldFallback, decideReleaseFallback, type SeatLookup } from './decisions';
import type { SeatState } from './seat-state';

const NOW = new Date('2026-11-19T12:00:00.000Z');
const FUTURE = new Date('2026-11-19T12:05:00.000Z');
const PAST = new Date('2026-11-19T11:55:00.000Z');
const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const TOKEN = '33333333-3333-4333-8333-333333333333';

const seat = (patch: Partial<SeatState> = {}): SeatState => ({
  status: 'AVAILABLE',
  heldBy: null,
  holdToken: null,
  holdExpiresAt: null,
  version: 1,
  ...patch,
});
const heldBy = (clientId: string, holdExpiresAt: Date, holdToken = TOKEN): SeatState =>
  seat({ status: 'HELD', heldBy: clientId, holdToken, holdExpiresAt, version: 3 });
const lookup = (flightStatus: SeatLookup['flightStatus'], s: SeatState | null): SeatLookup => ({
  flightStatus,
  seat: s,
});

describe('decideHoldFallback', () => {
  it('404 si no existe el vuelo, aunque se hubiera leído un asiento', () => {
    expect(decideHoldFallback(lookup(null, null), ME, NOW)).toBe('FLIGHT_NOT_FOUND');
    expect(decideHoldFallback(lookup(null, seat()), ME, NOW)).toBe('FLIGHT_NOT_FOUND');
  });

  it('404 si el vuelo existe pero el asiento no', () => {
    expect(decideHoldFallback(lookup('SCHEDULED', null), ME, NOW)).toBe('SEAT_NOT_FOUND');
  });

  it('409 FLIGHT_CANCELLED tiene prioridad sobre el estado del asiento', () => {
    for (const s of [
      seat(),
      heldBy(OTHER, FUTURE),
      heldBy(ME, FUTURE),
      seat({ status: 'BOOKED' }),
    ]) {
      expect(decideHoldFallback(lookup('CANCELLED', s), ME, NOW)).toBe('FLIGHT_CANCELLED');
    }
  });

  it('200 si el mismo cliente conserva el bloqueo vigente', () => {
    expect(decideHoldFallback(lookup('SCHEDULED', heldBy(ME, FUTURE)), ME, NOW)).toBe(
      'OWN_ACTIVE_HOLD',
    );
    expect(decideHoldFallback(lookup('DELAYED', heldBy(ME, FUTURE)), ME, NOW)).toBe(
      'OWN_ACTIVE_HOLD',
    );
  });

  it('409 SEAT_UNAVAILABLE ante el bloqueo vigente de otro cliente o un asiento reservado', () => {
    expect(decideHoldFallback(lookup('SCHEDULED', heldBy(OTHER, FUTURE)), ME, NOW)).toBe(
      'SEAT_UNAVAILABLE',
    );
    expect(decideHoldFallback(lookup('SCHEDULED', seat({ status: 'BOOKED' })), ME, NOW)).toBe(
      'SEAT_UNAVAILABLE',
    );
  });

  it('un bloqueo propio ya vencido no se devuelve como vigente', () => {
    expect(decideHoldFallback(lookup('SCHEDULED', heldBy(ME, PAST)), ME, NOW)).toBe(
      'SEAT_UNAVAILABLE',
    );
    expect(decideHoldFallback(lookup('SCHEDULED', heldBy(ME, NOW)), ME, NOW)).toBe(
      'SEAT_UNAVAILABLE',
    );
  });
});

describe('decideReleaseFallback', () => {
  it('404 si no existe el vuelo o el asiento', () => {
    expect(decideReleaseFallback(lookup(null, null), ME, TOKEN, NOW)).toBe('FLIGHT_NOT_FOUND');
    expect(decideReleaseFallback(lookup('SCHEDULED', null), ME, TOKEN, NOW)).toBe('SEAT_NOT_FOUND');
  });

  it('409 HOLD_NOT_OWNED si el bloqueo vigente es de otro cliente o tiene otro token', () => {
    expect(decideReleaseFallback(lookup('SCHEDULED', heldBy(OTHER, FUTURE)), ME, TOKEN, NOW)).toBe(
      'HOLD_NOT_OWNED',
    );
    const otherToken = '44444444-4444-4444-8444-444444444444';
    expect(
      decideReleaseFallback(lookup('SCHEDULED', heldBy(ME, FUTURE, otherToken)), ME, TOKEN, NOW),
    ).toBe('HOLD_NOT_OWNED');
  });

  it('204 (nada que liberar) si el asiento ya está libre, reservado o con un bloqueo vencido', () => {
    for (const s of [seat(), seat({ status: 'BOOKED' }), heldBy(OTHER, PAST), heldBy(ME, NOW)]) {
      expect(decideReleaseFallback(lookup('SCHEDULED', s), ME, TOKEN, NOW)).toBe(
        'NOTHING_TO_RELEASE',
      );
    }
  });

  it('se permite liberar aunque el vuelo esté cancelado', () => {
    expect(decideReleaseFallback(lookup('CANCELLED', seat()), ME, TOKEN, NOW)).toBe(
      'NOTHING_TO_RELEASE',
    );
  });
});
