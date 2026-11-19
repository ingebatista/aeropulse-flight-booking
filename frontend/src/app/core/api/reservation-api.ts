import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  CLIENT_ID_HEADER,
  HOLD_TOKEN_HEADER,
  IDEMPOTENCY_KEY_HEADER,
  type ChangeFlightStatusRequest,
  type ConfirmBookingRequest,
  type FlightStatusEvent,
  type HoldResponse,
  type SearchFlightsQuery,
  type SearchFlightsResponse,
  type Ticket,
} from '@aeropulse/shared';
import { catchError, tap, throwError, type Observable } from 'rxjs';
import { FlightsStore } from '../stores/flights-store';
import { InventoryStore } from '../stores/inventory-store';
import { ApiError } from './api-error';
import { ClientIdentity } from './client-identity';

@Injectable({ providedIn: 'root' })
export class ReservationApi {
  private readonly http = inject(HttpClient);
  private readonly identity = inject(ClientIdentity);
  private readonly inventories = inject(InventoryStore);
  private readonly flights = inject(FlightsStore);

  search({ origin, destination, date }: SearchFlightsQuery): Observable<SearchFlightsResponse> {
    return this.translate(
      this.http.get<SearchFlightsResponse>('/api/flights', {
        params: { origin, destination, date },
      }),
    );
  }

  hold(flightId: string, seatCode: string): Observable<HoldResponse> {
    return this.translate(
      this.http.post<HoldResponse>(this.holdUrl(flightId, seatCode), null, {
        headers: { [CLIENT_ID_HEADER]: this.identity.id },
      }),
    ).pipe(tap((response) => this.inventories.forFlight(flightId).applyHold(response)));
  }

  release(flightId: string, seatCode: string, holdToken: string): Observable<void> {
    return this.translate(
      this.http.delete<void>(this.holdUrl(flightId, seatCode), {
        headers: { [CLIENT_ID_HEADER]: this.identity.id, [HOLD_TOKEN_HEADER]: holdToken },
      }),
    ).pipe(tap(() => this.inventories.forFlight(flightId).clearHold(holdToken)));
  }

  confirm(request: ConfirmBookingRequest, idempotencyKey: string): Observable<Ticket> {
    return this.translate(
      this.http.post<Ticket>('/api/bookings/confirm', request, {
        headers: { [CLIENT_ID_HEADER]: this.identity.id, [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
      }),
    ).pipe(
      tap({
        next: () => this.inventories.forFlight(request.flightId).clearHold(request.holdToken),
        error: (error: ApiError) => {
          if (error.code === 'HOLD_INACTIVE') {
            this.inventories.forFlight(request.flightId).clearHold(request.holdToken);
          }
        },
      }),
    );
  }

  ticket(code: string, lastName: string): Observable<Ticket> {
    return this.translate(
      this.http.get<Ticket>(`/api/bookings/${encodeURIComponent(code)}`, {
        params: { lastName },
      }),
    );
  }

  changeFlightStatus(
    flightId: string,
    request: ChangeFlightStatusRequest,
    adminToken: string,
  ): Observable<FlightStatusEvent> {
    return this.translate(
      this.http.patch<FlightStatusEvent>(
        `/api/admin/flights/${encodeURIComponent(flightId)}/status`,
        request,
        { headers: { Authorization: `Bearer ${adminToken}` } },
      ),
    ).pipe(tap((event) => this.flights.applyStatus(event)));
  }

  private holdUrl(flightId: string, seatCode: string): string {
    return `/api/flights/${encodeURIComponent(flightId)}/seats/${encodeURIComponent(seatCode)}/hold`;
  }

  private translate<T>(response: Observable<T>): Observable<T> {
    return response.pipe(
      catchError((error: unknown) => throwError(() => ApiError.fromHttp(error))),
    );
  }
}
