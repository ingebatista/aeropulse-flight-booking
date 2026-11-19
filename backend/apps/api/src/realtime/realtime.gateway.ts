import {
  type ClientToServerEvents,
  flightRoom,
  type JoinResult,
  SEARCH_ROOM,
  type ServerToClientEvents,
  type SocketAuth,
  type SocketConnectErrorData,
  SOCKET_PATH,
  UUID_V4_PATTERN,
} from '@aeropulse/shared';
import { EventBus } from '@backend/events';
import { Logger, type OnModuleDestroy } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { ApiError } from '../http/errors/api-error';
import { SnapshotService } from '../inventory/snapshot.service';

interface SocketData {
  /** `clientId` normalizado; ausente en conexiones de solo lectura. Nunca se difunde. */
  clientId?: string;
}

type RealtimeServer = Server<ClientToServerEvents, ServerToClientEvents, object, SocketData>;
type RealtimeSocket = Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>;

const FLIGHT_ROOM_PATTERN = /^flight:(.+)$/;

/**
 * Tiempo real (arch §4.6). El WebSocket solo difunde: el único mensaje de
 * entrada es `join`, que suscribe a una sala y devuelve su instantánea.
 */
@WebSocketGateway({ path: SOCKET_PATH, transports: ['websocket'] })
export class RealtimeGateway implements OnGatewayInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeGateway.name);
  private unsubscribe?: () => void;

  @WebSocketServer()
  server!: RealtimeServer;

  constructor(
    private readonly snapshots: SnapshotService,
    private readonly bus: EventBus,
  ) {}

  afterInit(server: RealtimeServer): void {
    // `auth.clientId` es opcional (lectura pública), pero si llega debe ser un UUID v4.
    server.use((socket, next) => {
      const { clientId } = (socket.handshake.auth ?? {}) as SocketAuth;
      if (clientId === undefined) return next();
      if (typeof clientId !== 'string' || !UUID_V4_PATTERN.test(clientId)) {
        const error = new Error('clientId inválido') as Error & { data: SocketConnectErrorData };
        error.data = { code: 'VALIDATION_ERROR' };
        return next(error);
      }
      socket.data.clientId = clientId.toLowerCase();
      next();
    });

    // Difusión tras el commit: el bus solo recibe eventos ya confirmados.
    this.unsubscribe = this.bus.subscribe((event) => {
      if (event.type === 'seat.changed') {
        this.server.to(flightRoom(event.payload.flightId)).emit('seat.changed', event.payload);
      } else {
        this.server.to(SEARCH_ROOM).emit('flight.status_changed', event.payload);
      }
    });
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
  }

  /**
   * Primero entra a la sala y después lee la instantánea: así un evento que
   * ocurra entre ambos llega por la sala y el cliente lo funde por versión.
   * Si falla, sale de la sala: no queda una suscripción de un `join` fallido.
   */
  @SubscribeMessage('join')
  async join(
    @ConnectedSocket() socket: RealtimeSocket,
    @MessageBody() room: unknown,
  ): Promise<JoinResult> {
    if (room === SEARCH_ROOM) {
      await socket.join(SEARCH_ROOM);
      try {
        return { ok: true, data: { serverNow: await this.snapshots.serverNow() } };
      } catch (error) {
        await socket.leave(SEARCH_ROOM);
        return this.failure(error);
      }
    }

    const flightId = typeof room === 'string' ? FLIGHT_ROOM_PATTERN.exec(room)?.[1] : undefined;
    if (!flightId || !UUID_V4_PATTERN.test(flightId)) {
      return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Sala inválida.' } };
    }

    const normalized = flightRoom(flightId.toLowerCase());
    await socket.join(normalized);
    try {
      const data = await this.snapshots.flightSnapshot(
        flightId.toLowerCase(),
        socket.data.clientId,
      );
      return { ok: true, data };
    } catch (error) {
      await socket.leave(normalized);
      return this.failure(error);
    }
  }

  private failure(error: unknown): JoinResult {
    if (error instanceof ApiError && error.code === 'FLIGHT_NOT_FOUND') {
      return { ok: false, error: { code: 'FLIGHT_NOT_FOUND', message: 'El vuelo no existe.' } };
    }
    this.logger.error('Falló join', error instanceof Error ? error.stack : String(error));
    return {
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'Ocurrió un error inesperado.' },
    };
  }
}
