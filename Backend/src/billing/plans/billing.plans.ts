export const PLAN_CODES = ['owner_pro', 'fleet'] as const;
export const BILLING_INTERVALS = ['monthly', 'yearly'] as const;
export const BILLING_CURRENCIES = ['NGN', 'USD'] as const;

export type PlanCode = (typeof PLAN_CODES)[number];
export type BillingInterval = (typeof BILLING_INTERVALS)[number];
export type BillingCurrency = (typeof BILLING_CURRENCIES)[number];

export interface PlanDefinition {
  code: PlanCode;
  name: string;
  description: string;
  /** true: the price is per vehicle and multiplied by the quantity chosen. */
  perVehicle: boolean;
  maxQuantity: number;
  /** Vehicles the plan covers (for flat plans). null = the quantity bought. */
  includedVehicles: number | null;
  /** Price in MINOR units (kobo / cents). Per vehicle when perVehicle is true. */
  prices: Record<BillingCurrency, Record<BillingInterval, number>>;
}

/** * GROUP DECISION: the prices below are PLACEHOLDERS to test. */
export const PLANS: Record<PlanCode, PlanDefinition> = {
  owner_pro: {
    code: 'owner_pro',
    name: 'Owner Pro',
    description: 'For owners with a few vehicles: all reminders, exports and records.',
    perVehicle: false,
    maxQuantity: 1,
    includedVehicles: 5,
    prices: {
      NGN: { monthly: 600_000, yearly: 6_000_000 },
      USD: { monthly: 900, yearly: 9_000 },
    },
  },
  fleet: {
    code: 'fleet',
    name: 'Fleet',
    description: 'For fleet owners: priced per vehicle, with driver seats and reports.',
    perVehicle: true,
    maxQuantity: 200,
    includedVehicles: null,
    prices: {
      NGN: { monthly: 250_000, yearly: 2_500_000 },
      USD: { monthly: 500, yearly: 5_000 },
    },
  },
};

/** The exact amount to charge, in minor units. Throws if. */
export function priceInMinorUnits(
  plan: PlanDefinition,
  currency: BillingCurrency,
  interval: BillingInterval,
  quantity: number,
): number {
  const units = plan.perVehicle ? quantity : 1;
  const total = plan.prices[currency][interval] * units;

  if (!Number.isSafeInteger(units) || units < 1 || !Number.isSafeInteger(total) || total <= 0) {
    throw new Error('Invalid price');
  }
  return total;
}