import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BOOKING_CODE_PATTERN, type Ticket } from '@aeropulse/shared';
import { type ApiError } from '../../core/api/api-error';
import { normalizePassengerName } from '../../core/api/booking-input';
import { ReservationApi } from '../../core/api/reservation-api';
import { TicketComponent } from './ticket.component';

@Component({
  selector: 'app-ticket-lookup',
  imports: [TicketComponent],
  templateUrl: './ticket-lookup.component.html',
  styleUrl: './ticket-lookup.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TicketLookupComponent {
  private readonly api = inject(ReservationApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly heading = viewChild.required<ElementRef<HTMLElement>>('heading');
  protected readonly pending = signal(false);
  protected readonly error = signal('');
  protected readonly invalidCode = signal(false);
  protected readonly invalidName = signal(false);
  protected readonly ticket = signal<Ticket | null>(null);

  constructor() {
    afterNextRender(() => this.heading().nativeElement.focus());
  }

  protected submit(event: Event, codeInput: HTMLInputElement, nameInput: HTMLInputElement): void {
    event.preventDefault();
    if (this.pending()) return;
    const code = codeInput.value.trim().toUpperCase();
    const lastName = normalizePassengerName(nameInput.value);
    const codeValid = BOOKING_CODE_PATTERN.test(code);
    this.invalidCode.set(!codeValid);
    this.invalidName.set(lastName === null);
    this.error.set('');
    this.ticket.set(null);
    if (!codeValid || !lastName) {
      (!codeValid ? codeInput : nameInput).focus();
      return;
    }

    this.pending.set(true);
    this.api
      .ticket(code, lastName)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (ticket) => {
          this.pending.set(false);
          this.ticket.set(ticket);
        },
        error: (error: ApiError) => {
          this.pending.set(false);
          this.error.set(
            error.code === 'BOOKING_NOT_FOUND'
              ? 'No encontramos un boleto con ese código y apellido.'
              : error.message,
          );
        },
      });
  }
}
