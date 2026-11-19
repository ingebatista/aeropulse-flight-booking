import { cardBrand, cardLast4, isValidLuhn } from '@backend/domain';
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { type ChargeRequest, type ChargeResult, PaymentGateway } from './payment-gateway';

/** Terminación de la tarjeta de prueba que se aprueba (`TEST_CARDS` en el contrato). */
const APPROVED_SUFFIX = '4242';

/**
 * Simulador sin red ni efectos externos: aprueba una tarjeta válida según Luhn
 * terminada en `4242` y rechaza las demás, incluida la de prueba terminada en
 * `0002`. No hay nada que compensar.
 */
@Injectable()
export class SimulatedPaymentGateway extends PaymentGateway {
  charge({ cardNumber }: ChargeRequest): Promise<ChargeResult> {
    if (!isValidLuhn(cardNumber) || !cardNumber.endsWith(APPROVED_SUFFIX)) {
      return Promise.resolve({ approved: false });
    }
    return Promise.resolve({
      approved: true,
      reference: `SIM-${randomUUID()}`,
      brand: cardBrand(cardNumber),
      last4: cardLast4(cardNumber),
    });
  }
}
