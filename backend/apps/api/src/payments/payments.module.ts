import { Module } from '@nestjs/common';
import { PaymentGateway } from './payment-gateway';
import { SimulatedPaymentGateway } from './simulated-payment-gateway';

@Module({
  providers: [{ provide: PaymentGateway, useClass: SimulatedPaymentGateway }],
  exports: [PaymentGateway],
})
export class PaymentsModule {}
