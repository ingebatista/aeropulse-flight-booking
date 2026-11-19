import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  type Signal,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ROUTER_OUTLET_DATA, RouterLink } from '@angular/router';
import {
  TEST_CARDS,
  type ConfirmBookingRequest,
  type Passenger,
  type Ticket,
} from '@aeropulse/shared';
import { type ApiError } from '../../core/api/api-error';
import { normalizePassengerName, validCardNumber } from '../../core/api/booking-input';
import { ReservationApi } from '../../core/api/reservation-api';
import { FlightRealtime } from '../../core/socket/flight-realtime';
import { holdSecondsRemaining, useHoldCountdown } from '../../core/stores/hold-countdown';
import { type FlightInventory } from '../../core/stores/inventory-store';
import { TicketComponent } from './ticket.component';

interface Attempt {
  key: string;
  body: Omit<ConfirmBookingRequest, 'payment'>;
  last4: string;
}

@Component({
  selector: 'app-checkout',
  imports: [RouterLink, TicketComponent],
  templateUrl: './checkout.component.html',
  styleUrl: './checkout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutComponent {
  private readonly api = inject(ReservationApi);
  private readonly realtime = inject(FlightRealtime);
  private readonly destroyRef = inject(DestroyRef);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');
  private readonly inventory = inject(ROUTER_OUTLET_DATA) as Signal<FlightInventory>;
  private keyForHold: { token: string; key: string } | undefined;
  protected readonly flight = computed(() => this.inventory().flight());
  protected readonly clock = useHoldCountdown(this.inventory);
  protected readonly testCards = TEST_CARDS;
  protected readonly money = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
  protected readonly passenger = signal<Passenger>({ firstName: '', lastName: '' });
  protected readonly errors = signal<Partial<Record<keyof Passenger | 'card', string>>>({});
  protected readonly error = signal('');
  protected readonly terminal = signal(false);
  protected readonly pending = signal<Attempt | null>(null);
  protected readonly uncertain = signal<Attempt | null>(null);
  protected readonly ticket = signal<Ticket | null>(null);
  protected readonly locked = computed(() => this.pending() ?? this.uncertain());
  protected readonly seat = computed(
    () => this.locked()?.body.seatCode ?? this.clock.activeHold()?.seatCode,
  );
  protected readonly canStart = computed(() => {
    const flight = this.flight();
    return Boolean(
      flight && flight.status !== 'CANCELLED' && !flight.soldOut && this.clock.activeHold(),
    );
  });
  protected readonly canSubmit = computed(
    () =>
      !this.pending() &&
      (this.uncertain() !== null ||
        (this.canStart() && this.realtime.connection().status === 'connected')),
  );

  constructor() {
    afterNextRender(() => this.heading()?.nativeElement.focus());
  }

  protected edit(field: keyof Passenger, value: string): void {
    this.passenger.update((current) => ({ ...current, [field]: value }));
    this.errors.update((current) => ({ ...current, [field]: undefined }));
  }

  protected setCardError(error?: string): void {
    this.errors.update((current) => ({ ...current, card: error }));
  }

  protected chooseCard(card: HTMLInputElement, value: string): void {
    card.value = value;
    this.setCardError();
    card.focus();
  }

  protected submit(
    event: Event,
    firstName: HTMLInputElement,
    lastName: HTMLInputElement,
    card: HTMLInputElement,
  ): void {
    event.preventDefault();
    if (!this.canSubmit()) return;
    const inventory = this.inventory();
    const hold = inventory.myHold();
    const previous = this.uncertain();
    if (!previous && (!hold || holdSecondsRemaining(inventory, performance.now()) === 0)) {
      this.error.set('El bloqueo del asiento ya no está vigente.');
      this.terminal.set(true);
      return;
    }

    const first = previous?.body.passenger.firstName ?? normalizePassengerName(firstName.value);
    const last = previous?.body.passenger.lastName ?? normalizePassengerName(lastName.value);
    const cardNumber = card.value;
    const last4 = cardNumber.slice(-4);
    const cardError = !validCardNumber(cardNumber)
      ? 'Introduce un número válido sin espacios.'
      : previous && last4 !== previous.last4
        ? `Usa una tarjeta válida terminada en ${previous.last4}.`
        : undefined;
    this.errors.set({
      firstName: first ? undefined : 'Introduce un nombre de 1 a 60 caracteres.',
      lastName: last ? undefined : 'Introduce un apellido de 1 a 60 caracteres.',
      card: cardError,
    });
    if (!first || !last || cardError) {
      (!first ? firstName : !last ? lastName : card).focus();
      return;
    }

    const attempt =
      previous ??
      (hold && {
        key: this.keyForHold?.token === hold.holdToken ? this.keyForHold.key : crypto.randomUUID(),
        body: {
          flightId: inventory.flightId,
          seatCode: hold.seatCode,
          holdToken: hold.holdToken,
          passenger: { firstName: first, lastName: last },
        },
        last4,
      });
    if (!attempt) return;
    this.keyForHold = { token: attempt.body.holdToken, key: attempt.key };
    this.error.set('');
    this.pending.set(attempt);
    card.value = '';
    this.api
      .confirm({ ...attempt.body, payment: { cardNumber } }, attempt.key)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (ticket) => {
          this.pending.set(null);
          this.uncertain.set(null);
          this.ticket.set(ticket);
        },
        error: (error: ApiError) => {
          this.pending.set(null);
          this.handleError(error, attempt, card);
        },
      });
  }

  private handleError(error: ApiError, attempt: Attempt, card: HTMLInputElement): void {
    switch (error.code) {
      case 'PAYMENT_DECLINED':
        this.uncertain.set(null);
        this.setCardError(error.message);
        // El formulario vuelve a aceptar entradas cuando Angular aplica el cambio de estado.
        queueMicrotask(() => {
          if (card.isConnected) card.focus();
        });
        return;
      case 'HOLD_INACTIVE':
      case 'FLIGHT_CANCELLED':
      case 'FLIGHT_NOT_FOUND':
      case 'SEAT_NOT_FOUND':
      case 'IDEMPOTENCY_KEY_REUSED':
        this.uncertain.set(null);
        this.terminal.set(true);
        break;
      default:
        if (
          error.code === 'NETWORK_ERROR' ||
          error.code === 'INTERNAL_ERROR' ||
          (error.status ?? 0) >= 500
        ) {
          this.uncertain.set(attempt);
          this.error.set(
            'No pudimos confirmar el resultado de la solicitud. Reintenta para recuperar el boleto si la reserva ya se realizó.',
          );
          return;
        }
    }
    this.error.set(error.message);
  }
}
