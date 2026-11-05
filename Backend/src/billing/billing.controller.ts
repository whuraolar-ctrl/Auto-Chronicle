import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { User } from '@supabase/supabase-js';
import type { Request } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { BillingService } from './billing.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { VerifyPaymentQueryDto } from './dto/verify-payment-query.dto';

@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  /** GET /api/billing/plans: public, so a pricing page can load before login. */
  @Get('plans')
  plans() {
    return this.billing.plans();
  }

  /** GET /api/billing/subscription: the signed-in person's current plan. */
  @Get('subscription')
  @UseGuards(SupabaseAuthGuard)
  subscription(@CurrentUser() user: User) {
    return this.billing.getSubscription(user.id);
  }

  /** Start a Paystack checkout. */
  @Post('checkout')
  @HttpCode(200)
  @UseGuards(SupabaseAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  checkout(@CurrentUser() user: User, @Body() dto: CreateCheckoutDto) {
    return this.billing.createCheckout(user, dto);
  }

  /** Verify a payment reference after the popup closes. */
  @Get('verify')
  @UseGuards(SupabaseAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  verify(@CurrentUser() user: User, @Query() query: VerifyPaymentQueryDto) {
    return this.billing.verifyAndSettle(query.reference, user.id);
  }

  /** Receive Paystack payment webhook events. */
  @Post('webhook')
  @HttpCode(200)
  @SkipThrottle()
  webhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-paystack-signature') signature?: string,
  ) {
    return this.billing.handleWebhook(request.rawBody, signature);
  }
}