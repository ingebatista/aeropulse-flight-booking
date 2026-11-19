import type { AirportCode } from '@aeropulse/shared';

/** Horario fijo del catálogo. El número de vuelo se reutiliza en cada fecha. */
export interface Schedule {
  flightNumber: string;
  origin: AirportCode;
  destination: AirportCode;
  /** Hora de salida en UTC, `HH:MM`. */
  departureUtc: string;
  durationMinutes: number;
  fareCop: number;
  seatRows: number;
  seatLetters: string;
}

/** Vuelo concreto que el seed debe garantizar. */
export interface CatalogFlight {
  flightNumber: string;
  origin: AirportCode;
  destination: AirportCode;
  departureAt: Date;
  arrivalAt: Date;
  fareCop: number;
  seatCodes: string[];
}

const STANDARD = { seatRows: 6, seatLetters: 'ABCD' } as const;

/** Número del vuelo de demostración: tercer horario de `BOG → MDE`, con 6 asientos. */
export const DEMO_FLIGHT_NUMBER = 'AP105';

/** Catálogo cerrado: 6 rutas, de 1 a 3 horarios por ruta y día, todo en UTC. */
export const SCHEDULES: readonly Schedule[] = [
  {
    flightNumber: 'AP101',
    origin: 'BOG',
    destination: 'MDE',
    departureUtc: '11:00',
    durationMinutes: 60,
    fareCop: 289_000,
    ...STANDARD,
  },
  {
    flightNumber: 'AP103',
    origin: 'BOG',
    destination: 'MDE',
    departureUtc: '16:30',
    durationMinutes: 60,
    fareCop: 289_000,
    ...STANDARD,
  },
  {
    flightNumber: DEMO_FLIGHT_NUMBER,
    origin: 'BOG',
    destination: 'MDE',
    departureUtc: '22:30',
    durationMinutes: 60,
    fareCop: 199_000,
    seatRows: 2,
    seatLetters: 'ABC',
  },
  {
    flightNumber: 'AP102',
    origin: 'MDE',
    destination: 'BOG',
    departureUtc: '12:30',
    durationMinutes: 60,
    fareCop: 289_000,
    ...STANDARD,
  },
  {
    flightNumber: 'AP104',
    origin: 'MDE',
    destination: 'BOG',
    departureUtc: '20:00',
    durationMinutes: 60,
    fareCop: 289_000,
    ...STANDARD,
  },
  {
    flightNumber: 'AP201',
    origin: 'BOG',
    destination: 'BAQ',
    departureUtc: '13:00',
    durationMinutes: 95,
    fareCop: 349_000,
    ...STANDARD,
  },
  {
    flightNumber: 'AP203',
    origin: 'BOG',
    destination: 'BAQ',
    departureUtc: '21:00',
    durationMinutes: 95,
    fareCop: 349_000,
    ...STANDARD,
  },
  {
    flightNumber: 'AP202',
    origin: 'BAQ',
    destination: 'BOG',
    departureUtc: '15:30',
    durationMinutes: 95,
    fareCop: 349_000,
    ...STANDARD,
  },
  {
    flightNumber: 'AP301',
    origin: 'MDE',
    destination: 'BAQ',
    departureUtc: '14:00',
    durationMinutes: 85,
    fareCop: 319_000,
    ...STANDARD,
  },
  {
    flightNumber: 'AP302',
    origin: 'BAQ',
    destination: 'MDE',
    departureUtc: '18:30',
    durationMinutes: 85,
    fareCop: 319_000,
    ...STANDARD,
  },
];

const MINUTE_MS = 60_000;

export function seatCodes(rows: number, letters: string): string[] {
  const codes: string[] = [];
  for (let row = 1; row <= rows; row++) {
    for (const letter of letters) codes.push(`${row}${letter}`);
  }
  return codes;
}

/**
 * Vuelos desde el día UTC de `now` hasta el último día de ese mes UTC, ambos
 * inclusive, con salida estrictamente posterior a `now`. Es una función pura:
 * `now` lo aporta quien llama (el seed usa el reloj de PostgreSQL).
 */
export function buildCatalog(now: Date): CatalogFlight[] {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const firstDay = now.getUTCDate();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  const flights: CatalogFlight[] = [];
  for (let day = firstDay; day <= lastDay; day++) {
    const midnight = Date.UTC(year, month, day);
    for (const schedule of SCHEDULES) {
      const [hours, minutes] = schedule.departureUtc.split(':').map(Number);
      const departureMs = midnight + (hours * 60 + minutes) * MINUTE_MS;
      if (departureMs <= now.getTime()) continue;

      flights.push({
        flightNumber: schedule.flightNumber,
        origin: schedule.origin,
        destination: schedule.destination,
        departureAt: new Date(departureMs),
        arrivalAt: new Date(departureMs + schedule.durationMinutes * MINUTE_MS),
        fareCop: schedule.fareCop,
        seatCodes: seatCodes(schedule.seatRows, schedule.seatLetters),
      });
    }
  }
  return flights;
}
