import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { paginate } from '../common/pagination/paginate';
import { VehicleAccessService } from '../common/vehicle-access/vehicle-access.service';
import { SupabaseService } from '../supabase/supabase.service';
import type { IssueRow } from '../issues/issues.mapper';
import { toIssueResponse } from '../issues/issues.mapper';
import { CreateDriverReportDto } from './dto/create-driver-reports.dto';
import { ListDriverReportsQueryDto } from './dto/list-driver-reports-query.dto';
import type { DriverReportRow } from './driver-reports.mapper';
import { toDriverReportResponse } from './driver-reports.mapper';

const REPORT_COLUMNS =
  'id, vehicle_id, fleet_id, reported_by, category, severity, timing, description, odometer_reading, occurred_at, status, logged_by, logged_at, dismissed_by, dismissed_at, created_at, updated_at';

@Injectable()
export class DriverReportsService {
  private readonly logger = new Logger(DriverReportsService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly access: VehicleAccessService,
  ) {}

  async submit(userId: string, vehicleId: string, dto: CreateDriverReportDto) {
    await this.access.assertCanAccess(userId, vehicleId);
    if (dto.occurredAt && new Date(dto.occurredAt).getTime() > Date.now()) {
      throw new BadRequestException('occurredAt cannot be in the future');
    }

    const { data, error } = await this.supabase.admin
      .from('driver_reports')
      .insert({
        vehicle_id: vehicleId,
        reported_by: userId,
        category: dto.category,
        severity: dto.severity,
        timing: dto.timing,
        description: dto.description?.trim() || null,
        odometer_reading: dto.odometerReading ?? null,
        occurred_at: dto.occurredAt ?? null,
        status: 'new',
      })
      .select(REPORT_COLUMNS)
      .single();

    if (error || !data) {
      this.logger.error('Driver report insert failed');
      throw new InternalServerErrorException('Unable to submit driver report');
    }
    return toDriverReportResponse(data as DriverReportRow);
  }

  async list(
    userId: string,
    vehicleId: string,
    query: ListDriverReportsQueryDto,
  ) {
    await this.access.assertCanAccess(userId, vehicleId);

    let request = this.supabase.admin
      .from('driver_reports')
      .select(REPORT_COLUMNS, { count: 'exact' })
      .eq('vehicle_id', vehicleId);

    if (query.status) request = request.eq('status', query.status);

    const { data, count, error } = await request
      .order('created_at', { ascending: false })
      .range(query.offset, query.offset + query.limit - 1);

    if (error) {
      throw new InternalServerErrorException('Unable to load driver reports');
    }
    return paginate(
      await this.withIssueStatus(
        ((data ?? []) as DriverReportRow[]).map(toDriverReportResponse),
      ),
      count ?? 0,
      query,
    );
  }

  async listAuthorized(userId: string, query: ListDriverReportsQueryDto) {
    const vehicles = await this.access.listAccessibleVehicles(userId);
    const vehicleIds = vehicles.map((vehicle) => vehicle.id);
    if (vehicleIds.length === 0) return paginate([], 0, query);

    let request = this.supabase.admin
      .from('driver_reports')
      .select(REPORT_COLUMNS, { count: 'exact' })
      .in('vehicle_id', vehicleIds);

    if (query.status) request = request.eq('status', query.status);

    const { data, count, error } = await request
      .order('created_at', { ascending: false })
      .range(query.offset, query.offset + query.limit - 1);

    if (error) {
      throw new InternalServerErrorException('Unable to load driver reports');
    }
    return paginate(
      await this.withIssueStatus(
        ((data ?? []) as DriverReportRow[]).map(toDriverReportResponse),
      ),
      count ?? 0,
      query,
    );
  }

  async getOne(userId: string, reportId: string) {
    const report = await this.findReport(reportId);
    await this.access.assertCanAccess(userId, report.vehicle_id);
    return toDriverReportResponse(report);
  }

  async convert(userId: string, reportId: string) {
    const report = await this.findReport(reportId);
    await this.access.assertCanManageVehicle(userId, report.vehicle_id);

    const { data, error } = await this.supabase.admin.rpc(
      'convert_driver_report_to_issue',
      { p_report_id: reportId, p_actor_id: userId },
    );

    if (error) {
      if (
        error.code === 'P0001' &&
        error.message.includes('driver_report_not_found')
      ) {
        throw new NotFoundException('Driver report not found');
      }
      if (
        error.code === 'P0001' &&
        error.message.includes('driver_report_not_convertible')
      ) {
        throw new ConflictException(
          'Driver report is not eligible for conversion',
        );
      }
      this.logger.error(`Driver report conversion failed for ${reportId}`);
      throw new InternalServerErrorException('Unable to convert driver report');
    }
    if (!data) {
      throw new InternalServerErrorException('Unable to convert driver report');
    }
    return toIssueResponse(data as IssueRow);
  }

  async dismiss(userId: string, reportId: string) {
    const report = await this.findReport(reportId);
    await this.access.assertCanManageVehicle(userId, report.vehicle_id);

    const { data, error } = await this.supabase.admin.rpc(
      'dismiss_driver_report',
      { p_report_id: reportId, p_actor_id: userId },
    );

    if (error) {
      if (
        error.code === 'P0001' &&
        error.message.includes('driver_report_not_found')
      ) {
        throw new NotFoundException('Driver report not found');
      }
      if (
        error.code === 'P0001' &&
        error.message.includes('driver_report_not_dismissible')
      ) {
        throw new ConflictException('Driver report is no longer new');
      }
      this.logger.error(`Driver report dismissal failed for ${reportId}`);
      throw new InternalServerErrorException('Unable to dismiss driver report');
    }
    if (!data) {
      throw new InternalServerErrorException('Unable to dismiss driver report');
    }
    return toDriverReportResponse(data as DriverReportRow);
  }

  private async findReport(reportId: string): Promise<DriverReportRow> {
    const { data, error } = await this.supabase.admin
      .from('driver_reports')
      .select(REPORT_COLUMNS)
      .eq('id', reportId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException('Unable to load driver report');
    }
    if (!data) throw new NotFoundException('Driver report not found');
    return data as DriverReportRow;
  }

  private async withIssueStatus(
    reports: Array<ReturnType<typeof toDriverReportResponse>>,
  ) {
    const loggedReportIds = reports
      .filter((report) => report.status === 'logged')
      .map((report) => report.id);
    const issuesByReport = new Map<string, { id: string; status: string }>();

    if (loggedReportIds.length) {
      const { data, error } = await this.supabase.admin
        .from('issues')
        .select('id, source_driver_report_id, status')
        .in('source_driver_report_id', loggedReportIds);
      if (error) {
        throw new InternalServerErrorException('Unable to load driver reports');
      }
      for (const issue of data ?? []) {
        if (issue.source_driver_report_id) {
          issuesByReport.set(issue.source_driver_report_id, {
            id: issue.id,
            status: issue.status,
          });
        }
      }
    }

    return reports.map((report) => {
      const issue = issuesByReport.get(report.id);
      return {
        ...report,
        issueId: issue?.id ?? null,
        issueStatus: issue?.status ?? null,
      };
    });
  }
}
