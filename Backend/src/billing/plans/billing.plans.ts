export const PLAN_CODES = ['premium', 'fleet'] as const;
export const BILLING_INTERVALS = ['monthly', 'yearly'] as const;
export const BILLING_CURRENCIES = ['NGN', 'USD'] as const;

export type PlanCode = (typeof PLAN_CODES)[number];
export type BillingInterval = (typeof BILLING_INTERVALS)[number];
export type BillingCurrency = (typeof BILLING_CURRENCIES)[number];

/** Free tier (no active paid subscription). */
export const FREE_TIER = {
  maxVehicles: 1,
  canUseFleet: false,
  canInviteDrivers: false,
  canExport: false,
} as const;

/** Practically unlimited for Fleet plan checks. */
export const UNLIMITED_VEHICLES = 100_000;

export interface PlanDefinition {
  code: PlanCode;
  name: string;
  description: string;
  perVehicle: boolean;
  maxQuantity: number;
  /** null = unlimited (Fleet). */
  includedVehicles: number | null;
  canUseFleet: boolean;
  canInviteDrivers: boolean;
  canExport: boolean;
  /** Prices in MINOR units (kobo / cents). */
  prices: Record<BillingCurrency, Record<BillingInterval, number>>;
}

export const PLANS: Record<PlanCode, PlanDefinition> = {
  premium: {
    code: 'premium',
    name: 'Premium',
    description:
      'For individual car owners who want full vehicle management and financial planning.',
    perVehicle: false,
    maxQuantity: 1,
    includedVehicles: 3,
    canUseFleet: false,
    canInviteDrivers: false,
    canExport: true,
    prices: {
      NGN: { monthly: 250_000, yearly: 2_500_000 }, // ₦2,500 / ₦25,000
      USD: { monthly: 200, yearly: 2_000 },
    },
  },
  fleet: {
    code: 'fleet',
    name: 'Fleet',
    description: 'For individuals and businesses managing multiple vehicles.',
    perVehicle: false,
    maxQuantity: 1,
    includedVehicles: null, // unlimited
    canUseFleet: true,
    canInviteDrivers: true,
    canExport: true,
    prices: {
      NGN: { monthly: 500_000, yearly: 5_000_000 }, // ₦5,000 / ₦50,000
      USD: { monthly: 400, yearly: 4_000 },
    },
  },
};

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
