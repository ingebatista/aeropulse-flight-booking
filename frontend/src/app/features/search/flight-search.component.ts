import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  type TemplateRef,
  computed,
  contentChild,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  AIRPORT_CODES,
  DATE_PATTERN,
  type AirportCode,
  type Flight,
  type FlightStatus,
  type SearchFlightsQuery,
} from '@aeropulse/shared';
import { FlightRealtime } from '../../core/socket/flight-realtime';
import { FlightsStore } from '../../core/stores/flights-store';

const AIRPORTS: Record<AirportCode, { city: string; airport: string }> = {
  BAQ: { city: 'Barranquilla', airport: 'Aeropuerto Ernesto Cortissoz' },
  BOG: { city: 'Bogotá', airport: 'Aeropuerto El Dorado' },
  MDE: { city: 'Medellín', airport: 'Aeropuerto José María Córdova' },
};

const DATE_LABEL = new Intl.DateTimeFormat('es-CO', { dateStyle: 'full', timeZone: 'UTC' });
const WEEKDAY = new Intl.DateTimeFormat('es-CO', { weekday: 'short', timeZone: 'UTC' });
const SHORT_DATE = new Intl.DateTimeFormat('es-CO', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});
const TIME = new Intl.DateTimeFormat('es-CO', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'UTC',
});
const AMOUNT = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });

function validDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const instant = new Date(value);
  return Number.isFinite(instant.valueOf()) && instant.toISOString().slice(0, 10) === value;
}

function offsetDay(date: string, offset: number): Date {
  const instant = new Date(date);
  instant.setUTCDate(instant.getUTCDate() + offset);
  return instant;
}

@Component({
  selector: 'app-flight-search',
  imports: [NgTemplateOutlet, RouterLink],
  templateUrl: './flight-search.component.html',
  styleUrl: './flight-search.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlightSearchComponent {
  private readonly realtime = inject(FlightRealtime);
  private readonly today = new Date().toISOString().slice(0, 10);
  private tryNextDay = true;
  private wasDisconnected = false;

  protected readonly airportCodes = AIRPORT_CODES;
  protected readonly statusView =
    inject(ActivatedRoute, { optional: true })?.snapshot.data['statusView'] === true;
  protected readonly flightActions =
    contentChild<TemplateRef<{ $implicit: Flight }>>('flightActions');
  protected readonly airports = AIRPORTS;
  protected readonly flightStatuses: Record<FlightStatus, string> = {
    SCHEDULED: 'Programado',
    DELAYED: 'Retrasado',
    CANCELLED: 'Cancelado',
  };
  protected readonly filters = signal<SearchFlightsQuery>({
    origin: 'BOG',
    destination: 'MDE',
    date: this.today,
  });
  protected readonly submitted = signal(this.filters());
  protected readonly results = inject(FlightsStore).results;
  protected readonly search = this.realtime.search;
  protected readonly connection = this.realtime.connection;
  protected readonly restored = signal(false);
  protected readonly sameAirport = computed(
    () => this.filters().origin === this.filters().destination,
  );
  protected readonly dateInvalid = computed(() => !validDate(this.filters().date));
  protected readonly searching = computed(
    () =>
      this.search().status === 'loading' &&
      !['offline', 'error'].includes(this.connection().status),
  );
  protected readonly days = computed(() => {
    const date = this.dateInvalid() ? this.submitted().date : this.filters().date;
    return [-2, -1, 0, 1, 2]
      .map((offset) => {
        const day = offsetDay(date, offset);
        return {
          date: day.toISOString().slice(0, 10),
          weekday: WEEKDAY.format(day),
          short: SHORT_DATE.format(day),
          label: DATE_LABEL.format(day),
        };
      })
      .filter((day) => validDate(day.date));
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.realtime.stop());
    this.realtime.watch({ query: this.submitted() });

    effect(() => {
      if (this.search().status !== 'ready' || !this.tryNextDay) return;
      this.tryNextDay = false;
      const nextDay = offsetDay(this.today, 1).toISOString().slice(0, 10);
      if (this.results().length === 0 && nextDay.slice(0, 7) === this.today.slice(0, 7)) {
        untracked(() => {
          this.filters.update((filters) => ({ ...filters, date: nextDay }));
          this.submit();
        });
      }
    });

    effect(() => {
      const status = this.connection().status;
      if (status === 'offline' || status === 'error') {
        this.wasDisconnected = true;
        this.restored.set(false);
      } else if (
        status === 'connected' &&
        this.search().status === 'ready' &&
        this.wasDisconnected
      ) {
        this.wasDisconnected = false;
        this.restored.set(true);
      }
    });
  }

  protected updateAirport(field: 'origin' | 'destination', value: string): void {
    const airport = AIRPORT_CODES.find((code) => code === value);
    if (airport) this.edit({ [field]: airport });
  }

  protected swapAirports(): void {
    const { origin, destination } = this.filters();
    this.edit({ origin: destination, destination: origin });
  }

  protected changeDate(date: string): void {
    this.edit({ date });
  }

  protected selectDay(date: string): void {
    this.changeDate(date);
    this.submit();
  }

  protected submit(event?: Event): void {
    event?.preventDefault();
    this.tryNextDay = false;
    if (this.sameAirport() || this.dateInvalid()) {
      const form = event?.currentTarget;
      if (form instanceof HTMLFormElement)
        form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    const query = this.filters();
    const previous = this.submitted();
    this.submitted.set(query);
    this.restored.set(false);
    if (
      query.origin === previous.origin &&
      query.destination === previous.destination &&
      query.date === previous.date
    ) {
      if (!this.searching()) this.realtime.retrySearch();
    } else {
      this.realtime.watch({ query });
    }
  }

  protected retry(): void {
    this.realtime.retrySearch();
  }

  protected dateLabel(value: string): string {
    return DATE_LABEL.format(new Date(value));
  }

  protected time(value: string): string {
    return TIME.format(new Date(value));
  }

  protected fare(value: number): string {
    return `COP ${AMOUNT.format(value)}`;
  }

  private edit(fields: Partial<SearchFlightsQuery>): void {
    this.tryNextDay = false;
    this.filters.update((query) => ({ ...query, ...fields }));
  }
}
