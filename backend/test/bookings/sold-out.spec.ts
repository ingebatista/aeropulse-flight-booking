import type {
  ClientToServerEvents,
  FlightStatusEvent,
  JoinResult,
  ServerToClientEvents,
} from '@aeropulse/shared';
import { io, type Socket } from 'socket.io-client';
import {
  confirmBooking,
  holdFor,
  type SeededDatabase,
  startApi,
  startSeededDatabase,
  type TestApi,
} from '../support/api';

interface FlightRow {
  sold_out: boolean;
  status: string;
  version: number;
}

describe('agotado sin carrera', () => {
  let seeded: SeededDatabase;
  let api: TestApi;
  let socket: Socket<ServerToClientEvents, ClientToServerEvents>;

  beforeAll(async () => {
    seeded = await startSeededDatabase();
    api = await startApi(seeded);
  });

  afterAll(async () => {
    socket?.disconnect();
    await api?.close();
    await seeded?.stop();
  });

  async function readFlight(flightId: string): Promise<FlightRow> {
    const rows: FlightRow[] = await seeded.owner.query(
      'SELECT sold_out, status, version FROM flights WHERE id = $1',
      [flightId],
    );
    return rows[0];
  }

  it('dos confirmaciones simultáneas de los dos últimos asientos marcan soldOut una sola vez', async () => {
    const [flightId] = seeded.demoFlightIds;

    // 4 de los 6 asientos ya reservados, uno a uno: el vuelo no se agota todavía.
    for (const seatCode of ['1A', '1B', '1C', '2A']) {
      const result = await confirmBooking(api, await holdFor(api, flightId, seatCode));
      expect(result.status).toBe(201);
    }
    expect(await readFlight(flightId)).toEqual({
      sold_out: false,
      status: 'SCHEDULED',
      version: 1,
    });

    // Un cliente en la sala `search` recibe el cambio sin recargar.
    socket = io(api.baseUrl, { path: '/ws', transports: ['websocket'], reconnection: false });
    await new Promise<void>((resolve) => socket.once('connect', resolve));
    const joined: JoinResult = await socket.timeout(5_000).emitWithAck('join', 'search');
    expect(joined.ok).toBe(true);
    const received: FlightStatusEvent[] = [];
    socket.on('flight.status_changed', (event) => received.push(event));

    const holds = [await holdFor(api, flightId, '2B'), await holdFor(api, flightId, '2C')];
    api.clearEvents();

    const results = await Promise.all(holds.map((hold) => confirmBooking(api, hold)));

    expect(results.map((r) => r.status)).toEqual([201, 201]);
    // El FOR UPDATE del vuelo serializa el conteo: solo la última confirmación lo agota.
    expect(await readFlight(flightId)).toEqual({ sold_out: true, status: 'SCHEDULED', version: 2 });

    const expected: FlightStatusEvent = {
      flightId,
      status: 'SCHEDULED',
      soldOut: true,
      version: 2,
    };
    const flightEvents = api.events.filter((e) => e.type === 'flight.status_changed');
    expect(flightEvents.map((e) => e.payload)).toEqual([expected]);
    expect(api.seatEvents(flightId).map((e) => e.status)).toEqual(['BOOKED', 'BOOKED']);

    await new Promise((r) => setTimeout(r, 200));
    expect(received).toEqual([expected]);
  });
});
