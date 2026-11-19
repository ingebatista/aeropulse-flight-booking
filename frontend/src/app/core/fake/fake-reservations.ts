import { DestroyRef, Injectable, inject } from '@angular/core';
import {
  BOOKING_CODE_ALPHABET,
  SEARCH_ROOM,
  TEST_CARDS,
  UUID_V4_PATTERN,
  flightRoom,
  type AdminFlightStatus,
  type ConfirmBookingRequest,
  type ErrorCode,
  type Flight,
  type FlightStatusEvent,
  type HoldResponse,
  type JoinResult,
  type OwnHold,
  type RoomName,
  type SearchFlightsQuery,
  type SearchFlightsResponse,
  type SeatEvent,
  type SeatStatus,
  type Ticket,
  type ValidationErrorField,
} from '@aeropulse/shared';
import { Subject } from 'rxjs';
import { ApiError } from '../api/api-error';
import { makeCatalog, seatCodes } from './fake-catalog';

const HOLD_MS = 300_000;

interface FakeSeat {
  public: SeatEvent;
  owner?: { clientId: string; hold: OwnHold };
}

interface FakeFlight {
  flight: Flight;
  seats: Map<string, FakeSeat>;
}

type FakeEvent =
  | { room: RoomName; name: 'seat.changed'; data: SeatEvent }
  | { room: RoomName; name: 'flight.status_changed'; data: FlightStatusEvent };

export class FakeError extends ApiError {
  constructor(
    override readonly code: ErrorCode,
    readonly fields?: ValidationErrorField[],
  ) {
    super(code);
  }
}

