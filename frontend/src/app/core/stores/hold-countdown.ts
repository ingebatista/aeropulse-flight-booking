import { type Signal, computed, effect, signal } from '@angular/core';
import { type FlightInventory } from './inventory-store';

export function holdSecondsRemaining(inventory: FlightInventory, now: number): number {
  const hold = inventory.myHold();
  const clock = inventory.clock();
  if (!hold || !clock) return 0;
  const elapsed = Math.max(0, now - clock.sampledAt);
  return Math.max(
    0,
    Math.ceil((Date.parse(hold.holdExpiresAt) - Date.parse(clock.serverNow) - elapsed) / 1000),
  );
}

export function useHoldCountdown(inventory: Signal<FlightInventory>) {
  const now = signal(performance.now());
  const remaining = computed(() => holdSecondsRemaining(inventory(), now()));

  effect((onCleanup) => {
    if (!inventory().myHold()) return;
    now.set(performance.now());
    const timer = setInterval(() => now.set(performance.now()), 200);
    onCleanup(() => clearInterval(timer));
  });

  return {
    remaining,
    activeHold: computed(() => (remaining() > 0 ? inventory().myHold() : null)),
    countdown: computed(() => {
      const seconds = remaining();
      return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    }),
  };
}
