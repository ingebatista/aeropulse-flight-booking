import { TestBed } from '@angular/core/testing';
import { type Flight, type FlightSnapshot, type SeatEvent } from '@aeropulse/shared';
import { FlightsStore } from './flights-store';
import { InventoryStore } from './inventory-store';

const flight: Flight = {
  id: 'd92a8037-1598-4b45-985f-84158129142f',
  flightNumber: 'AP101',
  origin: 'BOG',
  destination: 'MDE',
  departureAt: '2026-11-19T14:00:00.000Z',
  arrivalAt: '2026-11-19T15:00:00.000Z',
  fareCop: 180_000,
  status: 'SCHEDULED',
  soldOut: false,
  version: 1,
};

const seat: SeatEvent = { flightId: flight.id, seatCode: '1A', status: 'AVAILABLE', version: 1 };
const initial: FlightSnapshot = {
  flight,
  seats: [seat],
  myHold: null,
  serverNow: flight.departureAt,
};
const hold = { seatCode: '1A', holdToken: 'token', holdExpiresAt: flight.arrivalAt, version: 2 };
const held: SeatEvent = { ...seat, status: 'HELD', version: 2 };

describe('Almacenes de vuelos e inventario', () => {
  it('completa el catálogo solo para las filas buscadas y conserva el estado operativo más reciente', () => {
    const flights = TestBed.inject(FlightsStore);
    flights.applyStatus({ flightId: flight.id, status: 'DELAYED', soldOut: true, version: 5 });
    flights.applyStatus({ flightId: flight.id, status: 'CANCELLED', soldOut: false, version: 5 });
    flights.applyStatus({ flightId: flight.id, status: 'SCHEDULED', soldOut: false, version: 4 });
    flights.applyFlight({ ...flight, id: 'otro-vuelo' });
    expect(flights.results()).toEqual([]);

    flights.applySearch([flight]);
    expect(flights.results()).toEqual([
      { ...flight, status: 'DELAYED', soldOut: true, version: 5 },
    ]);

    flights.applySearch([]);
    expect(flights.results()).toEqual([]);
    expect(flights.flight(flight.id)?.version).toBe(5);
  });

  it('comparte el inventario y cuenta los estados aunque el evento llegue antes de la instantánea', () => {
    const inventories = TestBed.inject(InventoryStore);
    const inventory = inventories.forFlight(flight.id);
    expect(inventories.forFlight(flight.id.toUpperCase())).toBe(inventory);
    inventory.applySeat(held);
    inventory.applySnapshot(initial);
    inventory.applySeat({ ...seat, version: held.version });
    inventory.applySeat({ ...seat, flightId: 'otro-vuelo', version: 99 });
    expect(inventory.counts()).toEqual({ AVAILABLE: 0, HELD: 1, BOOKED: 0 });

    inventory.applySeat({ ...seat, status: 'BOOKED', version: 3 });
    expect(inventory.counts()).toEqual({ AVAILABLE: 0, HELD: 0, BOOKED: 1 });
    inventory.applySeat({ ...seat, version: 4 });
    expect(inventory.counts()).toEqual({ AVAILABLE: 1, HELD: 0, BOOKED: 0 });
  });

  it('recupera la titularidad para la versión vigente y descarta un bloqueo sustituido', () => {
    const inventory = TestBed.inject(InventoryStore).forFlight(flight.id);
    inventory.applySeat(held);
    inventory.applySnapshot({ ...initial, seats: [held], myHold: hold });
    expect(inventory.myHold()).toEqual(hold);

    inventory.applySeat({ ...held, version: 3 });
    inventory.applyHold({ seat: held, hold, serverNow: initial.serverNow });
    expect(inventory.myHold()).toBeNull();
    expect(inventory.seats().get('1A')?.version).toBe(3);
  });

  it('conserva el bloqueo frente a un null atrasado y lo limpia con una instantánea de la misma versión', () => {
    const inventory = TestBed.inject(InventoryStore).forFlight(flight.id);
    inventory.applyHold({ seat: held, hold, serverNow: initial.serverNow });
    inventory.clearHold('otro-token');
    inventory.applySnapshot(initial);
    expect(inventory.myHold()).toEqual(hold);

    inventory.applySnapshot({ ...initial, seats: [held] });
    expect(inventory.myHold()).toBeNull();
    expect(inventory.counts().HELD).toBe(1);
  });
});
