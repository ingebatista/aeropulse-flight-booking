import { DOCUMENT, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { type AdminFlightStatus, type Flight } from '@aeropulse/shared';
import { type ApiError } from '../../core/api/api-error';
import { ReservationApi } from '../../core/api/reservation-api';
import { FlightRealtime } from '../../core/socket/flight-realtime';
import { FlightsStore } from '../../core/stores/flights-store';
import { FlightSearchComponent } from '../search/flight-search.component';
import { AdminSession } from './admin-session';

interface Cancellation {
  flight: Flight;
  origin: HTMLButtonElement;
}

@Component({
  selector: 'app-admin-flights',
  imports: [DatePipe, FlightSearchComponent, RouterLink],
  templateUrl: './admin-flights.component.html',
  styleUrl: './admin-flights.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminFlightsComponent {
  private readonly api = inject(ReservationApi);
  private readonly flights = inject(FlightsStore);
  private readonly realtime = inject(FlightRealtime);
  private readonly session = inject(AdminSession);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);
  private readonly destroy = inject(DestroyRef);
  protected readonly pending = signal(false);
  protected readonly success = signal('');
  protected readonly error = signal('');
  protected readonly cancellation = signal<Cancellation | null>(null);
  protected readonly results = this.flights.results;
  protected readonly selectedId = linkedSignal<readonly Flight[], string | null>({
    source: this.results,
    computation: (flights, previous) =>
      flights.find(({ id }) => id === previous?.value)?.id ?? flights[0]?.id ?? null,
  });
  protected readonly selectedFlight = computed(() =>
    this.results().find(({ id }) => id === this.selectedId()),
  );
  protected readonly statusLabels = {
    SCHEDULED: 'Programado',
    DELAYED: 'Retrasado',
    CANCELLED: 'Cancelado',
  };

  protected logout(error = ''): void {
    this.session.end(error);
    void this.router.navigateByUrl('/admin/acceso', { replaceUrl: true });
  }

  protected askCancellation(
    flight: Flight,
    origin: HTMLButtonElement,
    dialog: HTMLDialogElement,
  ): void {
    if (this.pending() || this.cancellation() || dialog.open) return;
    this.cancellation.set({ flight, origin });
    afterNextRender(() => dialog.showModal(), { injector: this.injector });
  }

  protected closeDialog(): void {
    const selection = this.cancellation();
    this.cancellation.set(null);
    if (selection) this.restoreActionFocus(selection.flight.id, selection.origin);
  }

  protected confirmCancellation(dialog: HTMLDialogElement): void {
    const selection = this.cancellation();
    dialog.close();
    if (selection) this.change(selection.flight, 'CANCELLED', selection.origin);
  }

  protected change(flight: Flight, status: AdminFlightStatus, origin: HTMLButtonElement): void {
    const token = this.session.token;
    if (!token || this.pending()) return;
    const current = this.flights.flight(flight.id);
    if (!current || current.status === 'CANCELLED' || current.status === status) {
      this.error.set('El estado del vuelo cambió. Revisa el listado.');
      this.realtime.retrySearch();
      return;
    }

    const restoreFocus = this.document.activeElement === origin;
    this.error.set('');
    this.success.set('');
    this.pending.set(true);
    this.api
      .changeFlightStatus(current.id, { status }, token)
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: () => {
          this.pending.set(false);
          this.success.set(`Se actualizó el estado del vuelo ${current.flightNumber}.`);
          if (restoreFocus) {
            afterNextRender(
              () => {
                if (!origin.isConnected && this.document.activeElement === this.document.body) {
                  this.restoreActionFocus(current.id, origin);
                }
              },
              { injector: this.injector },
            );
          }
        },
        error: (error: ApiError) => {
          this.pending.set(false);
          this.handleError(error);
        },
      });
  }

  private restoreActionFocus(flightId: string, origin: HTMLButtonElement): void {
    const target =
      origin.isConnected && this.selectedId() === flightId
        ? origin
        : this.document.getElementById(`admin-flight-${flightId}`);
    (target ?? this.document.getElementById('results-title'))?.focus();
  }

  private handleError(error: ApiError): void {
    if (error.code === 'UNAUTHORIZED') {
      this.logout(error.message);
      return;
    }

    const wait = error.retryAfterSeconds;
    this.error.set(
      error.code === 'RATE_LIMITED' && wait !== undefined
        ? `Demasiadas solicitudes. Intenta de nuevo en ${wait} ${wait === 1 ? 'segundo' : 'segundos'}.`
        : error.message,
    );
    if (error.code === 'FLIGHT_NOT_FOUND' || error.code === 'INVALID_FLIGHT_TRANSITION') {
      this.realtime.retrySearch();
    }
  }
}
