import type { FlightStatusEvent, SeatEvent } from '@aeropulse/shared';

/** Eventos de dominio que cruzan el bus. Ninguno lleva `clientId`, `holdToken` ni datos del pasajero. */
export type DomainEvent =
  | { type: 'seat.changed'; payload: SeatEvent }
  | { type: 'flight.status_changed'; payload: FlightStatusEvent };

export type DomainEventHandler = (event: DomainEvent) => void;

/**
 * Puerto del bus de eventos (arch §3.1). Hoy hay un adaptador en proceso; mañana
 * podría ser Redis o `LISTEN/NOTIFY`. Es una clase abstracta para servir también
 * como *token* de inyección.
 *
 * Los eventos se publican **solo después del commit**: nunca se anuncia un
 * cambio revertido.
 */
export abstract class EventBus {
  abstract publish(event: DomainEvent): void;

  /** Devuelve la función que cancela la suscripción. */
  abstract subscribe(handler: DomainEventHandler): () => void;
}
