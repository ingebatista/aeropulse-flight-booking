import { Injectable, computed, inject, signal } from '@angular/core';
import {
  type FlightSnapshot,
  type HoldResponse,
  type OwnHold,
  type SeatEvent,
  type SeatStatus,
} from '@aeropulse/shared';
import { FlightsStore } from './flights-store';

interface Inventory {
  seats: ReadonlyMap<string, SeatEvent>;
  hold: OwnHold | null;
  clock: { serverNow: string; sampledAt: number } | null;
  initialized: boolean;
}

export class FlightInventory {
  private readonly state = signal<Inventory>({
    seats: new Map(),
    hold: null,
    clock: null,
    initialized: false,
  });
  private announcedExpiry: string | null = null;
  readonly seats = computed(() => this.state().seats);
  readonly myHold = computed(() => this.state().hold);
  readonly clock = computed(() => this.state().clock);
  readonly initialized = computed(() => this.state().initialized);
  readonly flight = computed(() => this.flights.flight(this.flightId));
  readonly counts = computed(() => {
    const counts: Record<SeatStatus, number> = { AVAILABLE: 0, HELD: 0, BOOKED: 0 };
    for (const seat of this.seats().values()) counts[seat.status]++;
    return counts;
  });

  constructor(
    readonly flightId: string,
    private readonly flights: FlightsStore,
  ) {}

  applySeat(seat: SeatEvent): void {
    if (seat.flightId !== this.flightId) return;
    this.state.update((state) => this.mergeSeats(state, [seat]));
  }

  applySnapshot(snapshot: FlightSnapshot): void {
    if (snapshot.flight.id !== this.flightId) return;
    this.flights.applyFlight(snapshot.flight);
    this.state.update((state) => {
      const next = { ...this.mergeSeats(state, snapshot.seats), initialized: true };
      if (snapshot.myHold) return this.mergeHold(next, snapshot.myHold, snapshot.serverNow);

      const hold = next.hold;
      const clearsHold =
        hold &&
        snapshot.seats.some(
          (seat) =>
            seat.flightId === this.flightId &&
            seat.seatCode === hold.seatCode &&
            seat.version >= hold.version,
        );
      return {
        ...next,
        hold: clearsHold ? null : next.hold,
        clock: this.sampleClock(next, snapshot.serverNow),
      };
    });
  }

  applyHold(response: HoldResponse): void {
    if (response.seat.flightId !== this.flightId) return;
    this.state.update((state) =>
      this.mergeHold(this.mergeSeats(state, [response.seat]), response.hold, response.serverNow),
    );
  }

  clearHold(holdToken: string): void {
    this.state.update((state) =>
      state.hold?.holdToken === holdToken.toLowerCase() ? { ...state, hold: null } : state,
    );
  }

  markExpiryAnnounced(holdToken: string): boolean {
    if (this.announcedExpiry === holdToken) return false;
    this.announcedExpiry = holdToken;
    return true;
  }

  private mergeSeats(state: Inventory, incoming: readonly SeatEvent[]): Inventory {
    let seats: Map<string, SeatEvent> | undefined;
    let hold = state.hold;
    for (const seat of incoming) {
      const current = (seats ?? state.seats).get(seat.seatCode);
      if (seat.flightId !== this.flightId || (current && seat.version <= current.version)) continue;

      seats ??= new Map(state.seats);
      seats.set(seat.seatCode, seat);
      if (hold?.seatCode === seat.seatCode && seat.version > hold.version) hold = null;
    }
    return seats ? { ...state, seats, hold } : state;
  }

  private mergeHold(state: Inventory, hold: OwnHold, serverNow: string): Inventory {
    const seat = state.seats.get(hold.seatCode);
    const clock = this.sampleClock(state, serverNow);
    const applies =
      seat?.status === 'HELD' &&
      seat.version === hold.version &&
      Date.parse(hold.holdExpiresAt) > Date.parse(clock.serverNow);
    return { ...state, hold: applies ? hold : state.hold, clock };
  }

  private sampleClock(state: Inventory, serverNow: string): NonNullable<Inventory['clock']> {
    if (state.clock && Date.parse(state.clock.serverNow) >= Date.parse(serverNow))
      return state.clock;
    return { serverNow, sampledAt: performance.now() };
  }
}

@Injectable({ providedIn: 'root' })
export class InventoryStore {
  private readonly flights = inject(FlightsStore);
  private readonly inventories = new Map<string, FlightInventory>();

  forFlight(flightId: string): FlightInventory {
    const id = flightId.toLowerCase();
    const existing = this.inventories.get(id);
    if (existing) return existing;

    const inventory = new FlightInventory(id, this.flights);
    this.inventories.set(id, inventory);
    return inventory;
  }
}
