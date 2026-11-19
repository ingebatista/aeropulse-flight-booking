import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { type SeatEvent, type SeatStatus } from '@aeropulse/shared';

export const SEAT_APPEARANCE = {
  AVAILABLE: { icon: '○', label: 'Disponible' },
  HELD: { icon: '🔒', label: 'Bloqueado' },
  BOOKED: { icon: '●', label: 'Reservado' },
  OWN: { icon: '✓', label: 'Mi asiento' },
} as const;

type Appearance = SeatStatus | 'OWN';
const COLUMNS: Record<string, number> = { A: 1, B: 2, C: 4, D: 5 };

@Component({
  selector: 'app-seat-grid',
  templateUrl: './seat-grid.component.html',
  styleUrl: './seat-grid.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SeatGridComponent {
  readonly seats = input.required<ReadonlyMap<string, SeatEvent>>();
  readonly interactive = input(false);
  readonly canSelect = input(false);
  readonly ownSeat = input<string | null>(null);
  readonly seatSelected = output<string>();
  protected readonly appearance = SEAT_APPEARANCE;
  protected readonly rows = computed(() => {
    const rows = new Map<number, { seat: SeatEvent; column: number }[]>();
    for (const seat of this.seats().values()) {
      const row = Number(seat.seatCode.slice(0, -1));
      const column = COLUMNS[seat.seatCode.slice(-1)];
      if (!column || !Number.isInteger(row)) continue;
      const entries = rows.get(row) ?? [];
      entries.push({ seat, column });
      rows.set(row, entries);
    }
    return [...rows]
      .sort(([a], [b]) => a - b)
      .map(([number, entries]) => ({
        number,
        entries: entries.sort((a, b) => a.column - b.column),
      }));
  });

  protected state(seat: SeatEvent): Appearance {
    return this.ownSeat() === seat.seatCode ? 'OWN' : seat.status;
  }

  protected selectable(seat: SeatEvent): boolean {
    return this.canSelect() && seat.status === 'AVAILABLE';
  }

  protected choose(seat: SeatEvent): void {
    if (this.selectable(seat)) this.seatSelected.emit(seat.seatCode);
  }
}
