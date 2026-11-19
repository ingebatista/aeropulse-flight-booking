import { ChangeDetectionStrategy, Component, type Signal, inject } from '@angular/core';
import { ROUTER_OUTLET_DATA } from '@angular/router';
import { SEAT_STATUSES } from '@aeropulse/shared';
import { type FlightInventory } from '../../core/stores/inventory-store';
import { SEAT_APPEARANCE, SeatGridComponent } from '../seat-map/seat-grid.component';

@Component({
  selector: 'app-flight-occupancy',
  imports: [SeatGridComponent],
  templateUrl: './flight-occupancy.component.html',
  styleUrl: './flight-occupancy.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlightOccupancyComponent {
  protected readonly inventory = inject(ROUTER_OUTLET_DATA) as Signal<FlightInventory>;
  protected readonly statuses = SEAT_STATUSES;
  protected readonly appearance = SEAT_APPEARANCE;
  protected readonly labels = {
    AVAILABLE: 'Disponibles',
    HELD: 'Bloqueados',
    BOOKED: 'Reservados',
  };
}
