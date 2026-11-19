import { SEARCH_ROOM, UUID_V4_PATTERN, type RoomName } from '@aeropulse/shared';
import { ApiError } from '../api/api-error';
import { type SocketFactory } from '../socket/socket-factory';
import { type FakeReservations } from './fake-reservations';

export function fakeSocket(fake: FakeReservations): SocketFactory {
  return (auth, handlers) => {
    const rooms = new Set<RoomName>();
    const previous = new Map<string, () => void>();
    const clientId = auth.clientId?.toLowerCase();
    let active = false;
    const events = fake.events.subscribe((event) => {
      if (!active || !rooms.has(event.room)) return;

      const { name, data } = event;
      const key = name === 'seat.changed' ? `${data.flightId}:${data.seatCode}` : data.flightId;
      const deliver = () => {
        if (!active) return;
        if (name === 'seat.changed') handlers.events[name](data);
        else handlers.events[name](data);
      };
      const older = previous.get(key);
      previous.set(key, deliver);
      deliver();
      // La entrega simulada incluye un duplicado y, si existe, la versión anterior.
      queueMicrotask(() => {
        older?.();
        deliver();
      });
    });

    return {
      connect: () => {
        active = true;
        queueMicrotask(() => {
          if (!active) return;
          if (clientId !== undefined && !UUID_V4_PATTERN.test(clientId)) {
            handlers.error(new ApiError('VALIDATION_ERROR'));
          } else {
            handlers.connect();
          }
        });
      },
      disconnect: () => {
        active = false;
        rooms.clear();
        events.unsubscribe();
      },
      join: (room, ack) => {
        if (!active) return;
        const normalized = room === SEARCH_ROOM ? room : (room.toLowerCase() as RoomName);
        rooms.add(normalized);
        const result = fake.join(room, clientId);
        if (!result.ok) rooms.delete(normalized);
        queueMicrotask(() => {
          if (active) ack(result);
        });
      },
    };
  };
}
