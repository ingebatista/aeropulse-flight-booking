import type { DomainEvent } from './event-bus';
import { EventBus } from './event-bus';
import { InProcessEventBus } from './in-process-event-bus';
import { publishAll } from './publish-after-commit';

const seatEvent = (version: number): DomainEvent => ({
  type: 'seat.changed',
  payload: {
    flightId: 'f3217c45-4b7e-4537-8862-cc4fe08eb275',
    seatCode: '1A',
    status: 'HELD',
    version,
  },
});

describe('InProcessEventBus', () => {
  const logger = () => ({ error: jest.fn() });

  it('entrega cada evento a todos los suscriptores, en orden', () => {
    const bus = new InProcessEventBus();
    const a: number[] = [];
    const b: number[] = [];
    bus.subscribe((e) => a.push((e.payload as { version: number }).version));
    bus.subscribe((e) => b.push((e.payload as { version: number }).version));

    bus.publish(seatEvent(1));
    bus.publish(seatEvent(2));

    expect(a).toEqual([1, 2]);
    expect(b).toEqual([1, 2]);
  });

  it('no entrega a quien canceló su suscripción', () => {
    const bus = new InProcessEventBus();
    const received: DomainEvent[] = [];
    const unsubscribe = bus.subscribe((e) => received.push(e));

    bus.publish(seatEvent(1));
    unsubscribe();
    bus.publish(seatEvent(2));

    expect(received).toHaveLength(1);
  });

  it('un suscriptor que falla se registra y no afecta a los demás ni a quien publica', () => {
    const log = logger();
    const bus = new InProcessEventBus(log);
    const received: DomainEvent[] = [];
    bus.subscribe(() => {
      throw new Error('fallo del suscriptor');
    });
    bus.subscribe((e) => received.push(e));

    expect(() => bus.publish(seatEvent(1))).not.toThrow();

    expect(received).toHaveLength(1);
    expect(log.error).toHaveBeenCalledTimes(1);
    expect(log.error.mock.calls[0][0]).toContain('seat.changed');
  });

  it('sin evento publicado no entrega nada', () => {
    const bus = new InProcessEventBus();
    const handler = jest.fn();
    bus.subscribe(handler);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('publishAll', () => {
  it('publica todos los eventos en orden', () => {
    const bus = new InProcessEventBus();
    const versions: number[] = [];
    bus.subscribe((e) => versions.push((e.payload as { version: number }).version));

    publishAll(bus, [seatEvent(1), seatEvent(2), seatEvent(3)], { error: jest.fn() });

    expect(versions).toEqual([1, 2, 3]);
  });

  it('si el bus falla registra el error y sigue con el resto, sin lanzar', () => {
    const published: DomainEvent[] = [];
    class FailingOnce extends EventBus {
      private calls = 0;
      publish(event: DomainEvent): void {
        if (this.calls++ === 0) throw new Error('bus caído');
        published.push(event);
      }
      subscribe(): () => void {
        return () => undefined;
      }
    }
    const log = { error: jest.fn() };

    expect(() => publishAll(new FailingOnce(), [seatEvent(1), seatEvent(2)], log)).not.toThrow();

    expect(published).toHaveLength(1);
    expect(log.error).toHaveBeenCalledTimes(1);
  });
});
