import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import {
  SEARCH_ROOM,
  flightRoom,
  isFlightSnapshot,
  type RoomName,
  type SearchFlightsQuery,
} from '@aeropulse/shared';
import { type Subscription } from 'rxjs';
import { ApiError } from '../api/api-error';
import { ClientIdentity } from '../api/client-identity';
import { ReservationApi } from '../api/reservation-api';
import { FlightsStore } from '../stores/flights-store';
import { InventoryStore } from '../stores/inventory-store';
import { SOCKET_FACTORY, type RealtimeConnection } from './socket-factory';

type ConnectionState =
  { status: 'idle' | 'loading' | 'connected' | 'offline' } | { status: 'error'; error: ApiError };

type SearchState = { status: 'idle' | 'loading' | 'ready' } | { status: 'error'; error: ApiError };

interface Watch {
  flightId?: string;
  query?: SearchFlightsQuery;
}

const JOIN_TIMEOUT_MS = 10_000;

@Injectable({ providedIn: 'root' })
export class FlightRealtime {
  private readonly factory = inject(SOCKET_FACTORY);
  private readonly identity = inject(ClientIdentity);
  private readonly api = inject(ReservationApi);
  private readonly flights = inject(FlightsStore);
  private readonly inventory = inject(InventoryStore);
  private readonly document = inject(DOCUMENT);
  private readonly connectionState = signal<ConnectionState>({ status: 'idle' });
  private readonly searchState = signal<SearchState>({ status: 'idle' });
  readonly connection = this.connectionState.asReadonly();
  readonly search = this.searchState.asReadonly();

  private watchOptions: Watch | null = null;
  private socket?: RealtimeConnection;
  private joinTimer?: ReturnType<typeof setTimeout>;
  private searchRequest?: Subscription;
  private searchJoined = false;
  private cycle = 0;

  constructor() {
    const onVisibility = () => {
      if (this.document.visibilityState === 'visible') this.retry();
    };
    this.document.addEventListener('visibilitychange', onVisibility);
    inject(DestroyRef).onDestroy(() => {
      this.document.removeEventListener('visibilitychange', onVisibility);
      this.stop();
    });
  }

  watch({ flightId, query }: Watch): void {
    const id = flightId?.toLowerCase();
    const previous = this.watchOptions;
    const queryChanged =
      previous?.query?.origin !== query?.origin ||
      previous?.query?.destination !== query?.destination ||
      previous?.query?.date !== query?.date;
    this.watchOptions = { flightId: id, query };
    if (queryChanged) {
      this.searchRequest?.unsubscribe();
      this.flights.clearSearch();
      this.searchState.set({ status: query ? 'loading' : 'idle' });
    }
    if (!previous || id !== previous.flightId) {
      this.retry();
    } else if (queryChanged && this.searchJoined) {
      this.runSearch();
    }
  }

  retry(): void {
    if (!this.watchOptions) return;
    this.close();
    this.connectionState.set({ status: 'loading' });
    const { flightId } = this.watchOptions;
    const rooms: RoomName[] = flightId ? [SEARCH_ROOM, flightRoom(flightId)] : [SEARCH_ROOM];
    const socket = this.factory(
      { clientId: this.identity.id },
      {
        connect: () => {
          if (this.socket === socket) this.join(socket, rooms);
        },
        disconnect: () => {
          if (this.socket !== socket) return;
          this.invalidate();
          this.connectionState.set({ status: 'offline' });
        },
        error: (error) => {
          if (this.socket !== socket) return;
          this.invalidate();
          this.connectionState.set(
            error.code === 'NETWORK_ERROR' ? { status: 'offline' } : { status: 'error', error },
          );
        },
        events: {
          'seat.changed': (seat) => {
            if (this.socket === socket && flightId === seat.flightId)
              this.inventory.forFlight(flightId).applySeat(seat);
          },
          'flight.status_changed': (event) => {
            if (this.socket === socket) this.flights.applyStatus(event);
          },
        },
      },
    );
    this.socket = socket;
    socket.connect();
  }

  retrySearch(): void {
    if (this.searchJoined) {
      this.runSearch();
    } else {
      this.retry();
    }
  }

  stop(): void {
    this.watchOptions = null;
    this.close();
    this.connectionState.set({ status: 'idle' });
    this.searchState.set({ status: 'idle' });
    this.flights.clearSearch();
  }

  private join(socket: RealtimeConnection, rooms: readonly RoomName[]): void {
    this.invalidate();
    const cycle = this.cycle;
    this.connectionState.set({ status: 'loading' });
    const pending = new Set(rooms);
    const fail = (error: ApiError) => {
      this.invalidate();
      this.connectionState.set({ status: 'error', error });
    };
    this.joinTimer = setTimeout(() => fail(new ApiError('JOIN_TIMEOUT')), JOIN_TIMEOUT_MS);
    for (const room of rooms) {
      if (this.cycle !== cycle) break;
      socket.join(room, (result) => {
        if (this.socket !== socket || this.cycle !== cycle || !pending.delete(room)) return;
        if (!result.ok) {
          fail(new ApiError(result.error.code));
          return;
        }
        const snapshot = result.data;
        if (room === SEARCH_ROOM && !isFlightSnapshot(snapshot)) {
          this.searchJoined = true;
          this.runSearch();
        } else if (isFlightSnapshot(snapshot) && room === flightRoom(snapshot.flight.id)) {
          this.inventory.forFlight(snapshot.flight.id).applySnapshot(snapshot);
        } else {
          fail(new ApiError('INTERNAL_ERROR'));
          return;
        }
        if (pending.size === 0) {
          clearTimeout(this.joinTimer);
          this.connectionState.set({ status: 'connected' });
        }
      });
    }
  }

  private runSearch(): void {
    this.searchRequest?.unsubscribe();
    const query = this.watchOptions?.query;
    if (!query) return;
    this.searchState.set({ status: 'loading' });
    this.searchRequest = this.api.search(query).subscribe({
      next: ({ flights }) => {
        this.flights.applySearch(flights);
        this.searchState.set({ status: 'ready' });
      },
      error: (error: ApiError) => this.searchState.set({ status: 'error', error }),
    });
  }

  private close(): void {
    this.invalidate();
    const socket = this.socket;
    this.socket = undefined;
    socket?.disconnect();
  }

  private invalidate(): void {
    this.cycle++;
    clearTimeout(this.joinTimer);
    this.searchJoined = false;
    this.searchRequest?.unsubscribe();
  }
}
