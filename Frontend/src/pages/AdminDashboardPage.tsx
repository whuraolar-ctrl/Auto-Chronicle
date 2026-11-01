import axios from 'axios';
import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  ArrowLeft,
  CarFront,
  ShieldCheck,
  Target,
  UserRound,
  Wallet,
  Wrench,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import AnimatedNumber from '../components/admin/AnimatedNumber';
import {
  AreaChart,
  Donut,
  Funnel,
  ProgressRing,
  StackedBars,
} from '../components/admin/charts';
import '../components/admin/admin.css';
import { api, getAccessToken } from '../services/api';

/**
 * Growth targets. The dashboard always aims at the next milestone above the
 * current number, so the target moves up by itself as the platform grows.
 * Edit these two lists to change the targets.
 */
const USER_MILESTONES = [50, 100, 250, 500, 1000, 2500, 5000, 10000];
const PAYING_MILESTONES = [1, 5, 10, 25, 50, 100, 250];

/** The last milestone passed (or null) and the next one to aim for. */
function milestoneProgress(current: number, milestones: number[]) {
  const previous =
    [...milestones].reverse().find((value) => value <= current) ?? null;
  const next =
    milestones.find((value) => value > current) ??
    (Math.floor(current / 1000) + 1) * 1000; // past the last milestone: next round thousand

  return { previous, next };
}

const GOLD = '#ffb703';
const SILVER = '#c9ced6';
const COPPER = '#d9822b';

interface DailyPoint {
  date: string;
  count: number;
}

interface MoneyTotal {
  currency: string;
  amount: number;
}

interface Overview {
  generatedAt: string;
  days: number;
  totals: {
    users: number;
    vehicles: number;
    activeVehicles: number;
    issues: number;
    openIssues: number;
    repairs: number;
    fleets: number;
    driverReports: number;
    newDriverReports: number;
    carFunds: number;
  };
  growth: {
    newUsersLast7Days: number;
    newUsersPrevious7Days: number;
    newUsersInPeriod: number;
  };
  accountTypes: { personal: number; fleet: number };
  funnel: Array<{ key: string; label: string; count: number }>;
  billing: {
    ready: boolean;
    activeSubscriptions: number;
    payingUsers: number;
    mrr: MoneyTotal[];
    revenue: { allTime: MoneyTotal[]; last30Days: MoneyTotal[] };
    recentPayments: Array<{
      amount: number;
      currency: string;
      paidAt: string | null;
    }>;
  };
  series: {
    signups: DailyPoint[];
    vehicles: DailyPoint[];
    issues: DailyPoint[];
    repairs: DailyPoint[];
  };
  recentSignups: Array<{
    id: string;
    name: string;
    email: string;
    accountType: string;
    joinedAt: string;
  }>;
}

type Access = 'checking' | 'granted' | 'denied';

const rise = (index: number) => ({ '--i': index }) as CSSProperties;

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

