import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  BadgeCheck,
  Check,
  Loader2,
  Minus,
  ShieldAlert,
  X,
} from 'lucide-react';

import { api } from '../services/api';

/** Shape returned by GET /api/billing/plans */
interface PlanDto {
  code: 'owner_pro' | 'fleet';
  name: string;
  description: string;
  perVehicle: boolean;
  maxQuantity: number;
  includedVehicles: number | null;
  prices: {
    NGN: { monthly: number; yearly: number };
    USD: { monthly: number; yearly: number };
  };
}

/** Shape returned by GET /api/billing/subscription */
interface SubscriptionDto {
  plan?: string;
  planName?: string;
  status?: string;
  daysLeft?: number;
}

type Currency = 'NGN' | 'USD';
type Interval = 'monthly' | 'yearly';

const CURRENCY_SYMBOL: Record<Currency, string> = { NGN: '₦', USD: '$' };

function formatPrice(amount: number, currency: Currency): string {
  return `${CURRENCY_SYMBOL[currency]}${amount.toLocaleString('en-NG', {
    maximumFractionDigits: 0,
  })}`;
}

/** What each plan includes and where it stops. Shown verbatim on the cards. */
const PLAN_FEATURES: Record<PlanDto['code'], string[]> = {
  owner_pro: [
    'Up to 5 vehicles on one account',
    'Service-due and insurance-expiry reminders',
    'Full repair and expense history with exports',
    'Expense analytics and monthly trends',
    'Car Fund savings goals',
    'Issue and driver reports',
  ],
  fleet: [
    'Unlimited vehicles — priced per vehicle',
    'Everything in Owner Pro, for every vehicle',
    'Driver seats with fleet invitations',
    'Fleet dashboard across all vehicles',
    'Driver report triage: log, convert or dismiss',
    'Priority support',
  ],
};

const PLAN_LIMITS: Record<PlanDto['code'], string[]> = {
  owner_pro: [
    'No driver seats or invitations',
    'Hard limit of 5 vehicles',
    'Single owner account only',
    'Standard email support',
  ],
  fleet: [
    'No hard vehicle cap, but every vehicle is billed',
    'Drivers cannot manage billing',
    'Price scales with fleet size',
  ],
};

