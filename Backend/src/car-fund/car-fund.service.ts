import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { paginate } from '../common/pagination/paginate';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateCarFundContributionDto } from './dto/create-car-fund-contribution.dto';
import { CreateCarFundSpendingDto } from './dto/create-car-fund-spending.dto';
import { ListCarFundContributionsQueryDto } from './dto/list-car-fund-contributions-query.dto';
import {
  ContributionCadence,
  UpdateCarFundGoalDto,
} from './dto/update-car-fund-goal.dto';

type CarFundRow = {
  id: string;
  user_id: string;
  target_amount: number | string;
  currency: string;
  target_date: string | null;
  contribution_cadence: ContributionCadence | null;
  planned_contribution_amount: number | string | null;
  reminders_enabled: boolean;
  created_at: string;
  updated_at: string;
};

type ContributionRow = {
  id: string;
  amount: number | string;
  contributed_at: string;
  note: string | null;
  created_at: string;
};

type SpendingRow = {
  id: string;
  amount: number | string;
  spent_at: string;
  note: string | null;
  created_at: string;
};

const FUND_COLUMNS =
  'id, user_id, target_amount, currency, target_date, contribution_cadence, planned_contribution_amount, reminders_enabled, created_at, updated_at';
const CONTRIBUTION_COLUMNS = 'id, amount, contributed_at, note, created_at';
const SPENDING_COLUMNS = 'id, amount, spent_at, note, created_at';

@Injectable()
export class CarFundService {
  constructor(private readonly supabase: SupabaseService) {}

  async get(userId: string) {
    const fund = await this.findFund(userId, false);
    if (!fund) {
      return { fund: null, balance: 0, spent: 0, progressPercent: 0 };
    }
    return this.toSummary(fund);
  }

  async updateGoal(userId: string, dto: UpdateCarFundGoalDto) {
    const currency = dto.currency.toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new BadRequestException(
        'currency must be a three-letter currency code',
      );
    }

    const cadence = dto.contributionCadence ?? null;
    const plannedAmount = dto.plannedContributionAmount ?? null;
    const remindersEnabled =
      dto.remindersEnabled ?? Boolean(cadence && plannedAmount);

    if (Boolean(cadence) !== Boolean(plannedAmount)) {
      throw new BadRequestException(
        'Choose both a contribution cadence and planned contribution amount',
      );
    }
    if (remindersEnabled && (!cadence || !plannedAmount)) {
      throw new BadRequestException(
        'Choose a cadence and planned amount to enable reminders',
      );
    }

    const { data: profile, error: profileError } = await this.supabase.admin
      .from('profiles')
      .select('timezone')
      .eq('id', userId)
      .maybeSingle();
    if (profileError) {
      throw new InternalServerErrorException(
        'Unable to load Car Fund reminder preferences',
      );
    }
    const localToday = this.localToday(profile?.timezone);

    const targetDate = dto.targetDate ?? null;
    if (targetDate && targetDate < new Date().toISOString().slice(0, 10)) {
      throw new BadRequestException('targetDate cannot be in the past');
    }
    if (targetDate && new Date(`${targetDate}T00:00:00.000Z`) <= new Date()) {
      throw new BadRequestException('targetDate must be a future date');
    }

    const existingFund = await this.findFund(userId, false);
    if (existingFund && existingFund.currency !== currency) {
      const { count, error: countError } = await this.supabase.admin
        .from('car_fund_contributions')
        .select('id', { count: 'exact', head: true })
        .eq('fund_id', existingFund.id);
      if (countError) {
        throw new InternalServerErrorException(
          'Unable to validate Car Fund currency',
        );
      }
      if (count) {
        throw new ConflictException(
          'Currency cannot be changed after contributions have been recorded',
        );
      }
    }

    const { data, error } = await this.supabase.admin
      .from('car_funds')
      .upsert(
        {
          user_id: userId,
          target_amount: dto.targetAmount,
          currency,
          target_date: targetDate,
          contribution_cadence: cadence,
          planned_contribution_amount: plannedAmount,
          reminders_enabled: remindersEnabled,
          reminder_anchor_day: localToday.getUTCDate(),
          next_reminder_date: remindersEnabled
            ? this.nextDate(localToday, cadence!)
            : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      )
      .select(FUND_COLUMNS)
      .single();

    if (error || !data) {
      if (error?.message.includes('car_fund_currency_has_contributions')) {
        throw new ConflictException(
          'Currency cannot be changed after contributions have been recorded',
        );
      }
      throw new InternalServerErrorException('Unable to save Car Fund goal');
    }
    return this.toSummary(data as CarFundRow);
  }

