import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { inject } from '@angular/core';
import { fakeHttp, type FakeCapabilities } from './fake/fake-http';
import { FakeReservations } from './fake/fake-reservations';
import { fakeSocket } from './fake/fake-socket';
import { SOCKET_FACTORY } from './socket/socket-factory';

const capabilities: FakeCapabilities = {
  search: true,
  seats: true,
  realtime: true,
  booking: true,
  admin: true,
};

export const transportProviders = [
  provideHttpClient(withInterceptors([fakeHttp(capabilities)])),
  ...(capabilities.realtime
    ? [{ provide: SOCKET_FACTORY, useFactory: () => fakeSocket(inject(FakeReservations)) }]
    : []),
];
