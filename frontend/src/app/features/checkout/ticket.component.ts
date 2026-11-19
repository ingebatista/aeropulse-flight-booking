import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { type Ticket } from '@aeropulse/shared';

@Component({
  selector: 'app-ticket',
  imports: [RouterLink],
  templateUrl: './ticket.component.html',
  styleUrl: './ticket.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TicketComponent {
  readonly ticket = input.required<Ticket>();
  private readonly document = inject(DOCUMENT);
  private readonly heading = viewChild.required<ElementRef<HTMLElement>>('heading');
  protected readonly copyFeedback = signal('');
  protected readonly money = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
  private readonly dates = new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
    hourCycle: 'h23',
    timeZone: 'UTC',
  });

  constructor() {
    afterNextRender(() => this.heading().nativeElement.focus());
  }

  protected utc(value: string): string {
    return this.dates.format(new Date(value));
  }

  protected async copyCode(): Promise<void> {
    this.copyFeedback.set('');
    const clipboard = this.document.defaultView?.navigator.clipboard;
    if (clipboard) {
      try {
        await clipboard.writeText(this.ticket().code);
        this.copyFeedback.set('Código copiado.');
        return;
      } catch {
        // El código visible sigue disponible para copiarlo manualmente.
      }
    }
    this.copyFeedback.set('Selecciona el código y cópialo manualmente.');
  }

  protected printTicket(): void {
    this.document.defaultView?.print();
  }
}
