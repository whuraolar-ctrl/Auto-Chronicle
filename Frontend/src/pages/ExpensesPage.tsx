import axios from 'axios';
import { useEffect, useState } from 'react';
import AppPageLayout from '../components/AppPageLayout';
import { api } from '../services/api';

interface ExpenseBreakdown {
  amount: number | string;
  partName?: string;
  name?: string | null;
  plateNumber?: string | null;
}

interface MonthlyExpense {
  month: number;
  year: number;
  total: number | string;
  unallocatedTotal: number | string;
  currency: string;
  monthlyTrend: Array<{
    month: number;
    year: number;
    total: number | string;
  }>;
  byPart: ExpenseBreakdown[];
  byVehicle: ExpenseBreakdown[];
  exchangeRates: Array<{
    baseCurrency: string;
    rate: number;
    asOf: string;
  }>;
}

function amountValue(amount: number | string): number {
  const value = Number(amount);
  return Number.isFinite(value) ? value : 0;
}

function formatMoney(amount: number | string, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amountValue(amount));
}

function formatError(error: unknown): string {
  if (!axios.isAxiosError<{ message?: string | string[] }>(error)) {
    return 'Failed to load monthly expenses';
  }

  const message = error.response?.data?.message;
  if (error.response?.status === 401) {
    return 'Sign in to view your repair expenses.';
  }

  return Array.isArray(message)
    ? message.join(', ')
    : message || error.message || 'Failed to load monthly expenses';
}

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<MonthlyExpense | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const currentDate = new Date();

    api
      .get<MonthlyExpense>('/expenses/monthly', {
        params: {
          month: currentDate.getMonth() + 1,
          year: currentDate.getFullYear(),
          months: 6,
        },
      })
      .then((response) => setExpenses(response.data))
      .catch((requestError: unknown) => setError(formatError(requestError)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <AppPageLayout>
        <p className="text-sm text-gray-400 sm:text-base" role="status">
          Loading expense analytics...
        </p>
      </AppPageLayout>
    );
  }

  if (error) {
    return (
      <AppPageLayout>
        <div
          className="rounded-xl border border-red-900/70 bg-red-950/40 p-4 text-sm text-red-300 sm:text-base"
          role="alert"
        >
          <h1 className="font-semibold">Unable to load expense analytics</h1>
          <p className="mt-1">{error}</p>
        </div>
      </AppPageLayout>
    );
  }

  if (!expenses) return null;

  const maxTrendAmount = Math.max(
    ...expenses.monthlyTrend.map((entry) => amountValue(entry.total)),
    0,
  );
  const hasTrendData = maxTrendAmount > 0;
  const selectedMonth = new Date(expenses.year, expenses.month - 1, 1);
  const selectedMonthLabel = new Intl.DateTimeFormat(undefined, {
    month: 'long',
    year: 'numeric',
  }).format(selectedMonth);

  const renderBreakdown = (
    title: string,
    items: ExpenseBreakdown[],
    labelFor: (item: ExpenseBreakdown) => string,
    emptyMessage: string,
  ) => {
    const maxAmount = Math.max(
      ...items.map((item) => amountValue(item.amount)),
      0,
    );

    return (
      <section className="rounded-2xl border border-gray-800 bg-gray-900 p-4 sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-white sm:text-lg">
            {title}
          </h2>
          <span className="text-xs text-gray-500">
            {items.length} {items.length === 1 ? 'item' : 'items'}
          </span>
        </div>
        {items.length ? (
          <ul className="space-y-5">
            {items.map((item, index) => {
              const value = amountValue(item.amount);
              const barWidth =
                maxAmount > 0 ? Math.max((value / maxAmount) * 100, 2) : 0;

              return (
                <li key={`${labelFor(item)}-${index}`}>
                  <div className="mb-2 flex items-center justify-between gap-4 text-sm">
                    <span className="min-w-0 truncate text-gray-300">
                      {labelFor(item)}
                    </span>
                    <span className="shrink-0 font-medium tabular-nums text-white">
                      {formatMoney(item.amount, expenses.currency)}
                    </span>
                  </div>
                  <div
                    className="h-2 overflow-hidden rounded-full bg-gray-800"
                    aria-hidden="true"
                  >
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-300"
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed border-gray-800 px-4 py-8 text-center text-sm text-gray-500">
            {emptyMessage}
          </p>
        )}
      </section>
    );
  };

  return (
    <AppPageLayout wide>
      <div className="mx-auto max-w-7xl space-y-5 sm:space-y-7">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-orange-400">
              Spending overview
            </p>
            <h1 className="page-heading text-white">Expense analytics</h1>
          </div>
          <p className="text-sm text-gray-400">{selectedMonthLabel}</p>
        </header>

        <section className="grid gap-4 md:grid-cols-[1fr_1.5fr]">
          <div className="relative overflow-hidden rounded-2xl border border-orange-900/50 bg-gradient-to-br from-orange-950/80 via-gray-900 to-gray-900 p-5 sm:p-7">
            <div
              className="pointer-events-none absolute -right-10 -top-14 h-48 w-48 rounded-full bg-orange-500/10 blur-3xl"
              aria-hidden="true"
            />
            <p className="relative text-sm font-medium text-orange-100/70">
              Total repair spend
            </p>
            <p className="relative mt-3 break-all text-3xl font-bold tracking-tight text-[#5EEAD4] sm:text-4xl">
              {formatMoney(expenses.total, expenses.currency)}
            </p>
            <p className="relative mt-2 text-sm text-gray-300">
              Across your accessible vehicles this month
            </p>
          </div>

          <section
            className="rounded-2xl border border-gray-800 bg-gray-900 p-4 sm:p-6"
            aria-labelledby="spend-trend-heading"
          >
            <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2
                  id="spend-trend-heading"
                  className="text-base font-semibold text-white sm:text-lg"
                >
                  Monthly spend
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  Six-month repair expense trend
                </p>
              </div>
              <span className="rounded-full border border-gray-700 bg-gray-950 px-3 py-1 text-xs text-gray-400">
                {expenses.monthlyTrend.length} months
              </span>
            </div>

            {hasTrendData ? (
              <div
                className="grid h-44 grid-cols-6 items-end gap-2 border-b border-gray-800 px-1 sm:h-52 sm:gap-4"
                role="img"
                aria-label={`Monthly repair expenses for ${expenses.monthlyTrend.length} months, in ${expenses.currency}`}
              >
                {expenses.monthlyTrend.map((entry) => {
                  const value = amountValue(entry.total);
                  const isSelected =
                    entry.month === expenses.month &&
                    entry.year === expenses.year;
                  const height = Math.max((value / maxTrendAmount) * 100, 3);
                  const label = new Intl.DateTimeFormat(undefined, {
                    month: 'short',
                  }).format(new Date(entry.year, entry.month - 1, 1));

                  return (
                    <div
                      key={`${entry.year}-${entry.month}`}
                      className="group flex h-full min-w-0 flex-col items-center justify-end gap-2"
                      title={`${label} ${entry.year}: ${formatMoney(entry.total, expenses.currency)}`}
                    >
                      <div className="flex h-full w-full items-end">
                        <div
                          className={`mx-auto w-full max-w-10 rounded-t-md transition-[height,filter] group-hover:brightness-125 ${
                            isSelected
                              ? 'bg-gradient-to-t from-orange-600 to-amber-300'
                              : 'bg-gradient-to-t from-gray-700 to-gray-500'
                          }`}
                          style={{ height: `${height}%` }}
                        />
                      </div>
                      <span
                        className={`pb-2 text-[11px] ${
                          isSelected
                            ? 'font-semibold text-orange-300'
                            : 'text-gray-500'
                        }`}
                      >
                        {label}
                        <span className="sr-only">
                          {`, ${entry.year}, ${formatMoney(entry.total, expenses.currency)}`}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex h-44 items-center justify-center rounded-lg border border-dashed border-gray-800 text-center text-sm text-gray-500 sm:h-52">
                No repair expenses recorded in this period.
              </div>
            )}
          </section>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          {renderBreakdown(
            'By part',
            expenses.byPart,
            (item) => item.partName ?? 'Unspecified part',
            'No part expenses recorded this month.',
          )}
          {renderBreakdown(
            'By vehicle',
            expenses.byVehicle,
            (item) => item.plateNumber || item.name || 'Unnamed vehicle',
            'No vehicle expenses recorded this month.',
          )}
        </div>

        {(amountValue(expenses.unallocatedTotal) > 0 ||
          expenses.exchangeRates.length > 0) && (
          <aside className="flex flex-col gap-2 rounded-xl border border-gray-800 bg-gray-900/70 px-4 py-3 text-xs text-gray-500 sm:flex-row sm:items-center sm:justify-between">
            {amountValue(expenses.unallocatedTotal) > 0 && (
              <p>
                Not assigned to a part:{' '}
                <span className="font-medium text-gray-300">
                  {formatMoney(expenses.unallocatedTotal, expenses.currency)}
                </span>
              </p>
            )}
            {expenses.exchangeRates.length > 0 && (
              <p>
                Converted to {expenses.currency} using current exchange rates.
              </p>
            )}
          </aside>
        )}
      </div>
    </AppPageLayout>
  );
}
