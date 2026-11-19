import type { AdminFlightStatus, FlightStatus } from '@aeropulse/shared';
import {
  allowedOrigins,
  canChangeFlightStatus,
  decideStatusChange,
  type StatusChangeDecision,
} from './transitions';

describe('transiciones del vuelo', () => {
  const cases: Array<[FlightStatus, AdminFlightStatus, StatusChangeDecision]> = [
    ['SCHEDULED', 'DELAYED', 'ALLOWED'],
    ['SCHEDULED', 'CANCELLED', 'ALLOWED'],
    ['DELAYED', 'CANCELLED', 'ALLOWED'],
    ['DELAYED', 'DELAYED', 'UNCHANGED'],
    ['CANCELLED', 'CANCELLED', 'UNCHANGED'],
    ['CANCELLED', 'DELAYED', 'INVALID_TRANSITION'],
  ];

  it.each(cases)('%s → %s: %s', (from, to, expected) => {
    expect(decideStatusChange(from, to)).toBe(expected);
    expect(canChangeFlightStatus(from, to)).toBe(expected === 'ALLOWED');
  });

  it('los orígenes permitidos son el filtro del UPDATE condicional', () => {
    expect(allowedOrigins('DELAYED')).toEqual(['SCHEDULED']);
    expect(allowedOrigins('CANCELLED')).toEqual(['SCHEDULED', 'DELAYED']);
  });

  it('CANCELLED es terminal', () => {
    for (const to of ['DELAYED', 'CANCELLED'] as const) {
      expect(canChangeFlightStatus('CANCELLED', to)).toBe(false);
    }
  });
});
