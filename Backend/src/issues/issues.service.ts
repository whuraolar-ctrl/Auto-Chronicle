import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';

import { paginate } from '../common/pagination/paginate';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateIssueDto } from './dto/create-issue.dto';
import { ListIssuesQueryDto } from './dto/list-issues-query.dto';
import { UpdateIssueStatusDto } from './dto/update-issue-status.dto';
import { ALLOWED_TRANSITIONS, ISSUE_COLUMNS } from './issues.constants';
import {
  IssueHistoryRow,
  IssueRow,
  toHistoryResponse,
  toIssueResponse,
} from './issues.mapper';
import { VehicleAccessService } from '../common/vehicle-access/vehicle-access.service';

@Injectable()
export class IssuesService {
  private readonly logger = new Logger(IssuesService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly access: VehicleAccessService,
  ) {}

  async create(
    userId: string,
    vehicleId: string,
    dto: CreateIssueDto,
    idempotencyKey: string,
  ) {
    await this.access.assertCanAccess(userId, vehicleId);

    if (!idempotencyKey || !/^[A-Za-z0-9._:-]{1,128}$/.test(idempotencyKey)) {
      throw new BadRequestException('Idempotency-Key must be 1-128 valid characters');
    }

    if (dto.occurredAt && new Date(dto.occurredAt).getTime() > Date.now()) {
      throw new BadRequestException('occurredAt cannot be in the future');
    }

    const requestHash = createHash('sha256')
      .update(
        JSON.stringify({
          category: dto.category,
          severity: dto.severity,
          timing: dto.timing,
          description: dto.description?.trim() || null,
          odometerReading: dto.odometerReading ?? null,
          occurredAt: dto.occurredAt ? new Date(dto.occurredAt).toISOString() : null,
        }),
      )
      .digest('hex');

    const issueInsert = {
      vehicle_id: vehicleId,
      reported_by: userId,
      category: dto.category,
      severity: dto.severity,
      timing: dto.timing,
      description: dto.description?.trim() || null,
      odometer_reading: dto.odometerReading ?? null,
      occurred_at: dto.occurredAt ?? null,
      status: 'reported',
      idempotency_key: idempotencyKey,
      request_hash: requestHash,
    };

    const { data, error } = await this.supabase.admin
      .from('issues')
      .insert(issueInsert)
      .select(ISSUE_COLUMNS)
      .single();

    if (error?.code === '23505') {
      const { data: existing, error: lookupError } = await this.supabase.admin
        .from('issues')
        .select(`${ISSUE_COLUMNS}, request_hash`)
        .eq('reported_by', userId)
        .eq('vehicle_id', vehicleId)
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();

      if (lookupError) {
        throw new InternalServerErrorException('Unable to check issue retry');
      }

      if (existing) {
        if (existing.request_hash !== requestHash) {
          throw new ConflictException(
            'Idempotency-Key was already used for a different issue request',
          );
        }

        return toIssueResponse(existing as IssueRow);
      }
    }

    if (error || !data) {
      throw new InternalServerErrorException('Unable to report issue');
    }

    const issue = data as IssueRow;

    // First history entry. If it fails, remove the issue so nothing is half-saved.
    // (A database function would make this one atomic step. See the notes file.)
    const { error: historyError } = await this.supabase.admin
      .from('issue_status_history')
      .insert({
        issue_id: issue.id,
        changed_by: userId,
        old_status: null,
        new_status: 'reported',
      });

    if (historyError) {
      this.logger.error(`History insert failed for issue ${issue.id}`);
      await this.supabase.admin.from('issues').delete().eq('id', issue.id);
      throw new InternalServerErrorException('Unable to report issue');
    }

    return toIssueResponse(issue);
  }

  async list(userId: string, vehicleId: string, query: ListIssuesQueryDto) {
    await this.access.assertCanAccess(userId, vehicleId);

    let request = this.supabase.admin
      .from('issues')
      .select(ISSUE_COLUMNS, { count: 'exact' })
      .eq('vehicle_id', vehicleId);

    if (query.status) {
      request = request.eq('status', query.status);
    }

    const { data, count, error } = await request
      .order('reported_at', { ascending: false })
      .range(query.offset, query.offset + query.limit - 1);

    if (error) {
      throw new InternalServerErrorException('Unable to load issues');
    }

    return paginate((data as IssueRow[]).map(toIssueResponse), count ?? 0, query);
  }

  async get(userId: string, issueId: string) {
    const issue = await this.findAuthorized(userId, issueId);

    const { data, error } = await this.supabase.admin
      .from('issue_status_history')
      .select('id, changed_by, old_status, new_status, note, changed_at')
      .eq('issue_id', issueId)
      .order('changed_at', { ascending: true });

    if (error) {
      throw new InternalServerErrorException('Unable to load issue');
    }

    return {
      ...toIssueResponse(issue),
      statusHistory: (data as IssueHistoryRow[]).map(toHistoryResponse),
    };
  }

  async updateStatus(userId: string, issueId: string, dto: UpdateIssueStatusDto) {
    const issue = await this.findAuthorized(userId, issueId);

    if (dto.status === issue.status) {
      throw new BadRequestException(`Issue is already ${issue.status}`);
    }

    if (!ALLOWED_TRANSITIONS[issue.status].includes(dto.status)) {
      throw new BadRequestException(
        `An issue cannot move from ${issue.status} to ${dto.status}`,
      );
    }

    // Only update if the status is still what we just read, so two people
    // changing it at the same moment can't overwrite each other silently.
    const { data, error } = await this.supabase.admin
      .from('issues')
      .update({ status: dto.status, updated_at: new Date().toISOString() })
      .eq('id', issueId)
      .eq('status', issue.status)
      .select(ISSUE_COLUMNS)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException('Unable to update issue');
    }

    if (!data) {
      throw new ConflictException(
        'The issue status has changed. Please refresh and try again.',
      );
    }

    const { error: historyError } = await this.supabase.admin
      .from('issue_status_history')
      .insert({
        issue_id: issueId,
        changed_by: userId,
        old_status: issue.status,
        new_status: dto.status,
        note: dto.note?.trim() || null,
      });

    if (historyError) {
      this.logger.error(`History insert failed for issue ${issueId}`);

      // Put the old status back so the history and the issue agree.
      await this.supabase.admin
        .from('issues')
        .update({ status: issue.status, updated_at: new Date().toISOString() })
        .eq('id', issueId);

      throw new InternalServerErrorException('Unable to update issue');
    }

    return toIssueResponse(data as IssueRow);
  }

  /** Loads an issue, then checks the user may access its. */
  private async findAuthorized(userId: string, issueId: string): Promise<IssueRow> {
    const { data, error } = await this.supabase.admin
      .from('issues')
      .select(ISSUE_COLUMNS)
      .eq('id', issueId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException('Unable to load issue');
    }

    if (!data) {
      throw new NotFoundException('Issue not found');
    }

    const issue = data as IssueRow;

    try {
      await this.access.assertCanAccess(userId, issue.vehicle_id);
    } catch (e) {
      if (e instanceof NotFoundException) {
        throw new NotFoundException('Issue not found');
      }
      throw e;
    }

    return issue;
  }
}
