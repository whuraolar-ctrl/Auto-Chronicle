import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
const DAY_MS = 86_400_000;
const PAGE_SIZE = 1000; // Supabase returns at most 1000 rows per request

type Row = Record<string, unknown>;

export interface DailyPoint {
  date: string; // YYYY-MM-DD (UTC)
  count: number;
}

export interface MoneyTotal {
  currency: string;
  amount: number;
}

const startOfUtcDay = (date: Date): Date =>
  new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

// Money is added in whole kobo/cents so totals never pick up rounding errors.
const toMinor = (value: unknown): number => Math.round(Number(value) * 100);

function addMoney(
  totals: Map<string, number>,
  currency: string,
  minor: number,
) {
  totals.set(currency, (totals.get(currency) ?? 0) + minor);
}

function toMoneyTotals(totals: Map<string, number>): MoneyTotal[] {
  return [...totals.entries()]
    .map(([currency, minor]) => ({ currency, amount: minor / 100 }))
    .sort((a, b) => b.amount - a.amount);
}

/** Read-only statistics for the creators' admin dashboard. */ 
@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
  constructor(private readonly supabase: SupabaseService) {}
  async overview(days: number) {
    const now = new Date();
    const periodStart = new Date(
      startOfUtcDay(now).getTime() - (days - 1) * DAY_MS,
    );
    const weekAgo = new Date(now.getTime() - 7 * DAY_MS).toISOString();
    const twoWeeksAgo = new Date(now.getTime() - 14 * DAY_MS).toISOString();
    const monthAgo = new Date(now.getTime() - 30 * DAY_MS);
    const [
      users,
      fleetUsers,
      newUsersLast7Days,
      newUsersPrevious7Days,
      newUsersInPeriod,
      vehicles,
      activeVehicles,
      issues,
      openIssues,
      repairs,
      fleets,
      driverReports,
      newDriverReports,
      carFunds,
      signupSeries,
      vehicleSeries,
      issueSeries,
      repairSeries,
      usersWithVehicle,
      usersWithRepair,
      recentSignups,
      billing,
    ] = await Promise.all([
      this.count('profiles'),
      this.count('profiles', (q) => q.eq('account_type', 'fleet')),
      this.count('profiles', (q) => q.gte('created_at', weekAgo)),
      this.count('profiles', (q) =>
        q.gte('created_at', twoWeeksAgo).lt('created_at', weekAgo),
      ),
      this.count('profiles', (q) =>
        q.gte('created_at', periodStart.toISOString()),
      ),
      this.count('vehicles'),
      this.count('vehicles', (q) => q.eq('is_archived', false)),
      this.count('issues'),
      this.count('issues', (q) => q.neq('status', 'fixed')),
      this.count('repairs'),
      this.count('fleets'),
      this.count('driver_reports'),
      this.count('driver_reports', (q) => q.eq('status', 'new')),
      this.count('car_funds'),
      this.dailyCounts('profiles', periodStart, days),
      this.dailyCounts('vehicles', periodStart, days),
      this.dailyCounts('issues', periodStart, days),
      this.dailyCounts('repairs', periodStart, days),
      this.distinctValues('vehicles', 'user_id'),
      this.distinctValues('repairs', 'recorded_by'),
      this.recentSignups(),
      this.billing(monthAgo),
    ]);
    return {
      generatedAt: now.toISOString(),
      days,
      totals: {
        users,
        vehicles,
        activeVehicles,
        issues,
        openIssues,
        repairs,
        fleets,
        driverReports,
        newDriverReports,
        carFunds,
      },
      growth: { newUsersLast7Days, newUsersPrevious7Days, newUsersInPeriod },
      accountTypes: { personal: users - fleetUsers, fleet: fleetUsers }, 
      // How far registered users get: a simple activation funnel.
      funnel: [
        { key: 'registered', label: 'Registered', count: users },
        { key: 'vehicle', label: 'Added a vehicle', count: usersWithVehicle },
        { key: 'repair', label: 'Logged a repair', count: usersWithRepair },
        { key: 'paying', label: 'Paying customer', count: billing.payingUsers },
      ],
      billing,
      series: {
        signups: signupSeries,
        vehicles: vehicleSeries,
        issues: issueSeries,
        repairs: repairSeries,
      },
      recentSignups,
    };
  }
  /** Counts rows. `filter` can add conditions to the query. */ 
  private async count(
    table: string, 
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    filter?: (query: any) => any,
  ): Promise<number> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = this.supabase.admin
      .from(table)
      .select('id', { count: 'exact', head: true });
    if (filter) query = filter(query);
    const { count, error } = await query;
    if (error) {
      this.logger.error(`Count failed for ${table}`);
      throw new InternalServerErrorException('Unable to load statistics');
    }
    return count ?? 0;
  }
  /** Rows created per day since `since`, with zero-filled days. */ 
  private async dailyCounts(
    table: string,
    since: Date,
    days: number,
  ): Promise<DailyPoint[]> {
    const rows = await this.pageAll((from, to) =>
      this.supabase.admin
        .from(table)
        .select('created_at')
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: true })
        .range(from, to),
    );
    const perDay = new Map<string, number>();
    for (const row of rows) {
      const day = String(row.created_at).slice(0, 10);
      perDay.set(day, (perDay.get(day) ?? 0) + 1);
    }
    return Array.from({ length: days }, (_, index) => {
      const date = isoDay(new Date(since.getTime() + index * DAY_MS));
      return { date, count: perDay.get(date) ?? 0 };
    });
  }
  /** How many different people appear in `column` of `table`. */ 
  private async distinctValues(
    table: string,
    column: string,
  ): Promise<number> {
    const rows = await this.pageAll((from, to) =>
      this.supabase.admin
        .from(table)
        .select(column)
        .order('created_at', { ascending: true })
        .range(from, to),
    );
    return new Set(rows.map((row) => String(row[column]))).size;
  }
  private async recentSignups() {
    const { data, error } = await this.supabase.admin
      .from('profiles')
      .select('id, first_name, last_name, email, account_type, created_at')
      .order('created_at', { ascending: false })
      .limit(8);
    if (error) {
      throw new InternalServerErrorException('Unable to load statistics');
    }
    return (data ?? []).map((row) => ({
      id: String(row.id),
      name: `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim(),
      email: String(row.email),
      accountType: String(row.account_type),
      joinedAt: String(row.created_at),
    }));
  }
  /** Subscription and revenue figures. 
    If the billing tables don't exist yet (migration not applied),
    the dashboard still works and shows zeros. */ 
  private async billing(
    since: Date,
  ) {
    try {
      const [subscriptions, payments] = await Promise.all([
        this.pageAll((from, to) =>
          this.supabase.admin
            .from('subscriptions')
            .select('id, user_id, amount, currency, billing_interval')
            .eq('status', 'active')
            .order('id', { ascending: true })
            .range(from, to),
        ),
        this.pageAll((from, to) =>
          this.supabase.admin
            .from('payments')
            .select('id, amount, currency, paid_at')
            .eq('status', 'succeeded')
            .order('id', { ascending: true })
            .range(from, to),
        ),
      ]);
      const mrr = new Map<string, number>();
      for (const sub of subscriptions) {
        const monthly =
          sub.billing_interval === 'yearly'
            ? Math.round(toMinor(sub.amount) / 12)
            : toMinor(sub.amount);
        addMoney(mrr, String(sub.currency), monthly);
      }
      const allTime = new Map<string, number>();
      const lastMonth = new Map<string, number>();
      for (const payment of payments) {
        const currency = String(payment.currency);
        const minor = toMinor(payment.amount);
        addMoney(allTime, currency, minor);
        if (payment.paid_at && new Date(String(payment.paid_at)) >= since) {
          addMoney(lastMonth, currency, minor);
        }
      }
      const recentPayments = [...payments]
        .sort((a, b) =>
          String(b.paid_at ?? '').localeCompare(String(a.paid_at ?? '')),
        )
        .slice(0, 5)
        .map((p) => ({
          amount: Number(p.amount),
          currency: String(p.currency),
          paidAt: p.paid_at ? String(p.paid_at) : null,
        }));
      return {
        ready: true,
        activeSubscriptions: subscriptions.length,
        payingUsers: new Set(subscriptions.map((s) => String(s.user_id))).size,
        mrr: toMoneyTotals(mrr),
        revenue: {
          allTime: toMoneyTotals(allTime),
          last30Days: toMoneyTotals(lastMonth),
        },
        recentPayments,
      };
    } catch {
      this.logger.warn('Billing tables are not available yet');
      return {
        ready: false,
        activeSubscriptions: 0,
        payingUsers: 0,
        mrr: [] as MoneyTotal[],
        revenue: {
          allTime: [] as MoneyTotal[],
          last30Days: [] as MoneyTotal[],
        },
        recentPayments: [] as Array<{
          amount: number;
          currency: string;
          paidAt: string | null;
        }>,
      };
    }
  }
  /** Reads every page of a query (Supabase caps each response at 1000 rows). */ 
  private async pageAll(
    run: (
      from: number,
      to: number,
    ) => PromiseLike<{ data: unknown; error: unknown }>,
  ): Promise<Row[]> {
    const all: Row[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await run(from, from + PAGE_SIZE - 1);
      if (error) {
        throw new InternalServerErrorException('Unable to load statistics');
      }
      const rows = Array.isArray(data) ? (data as Row[]) : [];
      all.push(...rows);
      if (rows.length < PAGE_SIZE) break;
    }
    return all;
  }
}
