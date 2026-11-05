import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { PlanGuard } from './plan.guard';
import { PaystackClient } from '../common/paystack/paystack.client';

@Module({
  controllers: [BillingController],
  providers: [BillingService, PaystackClient, PlanGuard],
  exports: [BillingService, PlanGuard],
})
export class BillingModule {}
