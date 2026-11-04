import {
  BadGatewayException,
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface PaystackInitializeInput {
  email: string;
  amountMinor: number;
  currency: string;
  reference: string;
  callbackUrl: string;
  metadata: Record<string, unknown>;
}

export interface PaystackInitialized {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
}

export interface PaystackVerification {
  /** 'success', 'failed', 'abandoned', 'pending' ... as Paystack reports it. */
  status: string;
  reference: string;
  amountMinor: number;
  currency: string;
  transactionId: string;
  paidAt: string | null;
}

interface PaystackEnvelope {
  status?: boolean;
  message?: string;
  data?: Record<string, unknown>;
}

/** A small wrapper around the Paystack web API. Nothing else. */
@Injectable()
export class PaystackClient {
  private readonly logger = new Logger(PaystackClient.name);
  private readonly baseUrl = 'https://api.paystack.co';

  constructor(private readonly config: ConfigService) {}

  /** * ACCOUNT OWNER: when the Paystack account is ready, copy. */
  getSecretKey(): string | null {
    const key = this.config.get<string>('PAYSTACK_SECRET_KEY')?.trim();
    return key ? key : null;
  }

  /** False until the secret key is set. Payment routes then. */
  isConfigured(): boolean {
    return this.getSecretKey() !== null;
  }

  async initialize(input: PaystackInitializeInput): Promise<PaystackInitialized> {
    const { ok, json } = await this.call('POST', '/transaction/initialize', {
      email: input.email,
      amount: input.amountMinor, // Paystack wants the smallest unit (kobo / cents)
      currency: input.currency,
      reference: input.reference,
      callback_url: input.callbackUrl,
      metadata: input.metadata,
    });

    const data = json?.data;
    if (
      !ok ||
      !data ||
      typeof data.authorization_url !== 'string' ||
      typeof data.access_code !== 'string'
    ) {
      this.logger.warn('Paystack did not return a checkout for the transaction');
      throw new BadGatewayException('The payment provider could not start the payment');
    }

    return {
      authorizationUrl: data.authorization_url,
      accessCode: data.access_code,
      reference: String(data.reference ?? input.reference),
    };
  }

  /** Asks Paystack what really happened to a payment. Never trust. */
  async verify(reference: string): Promise<PaystackVerification> {
    const { ok, status, json } = await this.call(
      'GET',
      `/transaction/verify/${encodeURIComponent(reference)}`,
    );

    // The customer has not started paying yet, so Paystack does.
    if (status === 404 || (!ok && status === 400)) {
      return { status: 'pending', reference, amountMinor: 0, currency: '', transactionId: '', paidAt: null };
    }

    const data = json?.data;
    if (!ok || !data) {
      throw new BadGatewayException('The payment provider could not confirm the payment');
    }

    return {
      status: String(data.status ?? 'pending'),
      reference: String(data.reference ?? reference),
      amountMinor: Number(data.amount ?? 0),
      currency: String(data.currency ?? '').toUpperCase(),
      transactionId: data.id !== undefined ? String(data.id) : '',
      paidAt: typeof data.paid_at === 'string' ? data.paid_at : null,
    };
  }

  private async call(method: 'GET' | 'POST', path: string, payload?: unknown) {
    const key = this.getSecretKey();
    if (!key) {
      throw new ServiceUnavailableException('Payments are not available yet');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: payload === undefined ? undefined : JSON.stringify(payload),
        signal: controller.signal,
      });

      const json = (await response.json().catch(() => null)) as PaystackEnvelope | null;
      return {
        ok: response.ok && json?.status === true,
        status: response.status,
        json,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.warn(`Paystack ${method} ${path} could not be reached`);
      throw new BadGatewayException('The payment provider could not be reached');
    } finally {
      clearTimeout(timer);
    }
  }
}