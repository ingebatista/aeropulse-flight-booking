import { TEST_CARDS } from '@aeropulse/shared';
import { SimulatedPaymentGateway } from './simulated-payment-gateway';

describe('SimulatedPaymentGateway', () => {
  const gateway = new SimulatedPaymentGateway();
  const [approved, declined] = TEST_CARDS;

  it('aprueba la tarjeta de prueba terminada en 4242 con referencia, marca y últimos 4', async () => {
    const result = await gateway.charge({ cardNumber: approved.cardNumber, amountCop: 289_000 });

    expect(result).toMatchObject({ approved: true, brand: 'VISA', last4: '4242' });
    if (!result.approved) throw new Error('debía aprobarse');
    expect(result.reference).toMatch(/^SIM-[0-9a-f-]{36}$/);
    expect(result.reference.length).toBeLessThanOrEqual(40);
    // El resultado nunca lleva el número completo.
    expect(JSON.stringify(result)).not.toContain(approved.cardNumber);
  });

  it('rechaza la tarjeta de prueba terminada en 0002', async () => {
    expect(await gateway.charge({ cardNumber: declined.cardNumber, amountCop: 1 })).toEqual({
      approved: false,
    });
  });

  it('rechaza una tarjeta válida según Luhn con otra terminación', async () => {
    expect(await gateway.charge({ cardNumber: '5555555555554444', amountCop: 1 })).toEqual({
      approved: false,
    });
  });

  it('rechaza un número terminado en 4242 que no cumple Luhn', async () => {
    expect(await gateway.charge({ cardNumber: '4242424242414242', amountCop: 1 })).toEqual({
      approved: false,
    });
  });

  it('cada aprobación tiene una referencia distinta', async () => {
    const a = await gateway.charge({ cardNumber: approved.cardNumber, amountCop: 1 });
    const b = await gateway.charge({ cardNumber: approved.cardNumber, amountCop: 1 });
    expect(a).not.toEqual(b);
  });
});
