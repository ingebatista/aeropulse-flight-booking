import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { UUID_V4_PATTERN } from '@aeropulse/shared';
import { FlightRealtime } from '../../core/socket/flight-realtime';
import { type FlightInventory, InventoryStore } from '../../core/stores/inventory-store';

@Component({
  selector: 'app-flight-detail',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './flight-detail.component.html',
  styleUrl: './flight-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlightDetailComponent {
  private readonly realtime = inject(FlightRealtime);
  private readonly route = inject(ActivatedRoute);
  private readonly queryParams = toSignal(this.route.queryParamMap, { requireSync: true });
  protected readonly inventory = signal<FlightInventory | null>(null);
  protected readonly connection = this.realtime.connection;
  protected readonly invalid = signal(false);
  protected readonly flight = computed(() => this.inventory()?.flight());
  protected readonly backLink = computed(() => {
    switch (this.queryParams().get('from')) {
      case 'admin':
        return { path: '/admin', label: 'Volver a administración' };
      case 'estado-de-vuelos':
        return { path: '/estado-de-vuelos', label: 'Volver a estado de vuelos' };
      default:
        return { path: '/', label: 'Volver a la búsqueda' };
    }
  });

  constructor() {
    const inventories = inject(InventoryStore);
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const id = params.get('flightId')?.toLowerCase();
      if (!id || !UUID_V4_PATTERN.test(id)) {
        this.realtime.stop();
        this.inventory.set(null);
        this.invalid.set(true);
        return;
      }
      this.invalid.set(false);
      this.inventory.set(inventories.forFlight(id));
      this.realtime.watch({ flightId: id });
    });
    inject(DestroyRef).onDestroy(() => this.realtime.stop());
  }

  protected retry(): void {
    this.realtime.retry();
  }
}
