import type { ErrorResponse, ValidationErrorField } from '@aeropulse/shared';
import { ApiError } from '../errors/api-error';
import { SearchFlightsQueryDto } from '../search-flights.query';
import { ApiValidationPipe } from './api-validation.pipe';
import { isRealDate } from './validators';

async function fieldsOf(query: unknown): Promise<ValidationErrorField[]> {
  const pipe = new ApiValidationPipe();
  try {
    await pipe.transform(query, { type: 'query', metatype: SearchFlightsQueryDto });
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    const { code, fields } = ((error as ApiError).getResponse() as ErrorResponse).error;
    expect(code).toBe('VALIDATION_ERROR');
    return fields ?? [];
  }
  return [];
}

const VALID = { origin: 'BOG', destination: 'MDE', date: '2026-11-19' };

describe('ApiValidationPipe', () => {
  it('acepta una consulta válida', async () => {
    expect(await fieldsOf(VALID)).toEqual([]);
  });

  it.each([
    ['ausente', { ...VALID, date: undefined }, [{ field: 'query.date', reason: 'REQUIRED' }]],
    ['nulo', { ...VALID, origin: null }, [{ field: 'query.origin', reason: 'REQUIRED' }]],
    ['en minúsculas', { ...VALID, origin: 'bog' }, [{ field: 'query.origin', reason: 'INVALID' }]],
    [
      'fuera del catálogo',
      { ...VALID, origin: 'CLO' },
      [{ field: 'query.origin', reason: 'INVALID' }],
    ],
    [
      'fecha inexistente',
      { ...VALID, date: '2026-02-30' },
      [{ field: 'query.date', reason: 'INVALID' }],
    ],
    [
      'fecha con formato libre',
      { ...VALID, date: '18/11/2026' },
      [{ field: 'query.date', reason: 'INVALID' }],
    ],
    ['de otro tipo', { ...VALID, date: 20261119 }, [{ field: 'query.date', reason: 'INVALID' }]],
    [
      'repetido',
      { ...VALID, date: ['2026-11-19', '2026-11-20'] },
      [{ field: 'query.date', reason: 'DUPLICATE' }],
    ],
    ['desconocido', { ...VALID, foo: '1' }, [{ field: 'query.foo', reason: 'UNEXPECTED' }]],
    [
      'destino igual al origen',
      { ...VALID, destination: 'BOG' },
      [{ field: 'query.destination', reason: 'INVALID' }],
    ],
  ])('parámetro %s', async (_name, query, expected) => {
    expect(await fieldsOf(query)).toEqual(expected);
  });

  it('informa cada campo una sola vez y en orden', async () => {
    const fields = await fieldsOf({ origin: 'XXX', destination: 'YYY', date: 'nope', extra: 'a' });

    expect(fields.map((f) => f.field).sort()).toEqual(
      ['query.date', 'query.destination', 'query.extra', 'query.origin'].sort(),
    );
    expect(new Set(fields.map((f) => f.field)).size).toBe(fields.length);
  });

  it('no repite el valor recibido en la respuesta', async () => {
    const pipe = new ApiValidationPipe();
    const secret = 'valor-secreto-zzz';
    let body = '';
    try {
      await pipe.transform(
        { ...VALID, origin: secret },
        { type: 'query', metatype: SearchFlightsQueryDto },
      );
    } catch (error) {
      body = JSON.stringify((error as ApiError).getResponse());
    }
    expect(body).not.toContain(secret);
  });
});

describe('isRealDate', () => {
  it.each(['2026-11-19', '2028-02-29', '2026-12-31'])('acepta %s', (value) => {
    expect(isRealDate(value)).toBe(true);
  });

  it.each(['2026-02-29', '2026-13-01', '2026-00-10', '2026-11-31', '2026-1-1', '', 5, null])(
    'rechaza %s',
    (value) => {
      expect(isRealDate(value)).toBe(false);
    },
  );
});
