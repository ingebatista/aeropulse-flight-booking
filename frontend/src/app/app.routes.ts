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
  {
    path: 'vuelos/:flightId',
    loadComponent: () =>
      import('./features/seat-map/flight-detail.component').then(
        ({ FlightDetailComponent }) => FlightDetailComponent,
      ),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'asientos' },
      {
        path: 'asientos',
        title: 'Elegir asiento | AeroPulse',
        loadComponent: () =>
          import('./features/seat-map/seat-map.component').then(
            ({ SeatMapComponent }) => SeatMapComponent,
          ),
      },
      {
        path: 'ocupacion',
        title: 'Ocupación del vuelo | AeroPulse',
        loadComponent: () =>
          import('./features/dashboard/flight-occupancy.component').then(
            ({ FlightOccupancyComponent }) => FlightOccupancyComponent,
          ),
      },
    ],
  },
];