@Injectable({ providedIn: 'root' })
export class FakeReservations {
  private readonly catalog = new Map<string, FakeFlight>(
    makeCatalog(Date.now()).map((flight) => [
      flight.id,
      {
        flight,
        seats: new Map(
          seatCodes(flight).map((seatCode) => [
            seatCode,
            {
              public: {
                flightId: flight.id,
                seatCode,
                status: 'AVAILABLE',
                version: 1,
              } satisfies SeatEvent,
            },
          ]),
        ),
      } satisfies FakeFlight,
    ]),
  );
  private readonly bookings = new Map<string, Ticket>();
  private readonly purchases = new Map<string, { fingerprint: string; ticket: Ticket }>();
  private readonly broadcast = new Subject<FakeEvent>();
  private sweepTimer?: ReturnType<typeof setInterval>;
  readonly events = this.broadcast.asObservable();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      clearInterval(this.sweepTimer);
      this.broadcast.complete();
    });
  }

  search(query: SearchFlightsQuery): SearchFlightsResponse {
    const flights = [...this.catalog.values()]
      .map(({ flight }) => flight)
      .filter(
        (flight) =>
          flight.origin === query.origin &&
          flight.destination === query.destination &&
          flight.departureAt.startsWith(`${query.date}T`),
      )
      .sort((a, b) => a.departureAt.localeCompare(b.departureAt) || a.id.localeCompare(b.id));
    return { flights };
  }

  join(room: RoomName, clientId?: string): JoinResult {
    const now = Date.now();
    const serverNow = new Date(now).toISOString();
    if (room === SEARCH_ROOM) return { ok: true, data: { serverNow } };

    const id = room.startsWith('flight:') ? room.slice('flight:'.length) : '';
    const entry = this.catalog.get(id.toLowerCase());
    if (!UUID_V4_PATTERN.test(id) || !entry) {
      const error = new FakeError(
        UUID_V4_PATTERN.test(id) ? 'FLIGHT_NOT_FOUND' : 'VALIDATION_ERROR',
      );
      return { ok: false, error: { code: error.code, message: error.message } };
    }

    const own = this.ownSeat(entry, clientId, now);
    return {
      ok: true,
      data: {
        flight: entry.flight,
        seats: [...entry.seats.values()].map((seat) => seat.public),
        myHold: own?.owner?.hold ?? null,
        serverNow,
      },
    };
  }

  hold(
    flightId: string,
    seatCode: string,
    clientId: string,
  ): { status: 200 | 201; body: HoldResponse } {
    const entry = this.flight(flightId);
    const seat = this.seat(entry, seatCode);
    this.requireOperable(entry);
    const now = Date.now();
    const serverNow = new Date(now).toISOString();
    const owner = this.activeOwner(seat, now);
    if (owner?.clientId === clientId) {
      return { status: 200, body: { seat: seat.public, hold: owner.hold, serverNow } };
    }
    if (owner || seat.public.status === 'BOOKED') throw new FakeError('SEAT_UNAVAILABLE');

    const previous = this.ownSeat(entry, clientId, now);
    if (previous) this.changeSeat(previous, 'AVAILABLE');
    this.changeSeat(seat, 'HELD');
    const hold = {
      seatCode,
      holdToken: crypto.randomUUID(),
      holdExpiresAt: new Date(now + HOLD_MS).toISOString(),
      version: seat.public.version,
    };
    seat.owner = { clientId, hold };
    this.sweepTimer ??= setInterval(() => this.sweepExpired(), 1_000);
    if (previous) this.emitSeat(previous);
    this.emitSeat(seat);
    return { status: 201, body: { seat: seat.public, hold, serverNow } };
  }

  release(flightId: string, seatCode: string, clientId: string, holdToken: string): void {
    const seat = this.seat(this.flight(flightId), seatCode);
    const owner = this.activeOwner(seat, Date.now());
    if (!owner) return;
    if (owner.clientId !== clientId || owner.hold.holdToken !== holdToken) {
      throw new FakeError('HOLD_NOT_OWNED');
    }
    this.changeSeat(seat, 'AVAILABLE');
    this.emitSeat(seat);
  }

  confirm(
    request: ConfirmBookingRequest,
    clientId: string,
    key: string,
  ): { status: 200 | 201; body: Ticket } {
    const { flightId, seatCode, holdToken, passenger, payment } = request;
    const last4 = payment.cardNumber.slice(-4);
    const fingerprint = JSON.stringify([
      flightId,
      seatCode,
      clientId,
      holdToken,
      passenger.firstName,
      passenger.lastName,
      last4,
    ]);
    const replay = this.purchases.get(key);
    if (replay) {
      if (replay.fingerprint !== fingerprint) throw new FakeError('IDEMPOTENCY_KEY_REUSED');
      return { status: 200, body: replay.ticket };
    }

    const entry = this.flight(flightId);
    const seat = this.seat(entry, seatCode);
    this.requireOperable(entry);
    const now = Date.now();
    const owner = this.activeOwner(seat, now);
    if (owner?.clientId !== clientId || owner.hold.holdToken !== holdToken) {
      throw new FakeError('HOLD_INACTIVE');
    }
    if (last4 !== TEST_CARDS[0].cardNumber.slice(-4)) throw new FakeError('PAYMENT_DECLINED');

    const { id, flightNumber, origin, destination, departureAt, arrivalAt, fareCop } = entry.flight;
    const ticket: Ticket = {
      code: this.bookingCode(),
      flight: { id, flightNumber, origin, destination, departureAt, arrivalAt },
      seatCode,
      passenger,
      amountCop: fareCop,
      createdAt: new Date(now).toISOString(),
    };
    this.bookings.set(ticket.code, ticket);
    this.purchases.set(key, { fingerprint, ticket });
    this.changeSeat(seat, 'BOOKED');
    const soldOut = [...entry.seats.values()].every((item) => item.public.status === 'BOOKED');
    const event = soldOut ? this.changeFlight(entry, entry.flight.status, true) : null;
    this.emitSeat(seat);
    if (event) this.emitFlight(event);
    return { status: 201, body: ticket };
  }

  ticket(code: string, lastName: string): Ticket {
    const ticket = this.bookings.get(code);
    if (
      !ticket ||
      ticket.passenger.lastName.localeCompare(lastName, 'es', { sensitivity: 'accent' }) !== 0
    ) {
      throw new FakeError('BOOKING_NOT_FOUND');
    }
    return ticket;
  }

  changeStatus(flightId: string, status: AdminFlightStatus): FlightStatusEvent {
    const entry = this.flight(flightId);
    if (entry.flight.status === status) return this.flightEvent(entry);
    if (entry.flight.status === 'CANCELLED') throw new FakeError('INVALID_FLIGHT_TRANSITION');

    const event = this.changeFlight(entry, status, entry.flight.soldOut);
    this.emitFlight(event);
    return event;
  }

  private flight(flightId: string): FakeFlight {
    const entry = this.catalog.get(flightId);
    if (!entry) throw new FakeError('FLIGHT_NOT_FOUND');
    return entry;
  }

  private seat(entry: FakeFlight, seatCode: string): FakeSeat {
    const seat = entry.seats.get(seatCode);
    if (!seat) throw new FakeError('SEAT_NOT_FOUND');
    return seat;
  }

  private requireOperable(entry: FakeFlight): void {
    if (entry.flight.status === 'CANCELLED') throw new FakeError('FLIGHT_CANCELLED');
  }

  private activeOwner(seat: FakeSeat, now: number): FakeSeat['owner'] {
    return seat.owner && Date.parse(seat.owner.hold.holdExpiresAt) > now ? seat.owner : undefined;
  }

  private ownSeat(
    entry: FakeFlight,
    clientId: string | undefined,
    now: number,
  ): FakeSeat | undefined {
    if (!clientId) return undefined;
    return [...entry.seats.values()].find(
      (seat) => this.activeOwner(seat, now)?.clientId === clientId,
    );
  }

  private changeSeat(seat: FakeSeat, status: SeatStatus): void {
    seat.owner = undefined;
    seat.public = { ...seat.public, status, version: seat.public.version + 1 };
  }

  private changeFlight(
    entry: FakeFlight,
    status: Flight['status'],
    soldOut: boolean,
  ): FlightStatusEvent {
    entry.flight = { ...entry.flight, status, soldOut, version: entry.flight.version + 1 };
    return this.flightEvent(entry);
  }

  private flightEvent({ flight }: FakeFlight): FlightStatusEvent {
    return {
      flightId: flight.id,
      status: flight.status,
      soldOut: flight.soldOut,
      version: flight.version,
    };
  }

  private emitSeat(seat: FakeSeat): void {
    this.broadcast.next({
      room: flightRoom(seat.public.flightId),
      name: 'seat.changed',
      data: seat.public,
    });
  }

  private emitFlight(event: FlightStatusEvent): void {
    this.broadcast.next({ room: SEARCH_ROOM, name: 'flight.status_changed', data: event });
  }

  private sweepExpired(): void {
    const now = Date.now();
    let hasHolds = false;
    for (const entry of this.catalog.values()) {
      for (const seat of entry.seats.values()) {
        if (!seat.owner) continue;
        if (this.activeOwner(seat, now)) {
          hasHolds = true;
        } else {
          this.changeSeat(seat, 'AVAILABLE');
          this.emitSeat(seat);
        }
      }
    }
    if (!hasHolds) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = undefined;
    }
  }

  private bookingCode(): string {
    let value = this.bookings.size;
    let code = '';
    for (let i = 0; i < 6; i++) {
      code = BOOKING_CODE_ALPHABET[value % BOOKING_CODE_ALPHABET.length] + code;
      value = Math.floor(value / BOOKING_CODE_ALPHABET.length);
    }
    return code;
  }
}
