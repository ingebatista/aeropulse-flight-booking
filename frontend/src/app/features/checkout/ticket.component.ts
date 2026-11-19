import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  input,
  viewChild,
} from '@angular/core';
import { type Ticket } from '@aeropulse/shared';

@Component({
  selector: 'app-ticket',
  templateUrl: './ticket.component.html',
  styleUrl: './ticket.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TicketComponent {
  readonly ticket = input.required<Ticket>();
  private readonly heading = viewChild.required<ElementRef<HTMLElement>>('heading');
  protected readonly money = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
  private readonly dates = new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  });

  constructor() {
    afterNextRender(() => this.heading().nativeElement.focus());
  }

  protected utc(value: string): string {
    return this.dates.format(new Date(value));
  }
}
