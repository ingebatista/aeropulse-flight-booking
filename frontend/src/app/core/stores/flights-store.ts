import { Injectable, computed, signal } from '@angular/core';
import { type Flight, type FlightStatusEvent } from '@aeropulse/shared';

@Injectable({ providedIn: 'root' })
export class FlightsStore {
  private readonly catalog = signal<ReadonlyMap<string, Flight>>(new Map());
  private readonly statuses = signal<ReadonlyMap<string, FlightStatusEvent>>(new Map());
  private readonly searchIds = signal<readonly string[]>([]);
  readonly results = computed(() =>
    this.searchIds().flatMap((id) => {
      const flight = this.flight(id);
      return flight ? [flight] : [];
    }),
  );

  flight(id: string): Flight | undefined {
    const flight = this.catalog().get(id);
    if (!flight) return undefined;

    const latest = this.statuses().get(id);
    return latest
      ? { ...flight, status: latest.status, soldOut: latest.soldOut, version: latest.version }
      : flight;
  }

  applySearch(flights: readonly Flight[]): void {
    for (const flight of flights) this.applyFlight(flight);
    this.searchIds.set(flights.map(({ id }) => id));
  }

  clearSearch(): void {
    this.searchIds.set([]);
  }

  applyFlight(flight: Flight): void {
    this.applyStatus({
      flightId: flight.id,
      status: flight.status,
      soldOut: flight.soldOut,
      version: flight.version,
    });
    const current = this.catalog().get(flight.id);
    if (!current || flight.version > current.version) {
      this.catalog.update((catalog) => new Map(catalog).set(flight.id, flight));
    }
  }

  applyStatus(event: FlightStatusEvent): void {
    const current = this.statuses().get(event.flightId);
    if (!current || event.version > current.version) {
      this.statuses.update((statuses) => new Map(statuses).set(event.flightId, event));
    }
  }
}
