import { ChangeDetectionStrategy, Component, type Signal, computed, inject } from '@angular/core';
import { ROUTER_OUTLET_DATA } from '@angular/router';
import { SEAT_STATUSES } from '@aeropulse/shared';
import { type FlightInventory } from '../../core/stores/inventory-store';
import { SEAT_APPEARANCE, SeatGridComponent } from '../seat-map/seat-grid.component';

const UTC_SCHEDULE = new Intl.DateTimeFormat('es-CO', {
  dateStyle: 'medium',
  timeStyle: 'short',
  hourCycle: 'h23',
  timeZone: 'UTC',
});
const PERCENT = new Intl.NumberFormat('es-CO', {
  style: 'percent',
  maximumFractionDigits: 1,
});

@Component({
  selector: 'app-flight-occupancy',
  imports: [SeatGridComponent],
  templateUrl: './flight-occupancy.component.html',
  styleUrl: './flight-occupancy.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlightOccupancyComponent {
  protected readonly inventory = inject(ROUTER_OUTLET_DATA) as Signal<FlightInventory>;
  protected readonly flight = computed(() => this.inventory().flight());
  protected readonly appearance = SEAT_APPEARANCE;
  protected readonly labels = {
    AVAILABLE: 'Disponibles',
    HELD: 'Bloqueados',
    BOOKED: 'Reservados',
  };
  protected readonly flightStatusLabels = {
    SCHEDULED: 'Programado',
    DELAYED: 'Retrasado',
    CANCELLED: 'Cancelado',
  };
  protected readonly summary = computed(() => {
    const inventory = this.inventory();
    const counts = inventory.counts();
    const total = inventory.seats().size;
    return {
      total,
      states: SEAT_STATUSES.map((status) => ({
        status,
        count: counts[status],
        percentage: total ? PERCENT.format(counts[status] / total) : null,
      })),
    };
  });

  protected schedule(value: string): string {
    return UTC_SCHEDULE.format(new Date(value));
  }
}
