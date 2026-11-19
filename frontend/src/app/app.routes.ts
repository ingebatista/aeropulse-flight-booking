import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Buscar vuelos | AeroPulse',
    loadComponent: () =>
      import('./features/search/flight-search.component').then(
        ({ FlightSearchComponent }) => FlightSearchComponent,
      ),
  },
];
