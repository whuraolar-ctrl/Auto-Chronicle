import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  Crown,
  Shield,
  Truck,
  Zap,
} from 'lucide-react';
import '../components/pricing/pricing.css';

type BillingCycle = 'monthly' | 'yearly';

interface Plan {
  id: string;
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  currency: string;
  badge?: string;
  featured?: boolean;
  cta: string;
  ctaVariant: 'ghost' | 'primary' | 'gold';
  icon: React.ReactNode;
  features: string[];
  limits?: string[];
}

const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    description:
      'For individual car owners who need basic vehicle and expense management.',
    monthlyPrice: 0,
    yearlyPrice: 0,
    currency: 'NGN',
    cta: 'Get started free',
    ctaVariant: 'ghost',
    icon: <Zap size={22} />,
    features: [
      'Add and manage 1 vehicle',
      'Vehicle profile',
      'Basic fuel and expense tracking',
      'Basic maintenance reminders',
      'Basic service and repair history',
      'Monthly expense summaries',
      'Access to basic car maintenance tips',
    ],
    limits: [
      'No advanced analytics',
      'No Car Fund / savings goals',
      'No fleet or driver tools',
    ],
  },
  {
    id: 'premium',
    name: 'Premium',
    description:
      'For individual car owners who want more comprehensive vehicle management and financial planning.',
    monthlyPrice: 2500,
    yearlyPrice: 25000,
    currency: 'NGN',
    badge: 'Most Popular',
    featured: true,
    cta: 'Start Premium',
    ctaVariant: 'gold',
    icon: <Shield size={22} />,
    features: [
      'Add and manage up to 3 vehicles',
      'Unlimited expense and fuel tracking',
      'Advanced maintenance reminders',
      'Full service and repair history',
      'Weekly, monthly and yearly spending analytics',
      'Repair pattern analysis',
      'Predictive maintenance insights',
      'Repair versus replacement recommendations',
      'Car Reserve / Emergency Fund',
      'Savings goals for maintenance, repairs and future purchases',
      'Downloadable expense reports',
      'Priority customer support',
    ],
  },
  {
    id: 'fleet',
    name: 'Fleet',
    description:
      'For individuals and businesses managing multiple vehicles.',
    monthlyPrice: 5000,
    yearlyPrice: 50000,
    currency: 'NGN',
    badge: 'For teams',
    cta: 'Start Fleet',
    ctaVariant: 'primary',
    icon: <Truck size={22} />,
    features: [
      'Unlimited vehicles',
      'Centralised expense tracking across vehicles',
      'Maintenance schedules and reminders',
      'Individual vehicle service and repair histories',
      'Driver and vehicle records',
      'Fleet spending dashboard',
      'Vehicle performance reports',
      'Maintenance cost comparisons',
      'Repair pattern analysis',
      'Downloadable fleet expense reports',
    ],
  },
];

function formatPrice(amount: number, currency: string): string {
  if (amount === 0) return 'Free';
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function PricingPage() {
  const [cycle, setCycle] = useState<BillingCycle>('monthly');

  return (
    <div className="pricing-root">
      <div className="pricing-wrap">
        <header className="pricing-header">
          <Link to="/dashboard" className="pricing-back">
            <ArrowLeft size={16} />
            Back to app
          </Link>

          <div className="pricing-hero">
            <p className="pricing-eyebrow">Simple, transparent pricing</p>
            <h1>Know your car. Plan your cash.</h1>
            <p className="pricing-sub">
              Start free. Upgrade when you need more vehicles, deeper insights,
              or fleet tools. Cancel anytime.
            </p>
          </div>

          <div className="pricing-toggle" role="group" aria-label="Billing cycle">
            <button
              type="button"
              className={cycle === 'monthly' ? 'active' : ''}
              onClick={() => setCycle('monthly')}
            >
              Monthly
            </button>
            <button
              type="button"
              className={cycle === 'yearly' ? 'active' : ''}
              onClick={() => setCycle('yearly')}
            >
              Yearly
              <span className="pricing-save">Save \~17%</span>
            </button>
          </div>
        </header>

        <div className="pricing-grid">
          {PLANS.map((plan) => {
            const price =
              cycle === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice;
            const period = cycle === 'monthly' ? '/month' : '/year';

            return (
              <article
                key={plan.id}
                className={`pricing-card ${plan.featured ? 'featured' : ''}`}
              >
                {plan.badge && (
                  <div className="pricing-badge">
                    {plan.featured && <Crown size={12} />}
                    {plan.badge}
                  </div>
                )}

                <div className="pricing-card-icon">{plan.icon}</div>
                <h2>{plan.name}</h2>
                <p className="pricing-desc">{plan.description}</p>

                <div className="pricing-price">
                  <span className="amount">
                    {formatPrice(price, plan.currency)}
                  </span>
                  {price > 0 && <span className="period">{period}</span>}
                </div>

                {cycle === 'yearly' && price > 0 && (
                  <p className="pricing-yearly-note">
                    {formatPrice(Math.round(price / 12), plan.currency)}/mo
                    billed yearly
                  </p>
                )}

                <button
                  type="button"
                  className={`pricing-cta ${plan.ctaVariant}`}
                  onClick={() => {
                    console.log(`Selected plan: \( {plan.id} ( \){cycle})`);
                    alert(
                      `You selected \( {plan.name} ( \){cycle}). Payment integration next.`,
                    );
                  }}
                >
                  {plan.cta}
                </button>

                <ul className="pricing-features">
                  {plan.features.map((feature) => (
                    <li key={feature}>
                      <Check size={16} className="check" />
                      <span>{feature}</span>
                    </li>
                  ))}
                  {(plan.limits ?? []).map((limit) => (
                    <li key={limit} className="limit">
                      <span className="dash">—</span>
                      <span>{limit}</span>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>

        <section className="pricing-trust">
          <div className="trust-item">
            <Shield size={18} />
            <div>
              <strong>Secure payments</strong>
              <p>Powered by Paystack. Cards, bank transfer & USSD.</p>
            </div>
          </div>
          <div className="trust-item">
            <Zap size={18} />
            <div>
              <strong>Cancel anytime</strong>
              <p>No lock-in. Downgrade or leave whenever you want.</p>
            </div>
          </div>
          <div className="trust-item">
            <Crown size={18} />
            <div>
              <strong>14-day money-back</strong>
              <p>Not satisfied? Full refund, no questions asked.</p>
            </div>
          </div>
        </section>

        <p className="pricing-footnote">
          Prices in Nigerian Naira (NGN).
        </p>
      </div>
    </div>
  );
}