  async addContribution(userId: string, dto: CreateCarFundContributionDto) {
    const fund = await this.findFund(userId, true);
    const contributedAt = dto.contributedAt ?? new Date().toISOString();
    if (new Date(contributedAt).getTime() > Date.now()) {
      throw new BadRequestException('contributedAt cannot be in the future');
    }

    const { data, error } = await this.supabase.admin
      .from('car_fund_contributions')
      .insert({
        fund_id: fund.id,
        user_id: userId,
        amount: dto.amount,
        contributed_at: contributedAt,
        note: dto.note?.trim() || null,
      })
      .select(CONTRIBUTION_COLUMNS)
      .single();

    if (error || !data) {
      throw new InternalServerErrorException('Unable to record contribution');
    }

    const summary = await this.toSummary(fund);
    return {
      contribution: this.toContribution(data as ContributionRow),
      ...summary,
    };
  }

  async listContributions(
    userId: string,
    query: ListCarFundContributionsQueryDto,
  ) {
    const fund = await this.findFund(userId, true);
    const { data, count, error } = await this.supabase.admin
      .from('car_fund_contributions')
      .select(CONTRIBUTION_COLUMNS, { count: 'exact' })
      .eq('fund_id', fund.id)
      .eq('user_id', userId)
      .order('contributed_at', { ascending: false })
      .range(query.offset, query.offset + query.limit - 1);

    if (error) {
      throw new InternalServerErrorException('Unable to load contributions');
    }
    return paginate(
      ((data ?? []) as ContributionRow[]).map((row) =>
        this.toContribution(row),
      ),
      count ?? 0,
      query,
    );
  }

  async recordSpending(userId: string, dto: CreateCarFundSpendingDto) {
    const spentAt = dto.spentAt ?? new Date().toISOString();
    if (new Date(spentAt).getTime() > Date.now()) {
      throw new BadRequestException('spentAt cannot be in the future');
    }

    const { data, error } = await this.supabase.admin.rpc(
      'record_car_fund_spending',
      {
        p_user_id: userId,
        p_amount: dto.amount,
        p_spent_at: spentAt,
        p_note: dto.note?.trim() || null,
      },
    );

    if (error) {
      if (error.message.includes('car_fund_not_found')) {
        throw new NotFoundException('Car Fund goal not found');
      }
      if (error.message.includes('car_fund_spending_exceeds_balance')) {
        throw new BadRequestException(
          'Spending cannot exceed your current Car Fund balance',
        );
      }
      if (error.message.includes('invalid_car_fund_spending')) {
        throw new BadRequestException('Invalid Car Fund spending details');
      }
      throw new InternalServerErrorException(
        'Unable to record Car Fund spending',
      );
    }
    if (!data) {
      throw new InternalServerErrorException(
        'Unable to record Car Fund spending',
      );
    }

    const fund = await this.findFund(userId, true);
    return {
      spending: this.toSpending(data as SpendingRow),
      ...(await this.toSummary(fund)),
    };
  }

  async listSpending(userId: string, query: ListCarFundContributionsQueryDto) {
    const fund = await this.findFund(userId, true);
    const { data, count, error } = await this.supabase.admin
      .from('car_fund_spending')
      .select(SPENDING_COLUMNS, { count: 'exact' })
      .eq('fund_id', fund.id)
      .eq('user_id', userId)
      .order('spent_at', { ascending: false })
      .range(query.offset, query.offset + query.limit - 1);

    if (error) {
      throw new InternalServerErrorException(
        'Unable to load Car Fund spending',
      );
    }
    return paginate(
      ((data ?? []) as SpendingRow[]).map((row) => this.toSpending(row)),
      count ?? 0,
      query,
    );
  }

  async deleteContribution(userId: string, contributionId: string) {
    const { data, error } = await this.supabase.admin
      .from('car_fund_contributions')
      .delete()
      .eq('id', contributionId)
      .eq('user_id', userId)
      .select('id')
      .maybeSingle();

    if (error) {
      if (error.message.includes('car_fund_contribution_is_spent')) {
        throw new BadRequestException(
          'This contribution cannot be removed because part of it has already been recorded as spending',
        );
      }
      throw new InternalServerErrorException('Unable to delete contribution');
    }
    if (!data) throw new NotFoundException('Contribution not found');

    return this.get(userId);
  }