export default function PricingPage() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<PlanDto[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionDto | null>(
    null,
  );
  const [currency, setCurrency] = useState<Currency>('NGN');
  const [interval, setInterval] = useState<Interval>('monthly');
  const [fleetQuantity, setFleetQuantity] = useState(5);
  const [loading, setLoading] = useState(true);
  const [checkoutPlan, setCheckoutPlan] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [signedIn, setSignedIn] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const plansResponse = await api.get<PlanDto[]>('/billing/plans');
        setPlans(plansResponse.data);
      } catch {
        setError('Unable to load the plans right now. Please refresh.');
      }

      // The subscription call only works when signed in; failing is not fatal here.
      try {
        const sub = await api.get<SubscriptionDto>('/billing/subscription');
        setSubscription(sub.data);
      } catch {
        setSignedIn(false);
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  const yearlySavings = useMemo(() => {
    const message = new Map<string, string>();
    for (const plan of plans) {
      const monthly = plan.prices[currency].monthly * 12;
      const yearly = plan.prices[currency].yearly;
      if (yearly < monthly) {
        const percent = Math.round(((monthly - yearly) / monthly) * 100);
        message.set(plan.code, `Save about ${percent}% paying yearly`);
      }
    }
    return message;
  }, [plans, currency]);

  function priceFor(plan: PlanDto): number {
    const unit = plan.prices[currency][interval];
    return plan.perVehicle ? unit * fleetQuantity : unit;
  }

  function planState(plan: PlanDto): 'current' | 'upgrade' | 'default' {
    if (subscription?.plan === plan.code && subscription.status === 'active') {
      return 'current';
    }
    return 'default';
  }

  async function startCheckout(plan: PlanDto) {
    if (!signedIn) {
      navigate('/login', { state: { from: '/pricing' } });
      return;
    }

    setError('');
    setCheckoutPlan(plan.code);

    try {
      const response = await api.post<{
        reference: string;
        authorizationUrl: string;
      }>('/billing/checkout', {
        plan: plan.code,
        currency,
        interval,
        ...(plan.perVehicle ? { quantity: fleetQuantity } : {}),
      });

      // Send the customer to Paystack's hosted checkout page. Paystack returns
      // them to FRONTEND_URL/billing/complete, where the payment is confirmed.
      window.location.assign(response.data.authorizationUrl);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Unable to start the payment.';
      setError(message);
      setCheckoutPlan(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#0d1b16] text-[#e9e6da]">
      {/* Gold ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(60%_60%_at_50%_0%,rgba(212,175,55,0.18),transparent)]"
      />

      <div className="relative mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <Link
          to="/dashboard"
          aria-label="Back to dashboard"
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#2c4438] text-[#c9c5b4] transition hover:bg-[#16261f]"
        >
          <ArrowLeft size={20} />
        </Link>

        <header className="mt-6 text-center">
          <p className="text-xs font-bold tracking-[0.22em] text-[#d4af37]">
            AUTO CHRONICLE
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-[#f4f1e6] sm:text-4xl">
            Choose your plan
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-[#a8a596] sm:text-base">
            Keep every vehicle's history, reminders and expenses in one place.
            Change or stop whenever you like — you only pay for the time you
            use.
          </p>

          {subscription?.plan && subscription.status === 'active' && (
            <div className="mx-auto mt-6 inline-flex items-center gap-2 rounded-full border border-[#2c4438] bg-[#16261f] px-4 py-2 text-sm text-[#d4af37]">
              <BadgeCheck size={16} />
              You are on {subscription.planName}
              {typeof subscription.daysLeft === 'number' &&
                ` — ${subscription.daysLeft} day${subscription.daysLeft === 1 ? '' : 's'} left`}
            </div>
          )}
        </header>

        {/* Currency and interval controls */}
        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <div
            role="group"
            aria-label="Currency"
            className="inline-flex rounded-xl border border-[#2c4438] bg-[#12211b] p-1"
          >
            {(['NGN', 'USD'] as Currency[]).map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setCurrency(code)}
                className={`rounded-lg px-5 py-2 text-sm font-semibold transition ${
                  currency === code
                    ? 'bg-[#d4af37] text-[#12211b]'
                    : 'text-[#a8a596] hover:text-[#e9e6da]'
                }`}
              >
                {code === 'NGN' ? '₦ Naira' : '$ Dollar'}
              </button>
            ))}
          </div>

          <div
            role="group"
            aria-label="Billing interval"
            className="inline-flex rounded-xl border border-[#2c4438] bg-[#12211b] p-1"
          >
            {(['monthly', 'yearly'] as Interval[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setInterval(value)}
                className={`rounded-lg px-5 py-2 text-sm font-semibold capitalize transition ${
                  interval === value
                    ? 'bg-[#d4af37] text-[#12211b]'
                    : 'text-[#a8a596] hover:text-[#e9e6da]'
                }`}
              >
                {value}
                {value === 'yearly' && (
                  <span className="ml-2 rounded-full bg-[#12211b] px-2 py-0.5 text-[10px] font-bold text-[#d4af37]">
                    2 months free
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="mx-auto mt-6 flex max-w-md items-start gap-2 rounded-xl border border-[#7a3b2e] bg-[#241512] px-4 py-3 text-sm text-[#f0b7a6]">
            <ShieldAlert size={18} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        {loading ? (
          <div className="mt-16 flex justify-center">
            <Loader2 className="animate-spin text-[#d4af37]" size={32} />
          </div>
        ) : (
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {plans.map((plan) => {
              const state = planState(plan);
              const isFleet = plan.perVehicle;

              return (
                <article
                  key={plan.code}
                  className={`relative flex flex-col rounded-3xl border p-6 transition sm:p-8 ${
                    state === 'current'
                      ? 'border-[#d4af37] bg-[#16261f] shadow-[0_0_0_1px_rgba(212,175,55,0.4),0_20px_60px_-30px_rgba(212,175,55,0.35)]'
                      : 'border-[#2c4438] bg-[#12211b] hover:border-[#3d5c4c]'
                  }`}
                >
                  {state === 'current' && (
                    <span className="absolute -top-3 left-8 rounded-full bg-[#d4af37] px-3 py-1 text-xs font-bold text-[#12211b]">
                      Your current plan
                    </span>
                  )}

                  <h2 className="text-xl font-semibold text-[#f4f1e6]">
                    {plan.name}
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-[#a8a596]">
                    {plan.description}
                  </p>

                  <div className="mt-6 flex items-end gap-2">
                    <span className="text-4xl font-bold tracking-tight text-[#d4af37]">
                      {formatPrice(priceFor(plan), currency)}
                    </span>
                    <span className="pb-1 text-sm text-[#a8a596]">
                      /{interval === 'monthly' ? 'month' : 'year'}
                      {isFleet &&
                        ` for ${fleetQuantity} vehicle${fleetQuantity === 1 ? '' : 's'}`}
                    </span>
                  </div>
                  {yearlySavings.has(plan.code) && interval === 'yearly' && (
                    <p className="mt-1 text-xs font-semibold text-[#8fd0a5]">
                      {yearlySavings.get(plan.code)}
                    </p>
                  )}

                  {/* Fleet: choose how many vehicles to pay for */}
                  {isFleet && (
                    <label className="mt-6 block text-sm">
                      <span className="text-[#a8a596]">
                        Vehicles to include
                      </span>
                      <div className="mt-2 flex items-center gap-3">
                        <button
                          type="button"
                          aria-label="Fewer vehicles"
                          onClick={() =>
                            setFleetQuantity((q) => Math.max(1, q - 1))
                          }
                          className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#2c4438] text-[#c9c5b4] transition hover:bg-[#1c3129] disabled:opacity-40"
                          disabled={fleetQuantity <= 1}
                        >
                          <Minus size={16} />
                        </button>
                        <input
                          type="number"
                          min={1}
                          max={plan.maxQuantity}
                          value={fleetQuantity}
                          onChange={(event) => {
                            const next = Number(event.target.value);
                            if (
                              Number.isInteger(next) &&
                              next >= 1 &&
                              next <= plan.maxQuantity
                            ) {
                              setFleetQuantity(next);
                            }
                          }}
                          className="w-20 rounded-lg border border-[#2c4438] bg-[#0d1b16] px-3 py-2 text-center text-[#f4f1e6] outline-none focus:border-[#d4af37]"
                        />
                        <button
                          type="button"
                          aria-label="More vehicles"
                          onClick={() =>
                            setFleetQuantity((q) =>
                              Math.min(plan.maxQuantity, q + 1),
                            )
                          }
                          className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#2c4438] text-[#c9c5b4] transition hover:bg-[#1c3129] disabled:opacity-40"
                          disabled={fleetQuantity >= plan.maxQuantity}
                        >
                          +
                        </button>
                      </div>
                      <span className="mt-2 block text-xs text-[#7d7a6c]">
                        Up to {plan.maxQuantity} vehicles. The price updates as
                        you change this.
                      </span>
                    </label>
                  )}

                  <h3 className="mt-8 text-xs font-bold uppercase tracking-[0.14em] text-[#8fd0a5]">
                    What's included
                  </h3>
                  <ul className="mt-3 space-y-2.5">
                    {PLAN_FEATURES[plan.code].map((feature) => (
                      <li
                        key={feature}
                        className="flex items-start gap-2.5 text-sm"
                      >
                        <Check
                          size={16}
                          className="mt-0.5 shrink-0 text-[#8fd0a5]"
                        />
                        <span className="text-[#d8d5c6]">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <h3 className="mt-6 text-xs font-bold uppercase tracking-[0.14em] text-[#c98a7a]">
                    Limitations
                  </h3>
                  <ul className="mt-3 space-y-2.5">
                    {PLAN_LIMITS[plan.code].map((limitation) => (
                      <li
                        key={limitation}
                        className="flex items-start gap-2.5 text-sm"
                      >
                        <X
                          size={16}
                          className="mt-0.5 shrink-0 text-[#c98a7a]"
                        />
                        <span className="text-[#b0ac9d]">{limitation}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    type="button"
                    onClick={() => void startCheckout(plan)}
                    disabled={checkoutPlan !== null || state === 'current'}
                    className={`mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold transition disabled:opacity-50 ${
                      state === 'current'
                        ? 'cursor-default border border-[#2c4438] text-[#a8a596]'
                        : 'bg-[#d4af37] text-[#12211b] hover:bg-[#e0bd4b]'
                    }`}
                  >
                    {checkoutPlan === plan.code && (
                      <Loader2 size={16} className="animate-spin" />
                    )}
                    {state === 'current'
                      ? 'Current plan'
                      : signedIn
                        ? `Continue with ${plan.name}`
                        : `Sign in to choose ${plan.name}`}
                  </button>
                </article>
              );
            })}
          </div>
        )}

        <p className="mt-10 text-center text-xs text-[#7d7a6c]">
          Payments are processed securely by Paystack. Your plan starts as soon
          as the payment is confirmed, and renewals keep the same start date —
          you never lose paid days when you top up early.
        </p>
      </div>
    </div>
  );
}
