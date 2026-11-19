import { BOOKING_CODE_PATTERN, TEST_CARDS } from '@aeropulse/shared';
import type { SeatState } from '../seats/seat-state';
import { generateBookingCode, normalizeBookingCode } from './booking-code';
import { cardBrand, cardLast4 } from './card';
import { decideConfirmFallback } from './decisions';
import { requestHash } from './fingerprint';
import { isValidLuhn } from './luhn';
import { isValidName, normalizeName, sameLastName } from './names';

describe('Luhn', () => {
  it('acepta las dos tarjetas de prueba del contrato', () => {
    for (const card of TEST_CARDS) expect(isValidLuhn(card.cardNumber)).toBe(true);
  });

  it.each(['4242424242424241', '4000000000000001', '1234567812345678'])(
    'rechaza %s (dígito de control incorrecto)',
    (n) => expect(isValidLuhn(n)).toBe(false),
  );

  it.each(['', '4242 4242 4242 4242', '42424242424242a2', '４２４２'])(
    'rechaza "%s" por no ser solo dígitos ASCII',
    (n) => expect(isValidLuhn(n)).toBe(false),
  );
});

describe('código de reserva', () => {
  it('genera 6 caracteres del alfabeto del contrato', () => {
    for (let i = 0; i < 200; i++) expect(generateBookingCode()).toMatch(BOOKING_CODE_PATTERN);
  });

  it('mapea cada byte al alfabeto sin sesgo (byte % 32)', () => {
    const bytes = Uint8Array.from([0, 31, 32, 63, 255, 8]);
    // 'A' (0), '9' (31), 'A' (32), '9' (63), '9' (255 % 32 = 31), 'J' (8: sin 'I')
    expect(generateBookingCode(() => bytes)).toBe('A9A99J');
  });

  it('se consulta en mayúscula', () => {
    expect(normalizeBookingCode('abc23z')).toBe('ABC23Z');
  });
});

describe('tarjeta', () => {
  it.each([
    ['4242424242424242', 'VISA'],
    ['5555555555554444', 'MASTERCARD'],
    ['2223003122003222', 'MASTERCARD'],
    ['378282246310005', 'AMEX'],
    ['6011111111111117', 'OTHER'],
  ])('%s → %s', (number, brand) => expect(cardBrand(number)).toBe(brand));

  it('solo conserva los últimos cuatro dígitos', () => {
    expect(cardLast4('4000000000000002')).toBe('0002');
  });
});

describe('nombres', () => {
  it('normaliza a NFC y recorta los extremos', () => {
    const decomposed = 'Gómez'; // "o" + acento combinante
    expect(normalizeName(`  ${decomposed}  `)).toBe('Gómez');
  });

  it.each(['Laura', "O'Neill", 'María José', 'Gómez-Pérez', 'a'.repeat(60), '  Ana  '])(
    'acepta "%s"',
    (name) => expect(isValidName(name)).toBe(true),
  );

  it.each(['', '   ', 'a'.repeat(61), 'Ana\nMaría', 'Ana\tMaría', 'Ana\u0000', 42, null])(
    'rechaza %p',
    (name) => expect(isValidName(name)).toBe(false),
  );

  it('compara el apellido sin distinguir mayúsculas pero conservando acentos', () => {
    expect(sameLastName('Gómez', 'gómez')).toBe(true);
    expect(sameLastName('Gómez', ' GÓMEZ ')).toBe(true);
    expect(sameLastName('Gómez', 'Gómez')).toBe(true);
    expect(sameLastName('Gómez', 'Gomez')).toBe(false);
  });
});

describe('huella de la solicitud', () => {
  const base = {
    flightId: 'D92A8037-1598-4B45-985F-84158129142F',
    seatCode: '2A',
    clientId: '11111111-1111-4111-8111-111111111111',
    holdToken: '53D65DC2-9904-43FB-9699-60C553A9D774',
    firstName: 'Laura',
    lastName: 'Gómez',
    cardLast4: '4242',
  };

  it('es SHA-256 en hexadecimal y estable ante caja de UUID y normalización de nombres', () => {
    const hash = requestHash(base);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(
      requestHash({
        ...base,
        flightId: base.flightId.toLowerCase(),
        holdToken: base.holdToken.toLowerCase(),
        firstName: '  Laura ',
        lastName: 'Gómez',
      }),
    ).toBe(hash);
  });

  it('cambia con cualquier dato del intento de compra', () => {
    const hash = requestHash(base);
    for (const patch of [
      { seatCode: '2B' },
      { clientId: '22222222-2222-4222-8222-222222222222' },
      { firstName: 'Lucía' },
      { lastName: 'Gomez' },
      { cardLast4: '0002' },
    ]) {
      expect(requestHash({ ...base, ...patch })).not.toBe(hash);
    }
  });
});

describe('decideConfirmFallback', () => {
  const NOW = new Date('2026-11-19T12:00:00.000Z');
  const ME = '11111111-1111-4111-8111-111111111111';
  const TOKEN = '33333333-3333-4333-8333-333333333333';
  const held = (patch: Partial<SeatState> = {}): SeatState => ({
    status: 'HELD',
    heldBy: ME,
    holdToken: TOKEN,
    holdExpiresAt: new Date('2026-11-19T12:05:00.000Z'),
    version: 2,
    ...patch,
  });

  it('sigue el orden del contrato: existencia, estado del vuelo y bloqueo', () => {
    expect(decideConfirmFallback({ flightStatus: null, seat: null }, ME, TOKEN, NOW)).toBe(
      'FLIGHT_NOT_FOUND',
    );
    expect(decideConfirmFallback({ flightStatus: 'SCHEDULED', seat: null }, ME, TOKEN, NOW)).toBe(
      'SEAT_NOT_FOUND',
    );
    expect(decideConfirmFallback({ flightStatus: 'CANCELLED', seat: held() }, ME, TOKEN, NOW)).toBe(
      'FLIGHT_CANCELLED',
    );
    expect(decideConfirmFallback({ flightStatus: 'DELAYED', seat: held() }, ME, TOKEN, NOW)).toBe(
      'ELIGIBLE',
    );
  });

  it('HOLD_INACTIVE si el bloqueo venció, es ajeno, tiene otro token o el asiento ya no está HELD', () => {
    for (const seat of [
      held({ holdExpiresAt: NOW }),
      held({ heldBy: '22222222-2222-4222-8222-222222222222' }),
      held({ holdToken: '44444444-4444-4444-8444-444444444444' }),
      held({ status: 'BOOKED', heldBy: null, holdToken: null, holdExpiresAt: null }),
      held({ status: 'AVAILABLE', heldBy: null, holdToken: null, holdExpiresAt: null }),
    ]) {
      expect(decideConfirmFallback({ flightStatus: 'SCHEDULED', seat }, ME, TOKEN, NOW)).toBe(
        'HOLD_INACTIVE',
      );
    }
  });
});
