import { buildCatalog, DEMO_FLIGHT_NUMBER, SCHEDULES, seatCodes } from './catalog';

describe('catálogo del seed', () => {
  it('cubre las 6 rutas con 1 a 3 horarios y BOG → MDE con 3', () => {
    const byRoute = new Map<string, number>();
    for (const s of SCHEDULES) {
      const route = `${s.origin}-${s.destination}`;
      byRoute.set(route, (byRoute.get(route) ?? 0) + 1);
    }

    expect(byRoute.size).toBe(6);
    for (const count of byRoute.values()) {
      expect(count).toBeGreaterThanOrEqual(1);
      expect(count).toBeLessThanOrEqual(3);
    }
    expect(byRoute.get('BOG-MDE')).toBe(3);
    expect(new Set(SCHEDULES.map((s) => s.flightNumber)).size).toBe(SCHEDULES.length);
  });

  it('el vuelo de demostración es el tercer horario de BOG → MDE, con 6 asientos', () => {
    const bogMde = SCHEDULES.filter((s) => s.origin === 'BOG' && s.destination === 'MDE').sort(
      (a, b) => a.departureUtc.localeCompare(b.departureUtc),
    );
    const demo = bogMde[2];

    expect(demo.flightNumber).toBe(DEMO_FLIGHT_NUMBER);
    expect(seatCodes(demo.seatRows, demo.seatLetters)).toEqual([
      '1A',
      '1B',
      '1C',
      '2A',
      '2B',
      '2C',
    ]);
  });

  it('los vuelos habituales tienen 24 asientos, de 1A a 6D', () => {
    const codes = seatCodes(6, 'ABCD');
    expect(codes).toHaveLength(24);
    expect(codes[0]).toBe('1A');
    expect(codes[23]).toBe('6D');
  });

  it('genera desde hoy hasta el último día del mes UTC, solo con salidas futuras', () => {
    const now = new Date('2026-11-18T12:00:00.000Z');
    const flights = buildCatalog(now);

    // Hoy: 9 horarios después de las 12:00 (AP101 11:00 ya salió). Del 19 al 30: 12 días × 10.
    expect(flights).toHaveLength(9 + 12 * 10);
    expect(flights.every((f) => f.departureAt.getTime() > now.getTime())).toBe(true);
    const last = Math.max(...flights.map((f) => f.departureAt.getTime()));
    expect(new Date(last).toISOString()).toBe('2026-11-30T22:30:00.000Z');
    expect(flights.every((f) => f.arrivalAt.getTime() > f.departureAt.getTime())).toBe(true);
  });

  it('excluye una salida igual al instante actual', () => {
    const flights = buildCatalog(new Date('2026-11-18T22:30:00.000Z'));
    const today = flights.filter((f) => f.departureAt.toISOString().startsWith('2026-11-18'));
    expect(today).toHaveLength(0);
  });

  it('el último día del mes solo genera vuelos de ese día', () => {
    const atMidnight = buildCatalog(new Date('2026-11-30T00:00:00.000Z'));
    expect(atMidnight).toHaveLength(SCHEDULES.length);
    expect(atMidnight.every((f) => f.departureAt.toISOString().startsWith('2026-11-30'))).toBe(
      true,
    );

    expect(buildCatalog(new Date('2026-11-30T23:00:00.000Z'))).toHaveLength(0);
  });

  it('respeta los meses cortos y los años bisiestos', () => {
    const leap = buildCatalog(new Date('2028-02-28T00:00:00.000Z'));
    const days = new Set(leap.map((f) => f.departureAt.toISOString().slice(0, 10)));
    expect([...days]).toEqual(['2028-02-28', '2028-02-29']);
  });
});
