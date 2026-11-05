import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { convertMinor, fromMinor, toMinor } from '../common/utils/money';
import { VehicleAccessService } from '../common/vehicle-access/vehicle-access.service';
import { DEFAULT_CURRENCY } from '../repairs/repairs.constants';
import { SupabaseService } from '../supabase/supabase.service';
import { MonthlyExpensesQueryDto } from './dto/monthly-expenses-query.dto';
import { ExchangeRateService } from './exchange-rate.service';

const PAGE_SIZE = 1000; // Supabase returns at most 1000 rows per request
const CHUNK_SIZE = 100; // keeps `.in(...)` filters a safe length

type RepairLite = {
  id: string;
  vehicle_id: string;
  repair_date: string; // YYYY-MM-DD
  amount: number | string;
  currency: string;
};
type PartLite = { repair_id: string; part_name: string; amount: number | string };

const pad = (n: number) => String(n).padStart(2, '0');
const firstOfMonth = (year: number, month: number) => `${year}-${pad(month)}-01`;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** The `count` months ending with (year, month), oldest first. */
function monthsEndingAt(year: number, month: number, count: number) {
  const out: { year: number; month: number }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(year, month - 1 - i, 1));
    out.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 });
  }
  return out;
}

/** * Monthly expenses are calculated from repair records. There is. */
@Injectable()
export class ExpensesService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly access: VehicleAccessService,
    private readonly exchangeRates: ExchangeRateService,
  ) {}

  async monthly(
    userId: string,
    query: MonthlyExpensesQueryDto,
    vehicleScope?: string[],
  ) {
    const { year, month } = query;
    const trendLength = query.months ?? 6;
    const currency = (await this.preferredCurrency(userId)) ?? DEFAULT_CURRENCY;

    const trendMonths = monthsEndingAt(year, month, trendLength);
    const next = new Date(Date.UTC(year, month, 1));
    const rangeStart = firstOfMonth(trendMonths[0].year, trendMonths[0].month);
    const rangeEnd = firstOfMonth(next.getUTCFullYear(), next.getUTCMonth() + 1); // exclusive
    const monthStart = firstOfMonth(year, month);

    const accessibleVehicles = await this.access.listAccessibleVehicles(userId);
    const scopedIds =
      vehicleScope === undefined ? undefined : new Set(vehicleScope);
    const vehicles =
      scopedIds === undefined
        ? accessibleVehicles
        : accessibleVehicles.filter((vehicle) => scopedIds.has(vehicle.id));
    const repairs =
      vehicles.length === 0
        ? []
        : await this.fetchRepairs(vehicles.map((v) => v.id), rangeStart, rangeEnd);

    const sourceCurrencies = [...new Set(repairs.map((repair) => repair.currency))];
    const exchangeRates = await Promise.all(
      sourceCurrencies.map(async (baseCurrency) => ({
        baseCurrency,
        ...(await this.exchangeRates.getRate(baseCurrency, currency)),
      })),
    );
    const rateByCurrency = new Map(
      exchangeRates.map(({ baseCurrency, rate }) => [baseCurrency, rate]),
    );
    const toTargetMinor = (amount: number | string, sourceCurrency: string) => {
      const rate = rateByCurrency.get(sourceCurrency);

      if (rate === undefined) {
        throw new InternalServerErrorException('Unable to convert expense currency');
      }

      return convertMinor(
        toMinor(amount, sourceCurrency),
        rate,
        sourceCurrency,
        currency,
      );
    };
    const minorByRepairId = new Map(
      repairs.map((repair) => [
        repair.id,
        toTargetMinor(repair.amount, repair.currency),
      ]),
    );
    const monthRepairs = repairs.filter((repair) => repair.repair_date >= monthStart);

    // ----- monthly trend
    const trendMinor = new Map<string, number>();
    for (const repair of repairs) {
      const key = repair.repair_date.slice(0, 7);
      trendMinor.set(
        key,
        (trendMinor.get(key) ?? 0) + (minorByRepairId.get(repair.id) ?? 0),
      );
    }
    const monthlyTrend = trendMonths.map((m) => ({
      year: m.year,
      month: m.month,
      total: fromMinor(trendMinor.get(`${m.year}-${pad(m.month)}`) ?? 0, currency),
    }));

    // ----- selected month: total and by vehicle
    let totalMinor = 0;
    const vehicleMinor = new Map<string, number>();
    for (const r of monthRepairs) {
      const minor = minorByRepairId.get(r.id) ?? 0;
      totalMinor += minor;
      vehicleMinor.set(r.vehicle_id, (vehicleMinor.get(r.vehicle_id) ?? 0) + minor);
    }
    const vehicleById = new Map(vehicles.map((v) => [v.id, v]));
    const byVehicle = [...vehicleMinor.entries()]
      .map(([vehicleId, minor]) => ({
        vehicleId,
        name: vehicleById.get(vehicleId)?.name ?? null,
        plateNumber: vehicleById.get(vehicleId)?.plate_number ?? null,
        amount: fromMinor(minor, currency),
        _minor: minor,
      }))
      .sort((a, b) => b._minor - a._minor)
      .map(({ _minor, ...rest }) => rest);

    // ----- selected month: by part (parts only; unallocated cost is not a part)
    const parts =
      monthRepairs.length === 0 ? [] : await this.fetchParts(monthRepairs.map((r) => r.id));
    const partMinor = new Map<string, { label: string; minor: number }>();
    const partsPerRepair = new Map<string, number>();
    const repairCurrencyById = new Map(
      monthRepairs.map((repair) => [repair.id, repair.currency]),
    );
    for (const p of parts) {
      const label = p.part_name.trim();
      const key = label.toLowerCase();
      const repairCurrency = repairCurrencyById.get(p.repair_id);
      if (!repairCurrency) {
        throw new InternalServerErrorException('Unable to determine repair currency');
      }

      const minor = toTargetMinor(p.amount, repairCurrency);
      const entry = partMinor.get(key) ?? { label, minor: 0 };
      entry.minor += minor;
      partMinor.set(key, entry);
      partsPerRepair.set(p.repair_id, (partsPerRepair.get(p.repair_id) ?? 0) + minor);
    }
    const byPart = [...partMinor.values()]
      .sort((a, b) => b.minor - a.minor)
      .map((e) => ({ partName: e.label, amount: fromMinor(e.minor, currency) }));

    // Cost not tied to any part. Shown under "By vehicle" totals, not "By part".
    let unallocatedMinor = 0;
    for (const r of monthRepairs) {
      unallocatedMinor += Math.max(
        0,
        (minorByRepairId.get(r.id) ?? 0) - (partsPerRepair.get(r.id) ?? 0),
      );
    }

    return {
      month,
      year,
      currency,
      exchangeRates: exchangeRates
        .filter(({ baseCurrency }) => baseCurrency !== currency)
        .map(({ baseCurrency, rate, asOf }) => ({ baseCurrency, rate, asOf })),
      total: fromMinor(totalMinor, currency),
      unallocatedTotal: fromMinor(unallocatedMinor, currency),
      monthlyTrend,
      byPart,
      byVehicle,
    };
  }
  /**
   * Builds a CSV for the selected month: by-vehicle and by-part rows.
   * Caller must enforce canExport (PlanGuard on the route).
   */
  async exportMonthlyCsv(userId: string, query: MonthlyExpensesQueryDto) {
    const data = await this.monthly(userId, query);
    const pad = (n: number) => String(n).padStart(2, '0');
    const monthLabel = `\( {data.year}- \){pad(data.month)}`;

    const escape = (value: string | number | null | undefined) => {
      const raw = value == null ? '' : String(value);
      if (/[",\n\r]/.test(raw)) {
        return `"${raw.replace(/"/g, '""')}"`;
      }
      return raw;
    };

    const lines: string[] = [];
    lines.push('section,label,amount,currency,month');

    lines.push(
      [
        'summary',
        'total',
        escape(data.total),
        escape(data.currency),
        escape(monthLabel),
      ].join(','),
    );
    lines.push(
      [
        'summary',
        'unallocated',
        escape(data.unallocatedTotal),
        escape(data.currency),
        escape(monthLabel),
      ].join(','),
    );

    for (const row of data.byVehicle) {
      const label = [row.name, row.plateNumber].filter(Boolean).join(' · ') || row.vehicleId;
      lines.push(
        [
          'vehicle',
          escape(label),
          escape(row.amount),
          escape(data.currency),
          escape(monthLabel),
        ].join(','),
      );
    }

    for (const row of data.byPart) {
      lines.push(
        [
          'part',
          escape(row.partName),
          escape(row.amount),
          escape(data.currency),
          escape(monthLabel),
        ].join(','),
      );
    }

    const csv = lines.join('\n') + '\n';
    const filename = `auto-chronicle-expenses-${monthLabel}.csv`;
    return { filename, csv };
                                            }

  private async preferredCurrency(userId: string): Promise<string | null> {
    const { data } = await this.supabase.admin
      .from('profiles')
      .select('preferred_currency')
      .eq('id', userId)
      .maybeSingle();
    return (data?.preferred_currency as string | null | undefined) ?? null;
  }

  private async fetchRepairs(vehicleIds: string[], from: string, to: string) {
    const rows: RepairLite[] = [];
    for (const ids of chunk(vehicleIds, CHUNK_SIZE)) {
      rows.push(
        ...((await this.pageAll((start, end) =>
          this.supabase.admin
            .from('repairs')
            .select('id, vehicle_id, repair_date, amount, currency')
            .in('vehicle_id', ids)
            .gte('repair_date', from)
            .lt('repair_date', to)
            .order('repair_date', { ascending: true })
            .order('id', { ascending: true })
            .range(start, end),
        )) as RepairLite[]),
      );
    }
    return rows;
  }

  private async fetchParts(repairIds: string[]) {
    const rows: PartLite[] = [];
    for (const ids of chunk(repairIds, CHUNK_SIZE)) {
      rows.push(
        ...((await this.pageAll((start, end) =>
          this.supabase.admin
            .from('repair_parts')
            .select('id, repair_id, part_name, amount')
            .in('repair_id', ids)
            .order('id', { ascending: true })
            .range(start, end),
        )) as PartLite[]),
      );
    }
    return rows;
  }

  /** Reads every page of a query (Supabase caps each response at 1000 rows). */
  private async pageAll(
    run: (
      start: number,
      end: number,
    ) => PromiseLike<{ data: unknown[] | null; error: unknown }>,
  ): Promise<unknown[]> {
    const all: unknown[] = [];
    for (let start = 0; ; start += PAGE_SIZE) {
      const { data, error } = await run(start, start + PAGE_SIZE - 1);
      if (error) throw new InternalServerErrorException('Unable to load expenses');
      all.push(...(data ?? []));
      if ((data?.length ?? 0) < PAGE_SIZE) break;
    }
    return all;
  }
}
