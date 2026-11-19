import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  afterNextRender,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
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
  row: HTMLElement | null;
}

@Component({
  selector: 'app-admin-flights',
  imports: [FlightSearchComponent],
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
    this.cancellation.set({ flight, origin, row: origin.closest('.flight') });
    afterNextRender(() => dialog.showModal(), { injector: this.injector });
  }

  protected closeDialog(): void {
    const selection = this.cancellation();
    this.cancellation.set(null);
    if (selection) {
      const target = selection.origin.isConnected ? selection.origin : selection.row;
      if (target?.isConnected) target.focus();
    }
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

    const row = origin.closest<HTMLElement>('.flight');
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
          if (row && restoreFocus) {
            afterNextRender(
              () => {
                if (!origin.isConnected && this.document.activeElement === this.document.body)
                  row.focus();
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
