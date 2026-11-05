import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { User } from '@supabase/supabase-js';
import { SupabaseService } from '../supabase/supabase.service';
import { PLANS, PlanCode, priceInMinorUnits } from './plans/billing.plans';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { PaystackClient } from '../common/paystack/paystack.client';

/** Accept only payment references we issued ourselves. */
const REFERENCE_PATTERN = /^AC-[A-Za-z0-9-]{8,80}$/;
/** Max unfinished checkouts per user per hour. */
const MAX_PENDING_PER_HOUR = 10;

type PaymentRow = {
  id: string;
  user_id: string;
  status: 'pending' | 'succeeded' | 'failed' | 'refunded';
  amount: number | string;
  currency: string;
};

export type PaymentOutcome = {
  status: 'succeeded' | 'pending' | 'failed' | 'refunded';
  subscription: Awaited<ReturnType<BillingService['getSubscription']>> | null;
};

@Injectable()
export class BillingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BillingService.name);
  private expiryTimer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly supabase: SupabaseService,
    private readonly paystack: PaystackClient,
    private readonly config: ConfigService,
  ) {}

  // Cleanup expired subscriptions.

  onModuleInit() {
    void this.expireLapsed();
    this.expiryTimer = setInterval(() => void this.expireLapsed(), 60 * 60 * 1000);
    // Keep the timer from blocking shutdown.
    (this.expiryTimer as unknown as { unref?: () => void }).unref?.();
  }

  onModuleDestroy() {
    if (this.expiryTimer) clearInterval(this.expiryTimer);
  }

  private async expireLapsed() {
    const { error } = await this.supabase.admin.rpc('expire_lapsed_subscriptions');
    if (error) this.logger.warn('Could not expire lapsed subscriptions yet');
  }

  // Billing reads.

  /** Pricing shown to users; amounts are in major units. */
  plans() {
    return Object.values(PLANS).map((plan) => ({
      code: plan.code,
      name: plan.name,
      description: plan.description,
      perVehicle: plan.perVehicle,
      maxQuantity: plan.maxQuantity,
      includedVehicles: plan.includedVehicles,
      prices: {
        NGN: {
          monthly: plan.prices.NGN.monthly / 100,
          yearly: plan.prices.NGN.yearly / 100,
        },
        USD: {
          monthly: plan.prices.USD.monthly / 100,
          yearly: plan.prices.USD.yearly / 100,
        },
      },
    }));
  }

  async getSubscription(userId: string) {
    const { data, error } = await this.supabase.admin
      .from('subscriptions')
      .select('plan, status, currency, amount, billing_interval, quantity, current_period_end')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();

    if (error) throw new InternalServerErrorException('Unable to load your subscription');
    if (!data) {
      return { plan: 'free', planName: 'Free', status: 'free' as const };
    }

    const end = new Date(String(data.current_period_end));
    const stillPaid = end.getTime() > Date.now();

    return {
      plan: String(data.plan),
      planName: PLANS[data.plan as PlanCode]?.name ?? String(data.plan),
      status: (stillPaid ? 'active' : 'expired') as 'active' | 'expired',
      billingInterval: String(data.billing_interval),
      quantity: Number(data.quantity),
      currency: String(data.currency),
      amount: Number(data.amount),
      currentPeriodEnd: end.toISOString(),
      daysLeft: stillPaid ? Math.ceil((end.getTime() - Date.now()) / 86_400_000) : 0,
    };
  }

  // Step 1: start a payment.

  async createCheckout(user: User, dto: CreateCheckoutDto) {
    if (!this.paystack.isConfigured()) {
      throw new ServiceUnavailableException(
        'Payments are not available yet. Please try again later.',
      );
    }
    if (!user.email) {
      throw new BadRequestException('Your account needs an email address before you can pay');
    }

    const plan = PLANS[dto.plan];
    const quantity = plan.perVehicle ? (dto.quantity ?? 1) : 1;
    if (quantity < 1 || quantity > plan.maxQuantity) {
      throw new BadRequestException(`Choose between 1 and ${plan.maxQuantity} vehicles`);
    }

    // Server-side pricing is authoritative; the client cannot override it.
    let amountMinor: number;
    try {
      amountMinor = priceInMinorUnits(plan, dto.currency, dto.interval, quantity);
    } catch {
      throw new BadRequestException('That plan cannot be bought');
    }

    // Prevent checkout spam by limiting pending payments per hour.
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error: countError } = await this.supabase.admin
      .from('payments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .gte('created_at', since);
    if (countError) throw new InternalServerErrorException('Unable to start the payment');
    if ((count ?? 0) >= MAX_PENDING_PER_HOUR) {
      throw new HttpException(
        'You have too many unfinished payments. Please wait a little and try again.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Save the pending payment first; it is the source of truth for amount and reference.
    const reference = `AC-${randomUUID()}`;
    const { error: insertError } = await this.supabase.admin.from('payments').insert({
      user_id: user.id,
      amount: amountMinor / 100,
      currency: dto.currency,
      status: 'pending',
      provider: 'paystack',
      provider_reference: reference,
      plan: plan.code,
      billing_interval: dto.interval,
      quantity,
    });
    if (insertError) throw new InternalServerErrorException('Unable to start the payment');

    try {
      // Redirect back here after a Paystack-hosted payment flow.
      const callbackUrl = `${this.config.getOrThrow<string>('FRONTEND_URL')}/billing/complete`;

      const checkout = await this.paystack.initialize({
        email: user.email,
        amountMinor,
        currency: dto.currency,
        reference,
        callbackUrl,
        metadata: { userId: user.id, plan: plan.code, interval: dto.interval, quantity },
      });

      return {
        reference,
        accessCode: checkout.accessCode,
        authorizationUrl: checkout.authorizationUrl,
        amount: amountMinor / 100,
        currency: dto.currency,
      };
    } catch (error) {
      await this.supabase.admin
        .from('payments')
        .update({ status: 'failed', failure_reason: 'could_not_start' })
        .eq('provider', 'paystack')
        .eq('provider_reference', reference)
        .eq('status', 'pending');
      throw error;
    }
  }

  
  // Step 2: confirm and settle a payment.
  /**
   * Verify the payment with Paystack and apply it once.
   * `userId` restricts checks to the signed-in user's own payment.
   */
  async verifyAndSettle(reference: string, userId?: string): Promise<PaymentOutcome> {
    if (typeof reference !== 'string' || !REFERENCE_PATTERN.test(reference)) {
      throw new BadRequestException('Invalid payment reference');
    }

    const payment = await this.findPayment(reference);
    if (!payment || (userId && payment.user_id !== userId)) {
      throw new NotFoundException('Payment not found');
    }

    // Ignore already settled or closed payments; they cannot be credited twice.
    if (payment.status !== 'pending') {
      return {
        status: payment.status,
        subscription:
          payment.status === 'succeeded' ? await this.getSubscription(payment.user_id) : null,
      };
    }

    const verification = await this.paystack.verify(reference);

    if (verification.status === 'success') {
      
      const { error } = await this.supabase.admin.rpc('settle_payment', {
        p_reference: reference,
        p_amount_minor: verification.amountMinor,
        p_currency: verification.currency,
        p_provider_transaction_id: verification.transactionId || null,
        p_paid_at: verification.paidAt,
      });
      if (error) await this.handleSettleError(error.message, reference);

      return {
        status: 'succeeded',
        subscription: await this.getSubscription(payment.user_id),
      };
    }

    if (verification.status === 'failed') {
      await this.supabase.admin
        .from('payments')
        .update({ status: 'failed', failure_reason: 'declined' })
        .eq('provider', 'paystack')
        .eq('provider_reference', reference)
        .eq('status', 'pending');
      return { status: 'failed', subscription: null };
    }

    // Leave pending payments alone while verification is still in progress.
    return { status: 'pending', subscription: null };
  }

  private async handleSettleError(message: string, reference: string): Promise<never> {
    switch (message) {
      case 'AMOUNT_MISMATCH':
        // Reject mismatched amount/currency before crediting anything.
        this.logger.error(`SECURITY: amount or currency mismatch for ${reference}`);
        await this.supabase.admin
          .from('payments')
          .update({ status: 'failed', failure_reason: 'amount_mismatch' })
          .eq('provider', 'paystack')
          .eq('provider_reference', reference)
          .eq('status', 'pending');
        throw new BadRequestException(
          'The amount paid did not match the plan, so it was not applied. Please contact support.',
        );
      case 'UNKNOWN_REFERENCE':
        throw new NotFoundException('Payment not found');
      case 'EMPTY_REFERENCE':
      case 'EMPTY_AMOUNT':
      case 'PAYMENT_NOT_PENDING':
        this.logger.warn(`Refused to apply ${reference}: ${message}`);
        throw new BadRequestException('This payment cannot be applied');
      default:
        this.logger.error(`Could not settle ${reference}`);
        throw new InternalServerErrorException('Unable to confirm the payment');
    }
  }

  private async findPayment(reference: string): Promise<PaymentRow | null> {
    const { data, error } = await this.supabase.admin
      .from('payments')
      .select('id, user_id, status, amount, currency')
      .eq('provider', 'paystack')
      .eq('provider_reference', reference)
      .maybeSingle();

    if (error) throw new InternalServerErrorException('Unable to load the payment');
    return (data as PaymentRow | null) ?? null;
  }

  // Paystack sends webhook notifications when a charge succeeds.

  async handleWebhook(rawBody: Buffer | undefined, signature: string | undefined) {
    if (!this.paystack.isConfigured()) {
      throw new ServiceUnavailableException('Payments are not available yet');
    }
    // Verify the payload signature before doing anything.
    if (!rawBody || !this.hasValidSignature(rawBody, signature)) {
      throw new UnauthorizedException('Invalid signature');
    }

    let event: { event?: string; data?: { reference?: unknown } };
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new BadRequestException('Invalid payload');
    }

    // Only successful charges trigger settlement.
    if (event.event !== 'charge.success') return { received: true };

    // Ignore empty or unexpected references.
    const reference = event.data?.reference;
    if (typeof reference !== 'string' || !REFERENCE_PATTERN.test(reference)) {
      return { received: true };
    }

    // Confirm with Paystack and settle once, even if the webhook is trusted.
    try {
      await this.verifyAndSettle(reference);
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        // Confirm the issue so Paystack stops retrying.
        this.logger.warn(`Webhook for ${reference} was not applied`);
        return { received: true };
      }
      // Retry transient failures so Paystack can resend later.
      throw error;
    }

    return { received: true };
  }

  private hasValidSignature(rawBody: Buffer, signature: string | undefined): boolean {
    const secret = this.paystack.getSecretKey();
    if (!secret || !signature) return false;

    const expected = createHmac('sha512', secret).update(rawBody).digest('hex');
    const received = Buffer.from(signature, 'utf8');
    const wanted = Buffer.from(expected, 'utf8');

    return received.length === wanted.length && timingSafeEqual(received, wanted);
  }
}