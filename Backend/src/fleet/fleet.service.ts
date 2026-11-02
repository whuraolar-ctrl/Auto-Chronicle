import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { ExpensesService } from '../expenses/expenses.service';
import type { DriverReportRow } from '../driver-reports/driver-reports.mapper';
import { toDriverReportResponse } from '../driver-reports/driver-reports.mapper';
import { CreateFleetDto } from './dto/create-fleet.dto';
import { FleetDashboardQueryDto } from './dto/fleet-dashboard-query.dto';

const REPORT_COLUMNS =
  'id, vehicle_id, fleet_id, reported_by, category, severity, timing, description, odometer_reading, occurred_at, status, logged_by, logged_at, dismissed_by, dismissed_at, created_at, updated_at';
const PAGE_SIZE = 1000;

@Injectable()
export class FleetService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly expenses: ExpensesService,
  ) {}

  async create(userId: string, dto: CreateFleetDto) {
    const { data, error } = await this.supabase.admin
      .from('fleets')
      .insert({ owner_id: userId, name: dto.name.trim() })
      .select('id, owner_id, name, created_at')
      .single();

    if (error || !data) {
      throw new InternalServerErrorException('Unable to create fleet');
    }
    return data;
  }

  async list(userId: string) {
    const { data: owned, error: ownedError } = await this.supabase.admin
      .from('fleets')
      .select('id, owner_id, name, created_at')
      .eq('owner_id', userId);
    if (ownedError) {
      throw new InternalServerErrorException('Unable to load fleets');
    }

    const { data: memberships, error: membershipError } =
      await this.supabase.admin
        .from('fleet_members')
        .select('fleet_id')
        .eq('user_id', userId);
    if (membershipError) {
      throw new InternalServerErrorException('Unable to load fleets');
    }

    const ids = (memberships ?? []).map((member) => member.fleet_id);
    const { data: memberFleets, error: fleetError } = ids.length
      ? await this.supabase.admin
          .from('fleets')
          .select('id, owner_id, name, created_at')
          .in('id', ids)
      : { data: [], error: null };
    if (fleetError) {
      throw new InternalServerErrorException('Unable to load fleets');
    }

    return [
      ...new Map(
        [...(owned ?? []), ...(memberFleets ?? [])].map((fleet) => [
          fleet.id,
          fleet,
        ]),
      ).values(),
    ];
  }

  async assignVehicle(userId: string, fleetId: string, vehicleId: string) {
    await this.assertFleetOwner(userId, fleetId);

    const { data, error } = await this.supabase.admin
      .from('vehicles')
      .update({ fleet_id: fleetId, updated_at: new Date().toISOString() })
      .eq('id', vehicleId)
      .eq('user_id', userId)
      .select('id, name, fleet_id')
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException('Unable to assign vehicle to fleet');
    }
    if (!data) throw new NotFoundException('Owned vehicle not found');
    return data;
  }

  async dashboard(userId: string, query: FleetDashboardQueryDto) {
    await this.assertFleetAccess(userId, query.fleetId);

    const vehicles = await this.fetchFleetVehicles(query.fleetId);
    const activeVehicles = vehicles.filter((vehicle) => !vehicle.is_archived);
    const vehicleIds = activeVehicles.map((vehicle) => vehicle.id);
    const vehicleIdsSet = new Set(vehicleIds);

    /*
     * The issue scan, monthly expenses, and new-report lookup are independent,
     * so run them concurrently instead of sequentially — this was previously
     * the main reason the dashboard endpoint felt slow to load.
     */
    const [issues, monthlyExpenses, reportsResult] = await Promise.all([
      this.fetchFleetIssues(vehicleIds),
      this.expenses.monthly(
        userId,
        { month: query.month ?? new Date().getMonth() + 1, year: query.year ?? new Date().getFullYear(), months: 1 },
        vehicleIds,
      ),
      this.supabase.admin
        .from('driver_reports')
        .select(REPORT_COLUMNS, { count: 'exact' })
        .eq('fleet_id', query.fleetId)
        .eq('status', 'new')
        .order('created_at', { ascending: false })
        .limit(5),
    ]);
    const vehicleIdsNeedingAttention = new Set(
      activeVehicles
        .filter(
          (vehicle) =>
            vehicle.next_service !== null &&
            vehicle.next_service <= new Date().toISOString().slice(0, 10),
        )
        .map((vehicle) => vehicle.id),
    );
    const vehicleIdsNotReady = new Set<string>();

    for (const issue of issues) {
      if (!vehicleIdsSet.has(issue.vehicle_id)) continue;
      vehicleIdsNeedingAttention.add(issue.vehicle_id);
      if (issue.severity === 'cannot_be_driven') {
        vehicleIdsNotReady.add(issue.vehicle_id);
      }
    }

    const month = query.month ?? new Date().getMonth() + 1;
    const year = query.year ?? new Date().getFullYear();
    const { data: newReports, count, error: reportsError } = reportsResult;

    if (reportsError) {
      throw new InternalServerErrorException('Unable to load fleet dashboard');
    }

    return {
      fleetId: query.fleetId,
      totalVehicles: activeVehicles.length,
      vehiclesNeedingAttention: vehicleIdsNeedingAttention.size,
      vehiclesReadyToDrive: activeVehicles.length - vehicleIdsNotReady.size,
      newDriverReports: {
        count: count ?? 0,
        recent: ((newReports ?? []) as DriverReportRow[]).map(
          toDriverReportResponse,
        ),
      },
      monthlyExpenses: {
        month,
        year,
        total: monthlyExpenses.total,
        currency: monthlyExpenses.currency,
      },
    };
  }

  private async fetchFleetVehicles(fleetId: string) {
    const vehicles: {
      id: string;
      next_service: string | null;
      is_archived: boolean;
    }[] = [];

    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await this.supabase.admin
        .from('vehicles')
        .select('id, next_service, is_archived')
        .eq('fleet_id', fleetId)
        .order('id')
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        throw new InternalServerErrorException('Unable to load fleet dashboard');
      }
      vehicles.push(...(data ?? []));
      if ((data?.length ?? 0) < PAGE_SIZE) break;
    }
    return vehicles;
  }

  private async fetchFleetIssues(vehicleIds: string[]) {
    const issues: { vehicle_id: string; severity: string }[] = [];
    for (let i = 0; i < vehicleIds.length; i += 100) {
      const ids = vehicleIds.slice(i, i + 100);
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await this.supabase.admin
          .from('issues')
          .select('vehicle_id, severity')
          .in('vehicle_id', ids)
          .neq('status', 'fixed')
          .order('id')
          .range(from, from + PAGE_SIZE - 1);

        if (error) {
          throw new InternalServerErrorException('Unable to load fleet dashboard');
        }
        issues.push(...(data ?? []));
        if ((data?.length ?? 0) < PAGE_SIZE) break;
      }
    }
    return issues;
  }

  private async assertFleetOwner(userId: string, fleetId: string) {
    const { data: fleet, error: fleetError } = await this.supabase.admin
      .from('fleets')
      .select('id')
      .eq('id', fleetId)
      .eq('owner_id', userId)
      .maybeSingle();
    if (fleetError) {
      throw new InternalServerErrorException('Unable to verify fleet access');
    }
    if (fleet) return;
    throw new ForbiddenException('Fleet owner access is required');
  }

  private async assertFleetAccess(userId: string, fleetId: string) {
    const { data: fleet, error: fleetError } = await this.supabase.admin
      .from('fleets')
      .select('id')
      .eq('id', fleetId)
      .eq('owner_id', userId)
      .maybeSingle();
    if (fleetError) {
      throw new InternalServerErrorException('Unable to verify fleet access');
    }
    if (fleet) return;

    const { data: member, error: memberError } = await this.supabase.admin
      .from('fleet_members')
      .select('role')
      .eq('fleet_id', fleetId)
      .eq('user_id', userId)
      .maybeSingle();
    if (memberError) {
      throw new InternalServerErrorException('Unable to verify fleet access');
    }
    if (!member) {
      throw new NotFoundException('Fleet not found');
    }
  }
}