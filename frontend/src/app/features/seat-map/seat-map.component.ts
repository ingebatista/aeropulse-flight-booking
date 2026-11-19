import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  type Signal,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ROUTER_OUTLET_DATA } from '@angular/router';
import { type OwnHold } from '@aeropulse/shared';
import { type Observable, finalize } from 'rxjs';
import { type ApiError } from '../../core/api/api-error';
import { ReservationApi } from '../../core/api/reservation-api';
import { FlightRealtime } from '../../core/socket/flight-realtime';
import { type FlightInventory } from '../../core/stores/inventory-store';
import { SEAT_APPEARANCE, SeatGridComponent } from './seat-grid.component';

@Component({
  selector: 'app-seat-map',
  imports: [SeatGridComponent],
  templateUrl: './seat-map.component.html',
  styleUrl: './seat-map.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SeatMapComponent {
  private readonly api = inject(ReservationApi);
  private readonly realtime = inject(FlightRealtime);
  private readonly destroyRef = inject(DestroyRef);
  private readonly now = signal(performance.now());
  private observedHold: { inventory: FlightInventory; hold: OwnHold } | undefined;
  private changingHold: string | undefined;
  protected readonly inventory = inject(ROUTER_OUTLET_DATA) as Signal<FlightInventory>;
  protected readonly pending = signal(false);
  protected readonly error = signal('');
  protected readonly expiry = signal('');
  protected readonly legend = Object.entries(SEAT_APPEARANCE);
  protected readonly flight = computed(() => this.inventory().flight());
  protected readonly remaining = computed(() => {
    const hold = this.inventory().myHold();
    const clock = this.inventory().clock();
    if (!hold || !clock) return 0;
    const elapsed = Math.max(0, this.now() - clock.sampledAt);
    return Math.max(
      0,
      Math.ceil((Date.parse(hold.holdExpiresAt) - Date.parse(clock.serverNow) - elapsed) / 1000),
    );
  });
  protected readonly activeHold = computed(() =>
    this.remaining() > 0 ? this.inventory().myHold() : null,
  );
  protected readonly countdown = computed(() => {
    const seconds = this.remaining();
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  });
  protected readonly canWrite = computed(
    () => this.realtime.connection().status === 'connected' && !this.pending(),
  );
  protected readonly canSelect = computed(() => {
    const flight = this.flight();
    return this.canWrite() && !!flight && flight.status !== 'CANCELLED' && !flight.soldOut;
  });

  constructor() {
    effect((onCleanup) => {
      if (!this.inventory().myHold()) return;
      this.now.set(performance.now());
      const timer = setInterval(() => this.now.set(performance.now()), 200);
      onCleanup(() => clearInterval(timer));
    });

    effect(() => {
      const inventory = this.inventory();
      const hold = inventory.myHold();
      const previous = this.observedHold;
      this.observedHold = hold ? { inventory, hold } : undefined;
      // El barrido puede liberar el asiento antes de que se ejecute el último tick.
      const swept =
        !hold &&
        previous?.inventory === inventory &&
        previous.hold.holdToken !== this.changingHold &&
        inventory.seats().get(previous.hold.seatCode)?.status === 'AVAILABLE';
      const expired = hold && this.remaining() === 0 ? hold : swept ? previous.hold : null;
      if (expired && inventory.markExpiryAnnounced(expired.holdToken)) {
        this.expiry.set(`Venció el bloqueo del asiento ${expired.seatCode}.`);
      }
    });
  }

  protected choose(seatCode: string): void {
    const inventory = this.inventory();
    if (!this.canSelect() || inventory.seats().get(seatCode)?.status !== 'AVAILABLE') return;
    this.run(this.api.hold(inventory.flightId, seatCode));
  }

  protected release(): void {
    const hold = this.activeHold();
    if (!this.canWrite() || !hold) return;
    this.run(this.api.release(this.inventory().flightId, hold.seatCode, hold.holdToken));
  }

  private run(request: Observable<unknown>): void {
    const inventory = this.inventory();
    this.changingHold = inventory.myHold()?.holdToken;
    this.pending.set(true);
    this.error.set('');
    this.expiry.set('');
    request
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.pending.set(false)),
      )
      .subscribe({
        error: (error: ApiError) => {
          this.changingHold = undefined;
          if (this.inventory() !== inventory) return;
          this.error.set(error.message);
          if (['SEAT_UNAVAILABLE', 'FLIGHT_CANCELLED', 'HOLD_NOT_OWNED'].includes(error.code)) {
            this.realtime.retry();
          }
        },
      });
  }
}
