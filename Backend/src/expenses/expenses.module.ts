import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { VehicleAccessModule } from '../common/vehicle-access/vehicle-access.module';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { ExchangeRateService } from './exchange-rate.service';

@Module({
  imports: [VehicleAccessModule, BillingModule],
  controllers: [ExpensesController],
  providers: [ExpensesService, ExchangeRateService],
  exports: [ExpensesService],
})
export class ExpensesModule {}
