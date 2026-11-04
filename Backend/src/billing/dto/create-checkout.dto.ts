import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { BILLING_CURRENCIES, BILLING_INTERVALS, PLAN_CODES } from '../plans/billing.plans';
import type { BillingCurrency, BillingInterval, PlanCode } from '../plans/billing.plans';

export class CreateCheckoutDto {
  @IsIn([...PLAN_CODES], { message: 'plan is not a valid plan' })
  plan: PlanCode;

  @IsIn([...BILLING_INTERVALS], { message: 'interval must be monthly or yearly' })
  interval: BillingInterval;

  @IsIn([...BILLING_CURRENCIES], { message: 'currency must be NGN or USD' })
  currency: BillingCurrency;

  /** Number of vehicles. Only used by per-vehicle plans (Fleet). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  quantity?: number;
}