  private async toSummary(fund: CarFundRow) {
    let balanceMinor = 0;
    for (let from = 0; ; from += 1000) {
      const { data, error } = await this.supabase.admin
        .from('car_fund_contributions')
        .select('amount')
        .eq('fund_id', fund.id)
        .eq('user_id', fund.user_id)
        .order('id')
        .range(from, from + 999);

      if (error) {
        throw new InternalServerErrorException('Unable to calculate Car Fund');
      }
      balanceMinor += (data ?? []).reduce(
        (total, row) => total + Math.round(Number(row.amount) * 100),
        0,
      );
      if ((data?.length ?? 0) < 1000) break;
    }
    let spentMinor = 0;
    for (let from = 0; ; from += 1000) {
      const { data, error } = await this.supabase.admin
        .from('car_fund_spending')
        .select('amount')
        .eq('fund_id', fund.id)
        .eq('user_id', fund.user_id)
        .order('id')
        .range(from, from + 999);

      if (error) {
        throw new InternalServerErrorException('Unable to calculate Car Fund');
      }
      spentMinor += (data ?? []).reduce(
        (total, row) => total + Math.round(Number(row.amount) * 100),
        0,
      );
      if ((data?.length ?? 0) < 1000) break;
    }
    const balance = (balanceMinor - spentMinor) / 100;
    const targetAmount = Number(fund.target_amount);
    const remaining = Math.max(0, targetAmount - balance);
    const daysRemaining = fund.target_date
      ? Math.max(
          1,
          Math.ceil(
            (new Date(`${fund.target_date}T00:00:00.000Z`).getTime() -
              Date.now()) /
              86_400_000,
          ),
        )
      : null;
    const suggestedContributions = daysRemaining
      ? {
          daily: this.roundSuggestion(remaining / daysRemaining),
          weekly: this.roundSuggestion((remaining * 7) / daysRemaining),
          monthly: this.roundSuggestion((remaining * 30.4375) / daysRemaining),
        }
      : null;

    return {
      fund: {
        id: fund.id,
        targetAmount,
        currency: fund.currency,
        targetDate: fund.target_date,
        contributionCadence: fund.contribution_cadence,
        plannedContributionAmount:
          fund.planned_contribution_amount === null
            ? null
            : Number(fund.planned_contribution_amount),
        remindersEnabled: fund.reminders_enabled,
      },
      balance,
      spent: spentMinor / 100,
      remaining,
      progressPercent:
        targetAmount === 0
          ? 0
          : Math.min(100, Math.round((balance / targetAmount) * 100)),
      suggestedContributions,
    };
  }

  private roundSuggestion(amount: number) {
    if (amount <= 0) return 0;
    const step = amount >= 10_000 ? 1_000 : amount >= 1_000 ? 100 : 10;
    return Math.ceil(amount / step) * step;
  }

  private toContribution(row: ContributionRow) {
    return {
      id: row.id,
      amount: Number(row.amount),
      contributedAt: row.contributed_at,
      note: row.note,
      createdAt: row.created_at,
    };
  }

  private toSpending(row: SpendingRow) {
    return {
      id: row.id,
      amount: Number(row.amount),
      spentAt: row.spent_at,
      note: row.note,
      createdAt: row.created_at,
    };
  }

  private async findFund(userId: string, required: true): Promise<CarFundRow>;
  private async findFund(
    userId: string,
    required: false,
  ): Promise<CarFundRow | null>;
  private async findFund(
    userId: string,
    required: boolean,
  ): Promise<CarFundRow | null> {
    const { data, error } = await this.supabase.admin
      .from('car_funds')
      .select(FUND_COLUMNS)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException('Unable to load Car Fund');
    }
    if (!data && required)
      throw new NotFoundException('Car Fund goal not found');
    return data as CarFundRow | null;
  }

  private nextDate(from: Date, cadence: ContributionCadence) {
    const next = new Date(from);
    if (cadence === 'daily') next.setUTCDate(next.getUTCDate() + 1);
    if (cadence === 'weekly') next.setUTCDate(next.getUTCDate() + 7);
    if (cadence === 'monthly') {
      const anchorDay = next.getUTCDate();
      next.setUTCDate(1);
      next.setUTCMonth(next.getUTCMonth() + 1);
      const daysInMonth = new Date(
        Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
      ).getUTCDate();
      next.setUTCDate(Math.min(anchorDay, daysInMonth));
    }
    return next.toISOString().slice(0, 10);
  }

  private localToday(timezone?: string | null) {
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || 'Africa/Lagos',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    return new Date(`${today}T00:00:00.000Z`);
  }
}
