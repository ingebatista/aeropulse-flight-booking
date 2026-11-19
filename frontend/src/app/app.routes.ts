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
    path: 'boletos',
    title: 'Consultar boleto | AeroPulse',
    loadComponent: () =>
      import('./features/checkout/ticket-lookup.component').then(
        ({ TicketLookupComponent }) => TicketLookupComponent,
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
        path: 'checkout',
        title: 'Confirmar reserva | AeroPulse',
        loadComponent: () =>
          import('./features/checkout/checkout.component').then(
            ({ CheckoutComponent }) => CheckoutComponent,
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
