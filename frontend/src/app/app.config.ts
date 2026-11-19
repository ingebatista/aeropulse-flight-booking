import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { transportProviders } from './core/transport.providers';

export const appConfig: ApplicationConfig = {
  providers: [...transportProviders, provideRouter(routes)],
};
