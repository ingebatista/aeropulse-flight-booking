import { InjectionToken } from '@angular/core';
import {
  SOCKET_PATH,
  type ClientToServerEvents,
  type JoinResult,
  type RoomName,
  type ServerToClientEvents,
  type SocketAuth,
} from '@aeropulse/shared';
import { io, type Socket } from 'socket.io-client';
import { ApiError } from '../api/api-error';

export interface SocketHandlers {
  connect(): void;
  disconnect(): void;
  error(error: ApiError): void;
  events: ServerToClientEvents;
}

export interface RealtimeConnection {
  connect(): void;
  disconnect(): void;
  join(room: RoomName, ack: (result: JoinResult) => void): void;
}

export type SocketFactory = (auth: SocketAuth, handlers: SocketHandlers) => RealtimeConnection;

export const SOCKET_FACTORY = new InjectionToken<SocketFactory>('Fábrica de Socket.IO', {
  providedIn: 'root',
  factory: () => (auth, handlers) => {
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({
      path: SOCKET_PATH,
      transports: ['websocket'],
      autoConnect: false,
      auth,
    });

    socket.on('connect', handlers.connect);
    socket.on('disconnect', handlers.disconnect);
    socket.on('connect_error', (error) => {
      const data: unknown = error.data;
      const invalid =
        data && typeof data === 'object' && 'code' in data && data.code === 'VALIDATION_ERROR';
      handlers.error(new ApiError(invalid ? 'VALIDATION_ERROR' : 'NETWORK_ERROR'));
    });
    socket.on('seat.changed', handlers.events['seat.changed']);
    socket.on('flight.status_changed', handlers.events['flight.status_changed']);

    return {
      connect: () => socket.connect(),
      disconnect: () => {
        socket.removeAllListeners();
        socket.disconnect();
      },
      join: (room, ack) => socket.emit('join', room, ack),
    };
  },
});
