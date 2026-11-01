import axios from 'axios';
import { ArrowRight } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
  type SubmitEvent,
} from 'react';
import AppPageLayout from '../components/AppPageLayout';
import { api } from '../services/api';

interface CarFund {
  id: string;
  targetAmount: number;
  currency: string;
  targetDate: string | null;
  contributionCadence: 'daily' | 'weekly' | 'monthly' | null;
  plannedContributionAmount: number | null;
  remindersEnabled: boolean;
}

interface FundSummary {
  fund: CarFund | null;
  balance: number;
  spent?: number;
  remaining?: number;
  progressPercent: number;
  suggestedContributions?: {
    daily: number;
    weekly: number;
    monthly: number;
  } | null;
}

interface Contribution {
  id: string;
  amount: number;
  contributedAt: string;
  note: string | null;
}

interface ContributionList {
  data: Contribution[];
}

interface Spending {
  id: string;
  amount: number;
  spentAt: string;
  note: string | null;
}

interface SpendingList {
  data: Spending[];
}

const currencyOptions = (
  typeof Intl.supportedValuesOf === 'function'
    ? Intl.supportedValuesOf('currency')
    : [
        'AED',
        'AFN',
        'ALL',
        'AMD',
        'ANG',
        'AOA',
        'ARS',
        'AUD',
        'AWG',
        'AZN',
        'BAM',
        'BBD',
        'BDT',
        'BGN',
        'BHD',
        'BIF',
        'BMD',
        'BND',
        'BOB',
        'BRL',
        'BSD',
        'BTN',
        'BWP',
        'BYN',
        'BZD',
        'CAD',
        'CHF',
        'CLP',
        'CNY',
        'COP',
        'CRC',
        'CUP',
        'CVE',
        'CZK',
        'DJF',
        'DKK',
        'DOP',
        'DZD',
        'EGP',
        'ETB',
        'EUR',
        'FJD',
        'FKP',
        'GBP',
        'GEL',
        'GHS',
        'GIP',
        'GMD',
        'GNF',
        'GTQ',
        'GYD',
        'HKD',
        'HNL',
        'HRK',
        'HTG',
        'HUF',
        'IDR',
        'ILS',
        'INR',
        'IQD',
        'IRR',
        'ISK',
        'JMD',
        'JOD',
        'JPY',
        'KES',
        'KGS',
        'KHR',
        'KMF',
        'KRW',
        'KWD',
        'KYD',
        'KZT',
        'LAK',
        'LBP',
        'LKR',
        'LRD',
        'LSL',
        'LYD',
        'MAD',
        'MDL',
        'MGA',
        'MKD',
        'MMK',
        'MNT',
        'MOP',
        'MRU',
        'MUR',
        'MVR',
        'MWK',
        'MXN',
        'MYR',
        'MZN',
        'NAD',
        'NGN',
        'NIO',
        'NOK',
        'NPR',
        'NZD',
        'OMR',
        'PAB',
        'PEN',
        'PGK',
        'PHP',
        'PKR',
        'PLN',
        'PYG',
        'QAR',
        'RON',
        'RSD',
        'RUB',
        'RWF',
        'SAR',
        'SBD',
        'SCR',
        'SEK',
        'SGD',
        'SHP',
        'SLE',
        'SOS',
        'SRD',
        'SSP',
        'STN',
        'SVC',
        'SZL',
        'THB',
        'TJS',
        'TMT',
        'TND',
        'TOP',
        'TRY',
        'TTD',
        'TWD',
        'TZS',
        'UAH',
        'UGX',
        'USD',
        'UYU',
        'UZS',
        'VES',
        'VND',
        'VUV',
        'WST',
        'XAF',
        'XCD',
        'XOF',
        'XPF',
        'YER',
        'ZAR',
        'ZMW',
      ]
).sort((a, b) => a.localeCompare(b));

function messageFor(error: unknown, fallback: string): string {
  if (!axios.isAxiosError<{ message?: string | string[] }>(error)) {
    return fallback;
  }
  const message = error.response?.data?.message;
  return Array.isArray(message)
    ? message.join(', ')
    : message || error.message || fallback;
}