function formatDay(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

function timeAgo(iso: string): string {
  const seconds = Math.max(
    0,
    Math.round((Date.now() - new Date(iso).getTime()) / 1000),
  );

  if (seconds < 60) return 'just now';

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;

  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;

  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatError(error: unknown): string {
  if (!axios.isAxiosError<{ message?: string | string[] }>(error)) {
    return 'Could not load the dashboard. Please try again.';
  }

  const message = error.response?.data?.message;
  return Array.isArray(message)
    ? message.join(', ')
    : message || error.message || 'Could not load the dashboard.';
}

export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const [access, setAccess] = useState<Access>('checking');
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  // Dark page background, also behind the scroll bounce area.
  useEffect(() => {
    const previous = document.body.style.background;
    document.body.style.background = '#050505';

    return () => {
      document.body.style.background = previous;
    };
  }, []);

  // Step 1: ask the backend whether this person is an admin.
  useEffect(() => {
    if (!getAccessToken()) {
      navigate('/login', { replace: true });
      return;
    }

    let cancelled = false;

    api
      .get('/admin/me')
      .then(() => {
        if (!cancelled) setAccess('granted');
      })
      .catch((reason: unknown) => {
        if (cancelled) return;

        if (axios.isAxiosError(reason) && reason.response?.status === 401) {
          navigate('/login', { replace: true });
          return;
        }

        setAccess('denied');
      });

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  // Step 2: load the numbers, and refresh them every minute.
  const load = useCallback(async () => {
    setRefreshing(true);

    try {
      const { data } = await api.get<Overview>('/admin/overview', {
        params: { days },
      });
      setOverview(data);
      setError(null);
      setUpdatedAt(new Date());
    } catch (reason) {
      setError(formatError(reason));
    } finally {
      setRefreshing(false);
    }
  }, [days]);

  useEffect(() => {
    if (access !== 'granted') return;

    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 60_000);

    return () => window.clearInterval(timer);
  }, [access, load]);

  if (access === 'checking') {
    return (
      <div className="adm-root">
        <div className="adm-state" role="status">
          <p>Checking access?</p>
        </div>
      </div>
    );
  }

  if (access === 'denied') {
    return (
      <div className="adm-root">
        <div className="adm-state">
          <h1>This page is for the Auto Chronicle team</h1>
          <p>Your account does not have access to the admin dashboard.</p>
          <Link to="/dashboard">Back to my dashboard</Link>
        </div>
      </div>
    );
  }

  const registered = overview?.totals.users ?? 0;
  const paying = overview?.billing.payingUsers ?? 0;
  const conversion = registered > 0 ? (paying / registered) * 100 : 0;
  const userGoal = milestoneProgress(registered, USER_MILESTONES);
  const payingGoal = milestoneProgress(paying, PAYING_MILESTONES);
  const weekChange = overview
    ? overview.growth.newUsersLast7Days - overview.growth.newUsersPrevious7Days
    : 0;
  const mainRevenue = overview?.billing.revenue.allTime[0];
  const labels =
    overview?.series.signups.map((point) => formatDay(point.date)) ?? [];

  return (
    <div className="adm-root">
      <div className="adm-wrap">
        <header className="adm-header">
          <div>
            <Link to="/dashboard" className="adm-back">
              <ArrowLeft size={14} /> Back to app
            </Link>
            <div>
              <span className="adm-badge">
                <ShieldCheck size={12} /> Creators only
              </span>
            </div>
            <h1 className="adm-title">Platform overview</h1>
            <p className="adm-sub">
              <span className="adm-live" aria-hidden="true" />
              {updatedAt
                ? `Updated ${updatedAt.toLocaleTimeString()}`
                : 'Loading?'}
              <span> ? refreshes every minute</span>
            </p>
          </div>

          <div className="adm-controls">
            <div
              className="adm-seg-toggle"
              role="group"
              aria-label="Time range"
            >
              {([7, 30, 90] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={days === option}
                  onClick={() => setDays(option)}
                >
                  {option}
                </button>
              ))}
            </div>

            <button
              className="adm-refresh"
              type="button"
              data-busy={refreshing}
              onClick={() => void load()}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M20 11a8 8 0 10-2.34 5.66" />
                <path d="M20 4v7h-7" />
              </svg>
              {refreshing ? 'Refreshing?' : 'Refresh'}
            </button>
          </div>
        </header>

        {error && (
          <div className="adm-error" role="alert">
            {error}
          </div>
        )}

        {!overview && !error && (
          <div className="adm-grid-kpis">
            {[0, 1, 2, 3, 4, 5].map((item) => (
              <div key={item} className="adm-skeleton" />
            ))}
          </div>
        )}

        {overview && (
          <>
            <section className="adm-grid-kpis" aria-label="Key numbers">
              <article className="adm-card adm-rise" style={rise(0)}>
                <div className="adm-kpi-top">
                  Registered users
                  <span className="adm-kpi-icon">
                    <UserRound />
                  </span>
                </div>
                <div className="adm-kpi-value">
                  <AnimatedNumber value={overview.totals.users} />
                </div>
                <p className="adm-kpi-note">
                  {weekChange >= 0 ? (
                    <span className="adm-up">+{weekChange}</span>
                  ) : (
                    <span className="adm-down">{weekChange}</span>
                  )}{' '}
                  in the last 7 days
                </p>
              </article>

              <article className="adm-card adm-rise" style={rise(1)}>
                <div className="adm-kpi-top">
                  Paying customers
                  <span className="adm-kpi-icon">
                    <Wallet />
                  </span>
                </div>
                <div className="adm-kpi-value">
                  <AnimatedNumber value={paying} />
                </div>
                <p className="adm-kpi-note">
                  {conversion.toFixed(1)}% conversion to paid accounts
                </p>
              </article>

              <article className="adm-card adm-rise" style={rise(2)}>
                <div className="adm-kpi-top">
                  Revenue
                  <span className="adm-kpi-icon">
                    <Wallet />
                  </span>
                </div>
                <div className="adm-kpi-value">
                  {mainRevenue ? (
                    <AnimatedNumber value={mainRevenue.amount} />
                  ) : (
                    '?'
                  )}
                </div>
                <p className="adm-kpi-note">
                  {mainRevenue
                    ? formatMoney(mainRevenue.amount, mainRevenue.currency)
                    : 'No revenue recorded'}
                </p>
              </article>

              <article className="adm-card adm-rise" style={rise(3)}>
                <div className="adm-kpi-top">
                  Active vehicles
                  <span className="adm-kpi-icon">
                    <CarFront />
                  </span>
                </div>
                <div className="adm-kpi-value">
                  <AnimatedNumber value={overview.totals.activeVehicles} />
                </div>
                <p className="adm-kpi-note">
                  {overview.totals.vehicles} total vehicles on the platform
                </p>
              </article>

              <article className="adm-card adm-rise" style={rise(4)}>
                <div className="adm-kpi-top">
                  Open issues
                  <span className="adm-kpi-icon">
                    <Wrench />
                  </span>
                </div>
                <div className="adm-kpi-value">
                  <AnimatedNumber value={overview.totals.openIssues} />
                </div>
                <p className="adm-kpi-note">
                  {overview.totals.issues} issues reported in total
                </p>
              </article>

              <article className="adm-card adm-rise" style={rise(5)}>
                <div className="adm-kpi-top">
                  Repairs logged
                  <span className="adm-kpi-icon">
                    <Wrench />
                  </span>
                </div>
                <div className="adm-kpi-value">
                  <AnimatedNumber value={overview.totals.repairs} />
                </div>
                <p className="adm-kpi-note">
                  {overview.totals.repairs} repairs in the current period
                </p>
              </article>
            </section>

            <section className="adm-row adm-row-2">
              <article className="adm-card adm-rise" style={rise(6)}>
                <h2>
                  Registrations{' '}
                  <small>
                    last {overview.days} days ?{' '}
                    {overview.growth.newUsersInPeriod} new
                  </small>
                </h2>
                <AreaChart
                  data={overview.series.signups.map((point, index) => ({
                    label: formatDay(point.date),
                    value: point.count,
                    index,
                  }))}
                />
              </article>

              <article className="adm-card adm-rise" style={rise(7)}>
                <h2>
                  <Target
                    size={14}
                    style={{ marginRight: 6, verticalAlign: '-2px' }}
                  />
                  Growth targets
                </h2>
                <div className="adm-goals">
                  <ProgressRing
                    value={registered}
                    max={userGoal.next}
                    caption='paying users'
                    color={GOLD}
                  />
                  <ProgressRing
                    value={paying}
                    max={payingGoal.next}
                    caption='paid customers'
                    color={SILVER}
                  />
                </div>
                <p className="adm-goals-note">
                    {userGoal.previous !== null && 
                     `Passed: ${userGoal.previous.toLocaleString()} registered users`}
                    {(userGoal.next - registered).toLocaleString()} more to reach {' '}
                    {userGoal.next.toLocaleString()}.
                </p>
                <p className="adm-goals-note">
                    {payingGoal.previous !== null && 
                     `Passed: ${payingGoal.previous.toLocaleString()} paying customers`}
                    {(payingGoal.next - paying).toLocaleString()} more to reach {' '}
                    {payingGoal.next.toLocaleString()}.
                </p>
              </article>
            </section>

            <section className="adm-row adm-row-eq">
              <article className="adm-card adm-rise" style={rise(8)}>
                <h2>
                  Platform activity
                  <small>new vehicles, issues and repairs per day</small>
                </h2>
                <StackedBars
                  labels={labels}
                  series={[
                    {
                      key: 'vehicles',
                      label: 'Vehicles',
                      color: GOLD,
                      values: overview.series.vehicles.map(
                        (point) => point.count,
                      ),
                    },
                    {
                      key: 'issues',
                      label: 'Issues',
                      color: COPPER,
                      values: overview.series.issues.map(
                        (point) => point.count,
                      ),
                    },
                    {
                      key: 'repairs',
                      label: 'Repairs',
                      color: SILVER,
                      values: overview.series.repairs.map(
                        (point) => point.count,
                      ),
                    },
                  ]}
                />
              </article>

              <article className="adm-card adm-rise" style={rise(9)}>
                <h2>Account types</h2>
                <Donut
                  centerLabel="users"
                  segments={[
                    {
                      label: 'Personal',
                      value: overview.accountTypes.personal,
                      color: SILVER,
                    },
                    {
                      label: 'Fleet',
                      value: overview.accountTypes.fleet,
                      color: GOLD,
                    },
                  ]}
                />
              </article>
            </section>

            <section className="adm-row adm-row-3">
              <article className="adm-card adm-rise" style={rise(10)}>
                <h2>Activation funnel</h2>
                <Funnel
                  steps={overview.funnel.map((step) => ({
                    label: step.label,
                    count: step.count,
                  }))}
                />
              </article>

              <article className="adm-card adm-rise" style={rise(11)}>
                <h2>Subscriptions &amp; revenue</h2>
                {!overview.billing.ready ||
                (overview.billing.activeSubscriptions === 0 &&
                  overview.billing.recentPayments.length === 0) ? (
                  <p className="adm-empty">
                    {overview.billing.ready
                      ? 'No subscriptions or payment activity yet.'
                      : 'Payments are temporarily unavailable.'}
                  </p>
                ) : (
                  <>
                    <div className="adm-stat-list compact">
                      <div>
                        Active subscriptions{' '}
                        <b>{overview.billing.activeSubscriptions}</b>
                      </div>
                      <div>
                        Paying users <b>{overview.billing.payingUsers}</b>
                      </div>
                    </div>
                    <div className="adm-mini-mrr">
                      {overview.billing.mrr.map((item) => (
                        <div key={item.currency}>
                          {item.currency}{' '}
                          <b>{formatMoney(item.amount, item.currency)}</b>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </article>

              <article className="adm-card adm-rise" style={rise(12)}>
                <h2>Platform totals</h2>
                <ul className="adm-stat-list">
                  <li>
                    Fleets <b>{overview.totals.fleets}</b>
                  </li>
                  <li>
                    Driver reports <b>{overview.totals.driverReports}</b>
                  </li>
                  <li>
                    Waiting for review <b>{overview.totals.newDriverReports}</b>
                  </li>
                  <li>
                    Car funds{' '}
                    <b>{formatMoney(overview.totals.carFunds, 'USD')}</b>
                  </li>
                </ul>
              </article>
            </section>

            <section className="adm-card adm-rise" style={rise(13)}>
              <h2>Recent registrations</h2>
              <div className="adm-table-wrap">
                <table className="adm-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Account</th>
                      <th>Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.recentSignups.map((person) => (
                      <tr key={person.id}>
                        <td>{person.name || '-'}</td>
                        <td>{person.email}</td>
                        <td>
                          <span
                            className="adm-pill"
                            data-type={person.accountType}
                          >
                            {person.accountType}
                          </span>
                        </td>
                        <td>{timeAgo(person.joinedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
