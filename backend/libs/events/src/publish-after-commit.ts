import type { DomainEvent, EventBus } from './event-bus';
import type { HandlerErrorLogger } from './in-process-event-bus';

/**
 * Publica los eventos que una transacción registró, **una vez confirmada**.
 * Cada publicación va en `try/catch` con log: un fallo de difusión nunca debe
 * convertirse en `500` sobre una operación que ya quedó confirmada
 * (AGENTS.md, invariante 4).
 */
export function publishAll(
  bus: EventBus,
  events: readonly DomainEvent[],
  logger: HandlerErrorLogger,
): void {
  for (const event of events) {
    try {
      bus.publish(event);
    } catch (error) {
      logger.error(
        `No se pudo publicar ${event.type}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