function money(amount: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function displayDate(value: string | null): string {
  if (!value) return 'Not set';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(
    date,
  );
}

export default function CarFundPage() {
  const [summary, setSummary] = useState<FundSummary | null>(null);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [spending, setSpending] = useState<Spending[]>([]);
  const [targetAmount, setTargetAmount] = useState('');
  const [currency, setCurrency] = useState('NGN');
  const [targetDate, setTargetDate] = useState('');
  const [cadence, setCadence] = useState('');
  const [plannedAmount, setPlannedAmount] = useState('');
  const [remindersEnabled, setRemindersEnabled] = useState(false);
  const [contributionAmount, setContributionAmount] = useState('');
  const [contributionNote, setContributionNote] = useState('');
  const [spendingAmount, setSpendingAmount] = useState('');
  const [spendingNote, setSpendingNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingGoal, setSavingGoal] = useState(false);
  const [savingContribution, setSavingContribution] = useState(false);
  const [savingSpending, setSavingSpending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadFund = useCallback(async () => {
    setError(null);
    try {
      const response = await api.get<FundSummary>('/car-fund');
      setSummary(response.data);

      if (response.data.fund) {
        const fund = response.data.fund;
        setTargetAmount(String(fund.targetAmount));
        setCurrency(fund.currency);
        setTargetDate(fund.targetDate ?? '');
        setCadence(fund.contributionCadence ?? '');
        setPlannedAmount(
          fund.plannedContributionAmount === null
            ? ''
            : String(fund.plannedContributionAmount),
        );
        setRemindersEnabled(fund.remindersEnabled);

        const activity = await api.get<ContributionList>(
          '/car-fund/contributions',
          { params: { page: 1, limit: 5 } },
        );
        setContributions(activity.data.data);
        const spendingActivity = await api.get<SpendingList>(
          '/car-fund/spending',
          { params: { page: 1, limit: 5 } },
        );
        setSpending(spendingActivity.data.data);
      } else {
        setContributions([]);
        setSpending([]);
      }
    } catch (requestError: unknown) {
      setError(messageFor(requestError, 'Unable to load Car Fund.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFund();
  }, [loadFund]);

  const handleSaveGoal = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingGoal(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await api.put<FundSummary>('/car-fund/goal', {
        targetAmount: Number(targetAmount),
        currency,
        targetDate: targetDate || undefined,
        contributionCadence: cadence || undefined,
        plannedContributionAmount: plannedAmount
          ? Number(plannedAmount)
          : undefined,
        remindersEnabled: remindersEnabled && Boolean(cadence && plannedAmount),
      });
      setSummary(response.data);
      setSuccess('Your Car Fund goal has been saved.');
      await loadFund();
    } catch (requestError: unknown) {
      setError(messageFor(requestError, 'Unable to save your Car Fund goal.'));
    } finally {
      setSavingGoal(false);
    }
  };

  const handleAddContribution = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingContribution(true);
    setError(null);
    setSuccess(null);

    try {
      await api.post('/car-fund/contributions', {
        amount: Number(contributionAmount),
        note: contributionNote.trim() || undefined,
      });
      setContributionAmount('');
      setContributionNote('');
      setSuccess('Contribution added to your Car Fund.');
      await loadFund();
    } catch (requestError: unknown) {
      setError(messageFor(requestError, 'Unable to record your contribution.'));
    } finally {
      setSavingContribution(false);
    }
  };

  const handleRecordSpending = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingSpending(true);
    setError(null);
    setSuccess(null);
    try {
      await api.post('/car-fund/spending', {
        amount: Number(spendingAmount),
        note: spendingNote.trim() || undefined,
      });
      setSpendingAmount('');
      setSpendingNote('');
      setSuccess('Your off-site Car Fund spending has been recorded.');
      await loadFund();
    } catch (requestError: unknown) {
      setError(messageFor(requestError, 'Unable to record Car Fund spending.'));
    } finally {
      setSavingSpending(false);
    }
  };

  if (loading) {
    return (
      <AppPageLayout>
        <p className="text-sm text-gray-400" role="status">
          Loading your Car Fund...
        </p>
      </AppPageLayout>
    );
  }

  const fund = summary?.fund;
  const currentCurrency = fund?.currency ?? currency;
  const progress = Math.min(100, Math.max(0, summary?.progressPercent ?? 0));
  const remaining =
    summary?.remaining ??
    Math.max(0, (fund?.targetAmount ?? 0) - (summary?.balance ?? 0));
  const targetReached = Boolean(
    fund && (summary?.balance ?? 0) >= fund.targetAmount,
  );

  const coinBackground = Array.from({ length: 16 }, (_, index) => {
    const negativeDrift = index % 2 === 0 ? -1 : 1;

    return {
      left: 8 + ((index * 17) % 76),
      size: 14 + (index % 5) * 5,
      duration: 12 + (index % 4) * 3,
      delay: index * 0.8,
      drift: negativeDrift * (18 + (index % 5) * 10),
      rotation: 80 + index * 18,
    };
  });

  return (
    <AppPageLayout>
      <div className="car-fund-scene mx-auto max-w-3xl overflow-hidden rounded-[28px]">
        <div className="coin-background" aria-hidden="true">
          {coinBackground.map((coin, index) => {
            const coinStyle: CSSProperties = {
              left: `${coin.left}%`,
              width: `${coin.size}px`,
              height: `${coin.size}px`,
              animationDuration: `${coin.duration}s`,
              animationDelay: `${coin.delay}s`,
              ['--coin-drift' as string]: `${coin.drift}px`,
              ['--coin-rotation' as string]: `${coin.rotation}deg`,
              ['--coin-delay' as string]: `${index * 0.25}s`,
            };

            return (
              <span
                key={`coin-${index}`}
                className="coin-asset"
                style={coinStyle}
              />
            );
          })}
        </div>

        <div className="relative space-y-5 p-4 sm:space-y-6 sm:p-6">
        <header>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-orange-400">
            A cushion for car costs
          </p>
          <h1 className="page-heading">Car Fund</h1>
          <p className="mt-2 max-w-xl text-sm text-gray-400">
            Build a buffer for repairs and maintenance, one small step at a
            time.
          </p>
        </header>

        {error && (
          <p
            className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            role="alert"
          >
            {error}
          </p>
        )}
        {success && (
          <p
            className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
            role="status"
          >
            {success}
          </p>
        )}

        <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5 text-center sm:p-7">
          <div
            className="fund-progress-ring mx-auto grid h-36 w-36 place-items-center rounded-full sm:h-40 sm:w-40"
            style={{
              background: `conic-gradient(#f2a08a ${progress * 3.6}deg, #e5e9e1 ${progress * 3.6}deg 360deg)`,
            }}
            role="img"
            aria-label={`${progress}% of goal saved`}
          >
            <div className="grid h-28 w-28 place-content-center rounded-full bg-white text-center sm:h-32 sm:w-32">
              <span className="text-xs text-gray-500">Saved</span>
              <strong className="mt-1 text-lg font-semibold">
                {money(summary?.balance ?? 0, currentCurrency)}
              </strong>
              <span className="mt-1 text-[11px] text-gray-500">
                of {money(fund?.targetAmount ?? 0, currentCurrency)}
              </span>
            </div>
          </div>
          <h2 className="mt-5 text-lg font-semibold">
            {targetReached
              ? 'You reached your Car Fund target.'
              : fund
                ? 'You’re building a useful buffer.'
                : 'Start your car fund'}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {targetReached
              ? 'Set a new target to keep saving. Your current balance will roll into the next goal.'
              : fund
                ? `${progress}% funded · ${money(remaining, currentCurrency)} remaining`
                : 'Choose a goal that feels manageable and adjust it whenever you need.'}
          </p>
          {fund && (
            <div className="mt-5 grid grid-cols-2 gap-3 text-left sm:grid-cols-4">
              <div className="rounded-xl bg-gray-950 p-3">
                <p className="text-[11px] uppercase tracking-wide text-gray-500">
                  Target date
                </p>
                <p className="mt-1 text-sm font-medium">
                  {displayDate(fund.targetDate)}
                </p>
              </div>
              <div className="rounded-xl bg-gray-950 p-3">
                <p className="text-[11px] uppercase tracking-wide text-gray-500">
                  Contribution plan
                </p>
                <p className="mt-1 text-sm font-medium">
                  {fund.contributionCadence && fund.plannedContributionAmount
                    ? `${money(fund.plannedContributionAmount, currentCurrency)} ${fund.contributionCadence}`
                    : 'Not set'}
                </p>
              </div>
              <div className="rounded-xl bg-gray-950 p-3">
                <p className="text-[11px] uppercase tracking-wide text-gray-500">
                  Spent so far
                </p>
                <p className="mt-1 text-sm font-medium">
                  {money(summary?.spent ?? 0, currentCurrency)}
                </p>
              </div>
              <div className="rounded-xl bg-gray-950 p-3">
                <p className="text-[11px] uppercase tracking-wide text-gray-500">
                  Reminder plan
                </p>
                <p className="mt-1 text-sm font-medium">
                  {fund.remindersEnabled ? 'On' : 'Off'}
                </p>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5 sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-orange-400">
                Fund goal
              </p>
              <h2 className="mt-1 text-lg font-semibold">
                {targetReached
                  ? 'Choose your next target'
                  : fund
                    ? 'Update your target'
                    : 'Set your target'}
              </h2>
            </div>
            {fund && (
              <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">
                {progress}% funded
              </span>
            )}
          </div>
          <form onSubmit={handleSaveGoal} className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm">
              <span className="block font-medium">Target amount</span>
              <input
                type="number"
                min={
                  targetReached
                    ? ((summary?.balance ?? 0) + 0.01).toFixed(2)
                    : '0.01'
                }
                step="0.01"
                value={targetAmount}
                onChange={(event) => setTargetAmount(event.target.value)}
                placeholder="e.g. 500000"
                required
                className="app-input"
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="block font-medium">Currency</span>
              <select
                value={currency}
                onChange={(event) => setCurrency(event.target.value)}
                className="app-input"
              >
                {currencyOptions.map((code) => (
                  <option key={code} value={code}>
                    {code} · {new Intl.DisplayNames(undefined, { type: 'currency' }).of(code)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-sm">
              <span className="block font-medium">Target date (optional)</span>
              <input
                type="date"
                min={new Date(Date.now() + 86_400_000)
                  .toISOString()
                  .slice(0, 10)}
                value={targetDate}
                onChange={(event) => setTargetDate(event.target.value)}
                className="app-input"
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="block font-medium">Contribution cadence</span>
              <select
                value={cadence}
                onChange={(event) => setCadence(event.target.value)}
                className="app-input"
              >
                <option value="">No planned cadence</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>
            {cadence && (
              <>
                <label className="space-y-2 text-sm">
                  <span className="block font-medium">
                    Planned contribution
                  </span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={plannedAmount}
                    onChange={(event) => setPlannedAmount(event.target.value)}
                    required={Boolean(cadence)}
                    className="app-input"
                  />
                </label>
                <label className="flex items-center gap-3 self-end pb-3 text-sm">
                  <input
                    type="checkbox"
                    checked={remindersEnabled}
                    onChange={(event) =>
                      setRemindersEnabled(event.target.checked)
                    }
                    className="h-4 w-4 accent-green-800"
                  />
                  Remind me about my plan
                </label>
              </>
            )}
            <button
              type="submit"
              disabled={savingGoal}
              className="app-primary-button sm:col-span-2"
            >
              {savingGoal ? 'Saving goal...' : 'Save fund goal'}
              {!savingGoal && (
                <ArrowRight
                  aria-hidden="true"
                  className="ml-1 inline h-4 w-4"
                />
              )}
            </button>
          </form>
          {summary?.suggestedContributions && (
            <p className="mt-3 text-xs text-gray-500">
              Suggested weekly amount:{' '}
              {money(summary.suggestedContributions.weekly, currentCurrency)}
            </p>
          )}
        </section>

        {fund && (
          <div className="grid gap-4 md:grid-cols-2">
            <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5 sm:p-6">
              <h2 className="text-lg font-semibold">Log a contribution</h2>
              <p className="mt-1 text-sm text-gray-500">
                Add a contribution you made outside Auto Chronicle.
              </p>
              <form onSubmit={handleAddContribution} className="mt-4 space-y-3">
                <label className="block space-y-2 text-sm">
                  <span className="font-medium">
                    Amount ({currentCurrency})
                  </span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={contributionAmount}
                    onChange={(event) =>
                      setContributionAmount(event.target.value)
                    }
                    required
                    className="app-input"
                  />
                </label>
                <label className="block space-y-2 text-sm">
                  <span className="font-medium">Note (optional)</span>
                  <input
                    value={contributionNote}
                    onChange={(event) =>
                      setContributionNote(event.target.value)
                    }
                    maxLength={500}
                    placeholder="e.g. October savings"
                    className="app-input"
                  />
                </label>
                <button
                  type="submit"
                  disabled={savingContribution}
                  className="app-primary-button w-full"
                >
                  {savingContribution ? 'Adding...' : 'Add contribution'}
                </button>
              </form>
            </section>

            <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5 sm:p-6">
              <h2 className="text-lg font-semibold">Record money spent</h2>
              <p className="mt-1 text-sm text-gray-500">
                Reduce your tracked balance for car costs paid outside Auto
                Chronicle.
              </p>
              <p className="mt-2 text-xs text-gray-500">
                Available balance:{' '}
                {money(summary?.balance ?? 0, currentCurrency)}
              </p>
              <form onSubmit={handleRecordSpending} className="mt-4 space-y-3">
                <label className="block space-y-2 text-sm">
                  <span className="font-medium">
                    Amount ({currentCurrency})
                  </span>
                  <input
                    type="number"
                    min="0.01"
                    max={summary?.balance ?? 0}
                    step="0.01"
                    value={spendingAmount}
                    onChange={(event) => setSpendingAmount(event.target.value)}
                    required
                    className="app-input"
                  />
                </label>
                <label className="block space-y-2 text-sm">
                  <span className="font-medium">
                    What was it for? (optional)
                  </span>
                  <input
                    value={spendingNote}
                    onChange={(event) => setSpendingNote(event.target.value)}
                    maxLength={500}
                    placeholder="e.g. Replacement tyre"
                    className="app-input"
                  />
                </label>
                <button
                  type="submit"
                  disabled={savingSpending || (summary?.balance ?? 0) <= 0}
                  className="app-secondary-button w-full disabled:opacity-50"
                >
                  {savingSpending ? 'Recording...' : 'Record spending'}
                </button>
              </form>
            </section>

            <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5 sm:p-6">
              <h2 className="text-lg font-semibold">Recent activity</h2>
              {contributions.length || spending.length ? (
                <ul className="mt-3 divide-y divide-gray-800">
                  {[
                    ...contributions.map((item) => ({
                      id: item.id,
                      date: item.contributedAt,
                      note: item.note,
                      amount: item.amount,
                      direction: 'in' as const,
                    })),
                    ...spending.map((item) => ({
                      id: item.id,
                      date: item.spentAt,
                      note: item.note,
                      amount: item.amount,
                      direction: 'out' as const,
                    })),
                  ]
                    .sort(
                      (a, b) =>
                        new Date(b.date).getTime() - new Date(a.date).getTime(),
                    )
                    .slice(0, 5)
                    .map((item) => (
                      <li
                        key={`${item.direction}-${item.id}`}
                        className="flex items-center justify-between gap-3 py-3 first:pt-1"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {item.note ||
                              (item.direction === 'in'
                                ? 'Car Fund contribution'
                                : 'Car Fund spending')}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            {displayDate(item.date)}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 text-sm font-semibold ${
                            item.direction === 'in'
                              ? 'text-green-800'
                              : 'text-orange-700'
                          }`}
                        >
                          {item.direction === 'in' ? '+' : '−'}
                          {money(item.amount, currentCurrency)}
                        </span>
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="mt-3 rounded-xl border border-dashed border-gray-800 px-4 py-8 text-center text-sm text-gray-500">
                  Your contributions will appear here.
                </p>
              )}
            </section>
          </div>
        )}

        <p className="rounded-xl border border-orange-900/50 bg-orange-950/30 p-4 text-xs leading-relaxed text-orange-300">
          <strong>Manual savings tracker:</strong> Auto Chronicle does not
          collect, hold, or transfer money. Record contributions you make
          yourself and manually log car spending to keep the balance accurate.
        </p>
        </div>
      </div>
    </AppPageLayout>
  );
}
