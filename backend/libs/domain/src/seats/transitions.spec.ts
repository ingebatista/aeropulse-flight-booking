import { isHoldActive, isHoldExpired, type SeatState } from './seat-state';
import {
  applyExpire,
  applyHold,
  applyRelease,
  canExpire,
  canHold,
  canRelease,
  IllegalSeatTransition,
} from './transitions';

const NOW = new Date('2026-11-19T12:00:00.000Z');
const PAST = new Date('2026-11-19T11:59:59.000Z');
const FUTURE = new Date('2026-11-19T12:05:00.000Z');
const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const TOKEN = '33333333-3333-4333-8333-333333333333';

const available: SeatState = {
  status: 'AVAILABLE',
  heldBy: null,
  holdToken: null,
  holdExpiresAt: null,
  version: 4,
};
const held = (holdExpiresAt: Date): SeatState => ({
  status: 'HELD',
  heldBy: OWNER,
  holdToken: TOKEN,
  holdExpiresAt,
  version: 5,
});
const booked: SeatState = { ...available, status: 'BOOKED', version: 9 };

describe('vigencia del bloqueo', () => {
  it('está vigente solo si el vencimiento es posterior a now', () => {
    expect(isHoldActive(held(FUTURE), NOW)).toBe(true);
    expect(isHoldActive(held(PAST), NOW)).toBe(false);
  });

  it('en el instante exacto del vencimiento ya está vencido', () => {
    expect(isHoldActive(held(NOW), NOW)).toBe(false);
    expect(isHoldExpired(held(NOW), NOW)).toBe(true);
  });

  it('un asiento que no está HELD no tiene bloqueo vigente ni vencido', () => {
    for (const seat of [available, booked]) {
      expect(isHoldActive(seat, NOW)).toBe(false);
      expect(isHoldExpired(seat, NOW)).toBe(false);
    }
  });
});

describe('hold', () => {
  const params = { clientId: OTHER, holdToken: TOKEN, holdExpiresAt: FUTURE };

  it('se permite sobre un asiento disponible y sube la versión', () => {
    expect(canHold(available, NOW)).toBe(true);
    expect(applyHold(available, NOW, params)).toEqual({
      status: 'HELD',
      heldBy: OTHER,
      holdToken: TOKEN,
      holdExpiresAt: FUTURE,
      version: 5,
    });
  });

  it('se permite sobre un bloqueo vencido, sin esperar al barrido', () => {
    expect(canHold(held(PAST), NOW)).toBe(true);
    expect(canHold(held(NOW), NOW)).toBe(true);
    const next = applyHold(held(PAST), NOW, params);
    expect(next).toMatchObject({ status: 'HELD', heldBy: OTHER, version: 6 });
  });

  it('se rechaza sobre un bloqueo vigente (también el del propio titular) o un asiento reservado', () => {
    expect(canHold(held(FUTURE), NOW)).toBe(false);
    expect(canHold(booked, NOW)).toBe(false);
    expect(() => applyHold(held(FUTURE), NOW, params)).toThrow(IllegalSeatTransition);
    expect(() => applyHold(booked, NOW, params)).toThrow(IllegalSeatTransition);
  });
});

describe('release', () => {
  it('solo el titular con su token libera un bloqueo vigente', () => {
    expect(canRelease(held(FUTURE), OWNER, TOKEN, NOW)).toBe(true);
    expect(applyRelease(held(FUTURE), OWNER, TOKEN, NOW)).toEqual({
      status: 'AVAILABLE',
      heldBy: null,
      holdToken: null,
      holdExpiresAt: null,
      version: 6,
    });
  });

  it('rechaza otro cliente, otro token, un bloqueo vencido y los demás estados', () => {
    const otherToken = '44444444-4444-4444-8444-444444444444';
    expect(canRelease(held(FUTURE), OTHER, TOKEN, NOW)).toBe(false);
    expect(canRelease(held(FUTURE), OWNER, otherToken, NOW)).toBe(false);
    expect(canRelease(held(PAST), OWNER, TOKEN, NOW)).toBe(false);
    expect(canRelease(held(NOW), OWNER, TOKEN, NOW)).toBe(false);
    expect(canRelease(available, OWNER, TOKEN, NOW)).toBe(false);
    expect(canRelease(booked, OWNER, TOKEN, NOW)).toBe(false);
    expect(() => applyRelease(held(FUTURE), OTHER, TOKEN, NOW)).toThrow(IllegalSeatTransition);
  });
});

describe('expire', () => {
  it('libera solo bloqueos vencidos y sube la versión', () => {
    expect(canExpire(held(PAST), NOW)).toBe(true);
    expect(canExpire(held(NOW), NOW)).toBe(true);
    expect(applyExpire(held(PAST), NOW)).toEqual({
      status: 'AVAILABLE',
      heldBy: null,
      holdToken: null,
      holdExpiresAt: null,
      version: 6,
    });
  });

  it('no toca un bloqueo vigente, un asiento disponible ni uno reservado', () => {
    for (const seat of [held(FUTURE), available, booked]) {
      expect(canExpire(seat, NOW)).toBe(false);
      expect(() => applyExpire(seat, NOW)).toThrow(IllegalSeatTransition);
    }
  });
});

describe('cadena de transiciones', () => {
  it('la versión crece en cada cambio y los campos del bloqueo se limpian juntos', () => {
    const params = { clientId: OWNER, holdToken: TOKEN, holdExpiresAt: FUTURE };
    const a = applyHold(available, NOW, params);
    const b = applyRelease(a, OWNER, TOKEN, NOW);
    const c = applyHold(b, NOW, params);
    const d = applyExpire(c, FUTURE);

    expect([available, a, b, c, d].map((s) => s.version)).toEqual([4, 5, 6, 7, 8]);
    for (const seat of [b, d]) {
      expect([seat.heldBy, seat.holdToken, seat.holdExpiresAt]).toEqual([null, null, null]);
    }
  });
});
