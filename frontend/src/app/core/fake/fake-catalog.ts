import { AIRPORT_CODES, type Flight } from '@aeropulse/shared';

const DAY_MS = 86_400_000;

export function makeCatalog(now: number): Flight[] {
  const current = new Date(now);
  const year = current.getUTCFullYear();
  const month = current.getUTCMonth();
  const monthEnd = Date.UTC(year, month + 1, 1);
  const flights: Flight[] = [];

  for (let day = Date.UTC(year, month, current.getUTCDate()); day < monthEnd; day += DAY_MS) {
    for (const origin of AIRPORT_CODES) {
      for (const destination of AIRPORT_CODES) {
        if (origin === destination) continue;
        const hours = origin === 'BOG' && destination === 'MDE' ? [8, 14, 23] : [16];
        hours.forEach((hour, index) => {
          const departure = day + hour * 3_600_000;
          if (departure <= now) return;

          flights.push({
            // El mismo vuelo simulado conserva su enlace al recargar la página.
            id: `00000000-${AIRPORT_CODES.indexOf(origin)}${AIRPORT_CODES.indexOf(destination)}${index}0-4000-8000-${departure.toString(16).padStart(12, '0')}`,
            flightNumber: `AP${100 + AIRPORT_CODES.indexOf(origin)}${AIRPORT_CODES.indexOf(destination)}${index + 1}`,
            origin,
            destination,
            departureAt: new Date(departure).toISOString(),
            arrivalAt: new Date(departure + 3_600_000).toISOString(),
            fareCop: 180_000 + index * 30_000,
            status: 'SCHEDULED',
            soldOut: false,
            version: 1,
          });
        });
      }
    }
  }
  return flights;
}

export function seatCodes(flight: Flight): string[] {
  const demo =
    flight.origin === 'BOG' &&
    flight.destination === 'MDE' &&
    flight.departureAt.slice(11, 13) === '23';
  const letters = demo ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D'];
  return Array.from({ length: demo ? 2 : 6 }, (_, row) =>
    letters.map((letter) => `${row + 1}${letter}`),
  ).flat();
}
