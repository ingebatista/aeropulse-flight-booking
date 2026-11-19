import type { CardBrand } from '@backend/domain';

export interface ChargeRequest {
  /** Número completo. Solo vive en memoria durante el cobro: nunca se guarda ni se registra. */
  cardNumber: string;
  amountCop: number;
}

export type ChargeResult =
  { approved: true; reference: string; brand: CardBrand; last4: string } | { approved: false };

/**
 * Puerto de pago (arch §3.1 y §4.4). Hoy lo implementa un simulador en proceso;
 * un proveedor real sería otro adaptador. Se llama **antes** de abrir la
 * transacción de la confirmación, para no retener bloqueos de fila.
 */
export abstract class PaymentGateway {
  abstract charge(request: ChargeRequest): Promise<ChargeResult>;
}
