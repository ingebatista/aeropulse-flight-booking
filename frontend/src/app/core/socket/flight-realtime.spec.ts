import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { flightRoom, type FlightSnapshot, type JoinResult, type RoomName } from '@aeropulse/shared';
import { vi } from 'vitest';
import { ClientIdentity } from '../api/client-identity';
import { InventoryStore } from '../stores/inventory-store';
import { FlightRealtime } from './flight-realtime';
import { SOCKET_FACTORY, type SocketFactory, type SocketHandlers } from './socket-factory';

const flightA = 'd92a8037-1598-4b45-985f-84158129142f';
const flightB = 'd92a8037-1598-4b45-985f-84158129142e';
const clientId = '53d65dc2-9904-43fb-9699-60c553a9d774';
const serverNow = '2026-11-19T07:00:00.000Z';
const query = { origin: 'BOG', destination: 'MDE', date: '2026-11-19' } as const;
const url = '/api/flights?origin=BOG&destination=MDE&date=2026-11-19';

function snapshot(id: string, version: number): FlightSnapshot {
  return {
    flight: {
      id,
      flightNumber: 'AP101',
      origin: 'BOG',
      destination: 'MDE',
      departureAt: serverNow,
      arrivalAt: serverNow,
      fareCop: 180_000,
      status: 'SCHEDULED',
      soldOut: false,
      version,
    },
    seats: [{ flightId: id, seatCode: '1A', status: 'AVAILABLE', version }],
    myHold: null,
    serverNow,
  };
}

describe('FlightRealtime', () => {
  let sockets: {
    handlers: SocketHandlers;
    acks: Map<RoomName, (result: JoinResult) => void>;
    disconnect: ReturnType<typeof vi.fn>;
  }[];

  beforeEach(() => {
    sockets = [];
    const factory: SocketFactory = (auth, handlers) => {
      expect(auth.clientId).toBe(clientId);
      const acks = new Map<RoomName, (result: JoinResult) => void>();
      const disconnect = vi.fn();
      sockets.push({ handlers, acks, disconnect });
      return {
        connect: () => undefined,
        disconnect,
        join: (room, ack) => acks.set(room, ack),
      };
    };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SOCKET_FACTORY, useValue: factory },
        { provide: ClientIdentity, useValue: { id: clientId } },
      ],
    });
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    vi.useRealTimers();
  });

  it('emite join solo en connect y descarta reconocimientos del vuelo y de la conexión anteriores', () => {
    const realtime = TestBed.inject(FlightRealtime);
    const inventory = TestBed.inject(InventoryStore);
    const http = TestBed.inject(HttpTestingController);
    realtime.watch({ flightId: flightA, query });
    const a = sockets[0];
    expect(a.acks.size).toBe(0);
    a.handlers.connect();
    expect([...a.acks.keys()]).toEqual(['search', flightRoom(flightA)]);
    http.expectNone(url);

    realtime.watch({ flightId: flightB, query });
    expect(a.disconnect).toHaveBeenCalledOnce();
    const b = sockets[1];
    b.handlers.connect();
    a.acks.get('search')?.({ ok: true, data: { serverNow } });
    a.acks.get(flightRoom(flightA))?.({ ok: true, data: snapshot(flightA, 10) });
    http.expectNone(url);
    expect(inventory.forFlight(flightA).seats().size).toBe(0);

    b.acks.get('search')?.({ ok: true, data: { serverNow } });
    http.expectOne(url).flush({ flights: [] });
    realtime.watch({ flightId: flightB, query });
    expect(sockets).toHaveLength(2);
    b.handlers.events['seat.changed']({ ...snapshot(flightB, 3).seats[0], status: 'BOOKED' });
    const firstAck = b.acks.get(flightRoom(flightB))!;
    firstAck({ ok: true, data: snapshot(flightB, 2) });
    expect(inventory.forFlight(flightB).counts().BOOKED).toBe(1);
    expect(realtime.connection().status).toBe('connected');

    b.handlers.disconnect();
    expect(realtime.connection().status).toBe('offline');
    b.handlers.connect();
    firstAck({ ok: true, data: snapshot(flightB, 12) });
    b.acks.get(flightRoom(flightB))?.({ ok: true, data: snapshot(flightB, 4) });
    b.acks.get('search')?.({ ok: true, data: { serverNow } });
    http.expectOne(url).flush({ flights: [] });
    expect(inventory.forFlight(flightB).seats().get('1A')?.version).toBe(4);
    expect(realtime.connection().status).toBe('connected');
  });

  it('permite reintentar si falta el reconocimiento y descarta reconocimientos vencidos', () => {
    vi.useFakeTimers();
    const realtime = TestBed.inject(FlightRealtime);
    realtime.watch({});
    sockets[0].handlers.connect();
    vi.advanceTimersByTime(10_000);
    expect(realtime.connection()).toMatchObject({
      status: 'error',
      error: { code: 'JOIN_TIMEOUT' },
    });
    sockets[0].acks.get('search')?.({ ok: true, data: { serverNow } });
    expect(realtime.connection().status).toBe('error');

    realtime.retry();
    sockets[1].handlers.connect();
    sockets[1].acks.get('search')?.({ ok: true, data: { serverNow } });
    expect(realtime.connection().status).toBe('connected');
  });
});
