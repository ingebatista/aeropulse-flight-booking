import { Subject } from 'rxjs';
import { EventBus, type DomainEvent, type DomainEventHandler } from './event-bus';

export interface HandlerErrorLogger {
  error(message: string, trace?: string): void;
}

/**
 * Bus en proceso sobre un `Subject` de RxJS. Un suscriptor que lanza una
 * excepción se registra y no afecta a los demás ni a quien publica; sin esa
 * guarda, RxJS relanzaría el error de forma asíncrona y tumbaría el proceso.
 */
export class InProcessEventBus extends EventBus {
  private readonly subject = new Subject<DomainEvent>();

  constructor(private readonly logger?: HandlerErrorLogger) {
    super();
  }

  publish(event: DomainEvent): void {
    this.subject.next(event);
  }

  subscribe(handler: DomainEventHandler): () => void {
    const subscription = this.subject.subscribe((event) => {
      try {
        handler(event);
      } catch (error) {
        this.logger?.error(
          `Un suscriptor falló al procesar ${event.type}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    });
    return () => subscription.unsubscribe();
  }
}
