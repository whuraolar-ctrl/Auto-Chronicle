import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';

const POLL_INTERVAL_MS = 15 * 60 * 1000;
const PAGE_SIZE = 1000;

type ProfileEmail = {
  id: string;
  email: string;
  first_name: string;
  timezone: string | null;
};

type DueVehicle = {
  id: string;
  user_id: string;
  name: string;
  next_service: string;
};

type DueFund = {
  id: string;
  user_id: string;
  target_amount: number | string;
  currency: string;
  planned_contribution_amount: number | string;
  contribution_cadence: string;
  next_reminder_date: string;
  target_date: string | null;
};

@Injectable()
export class EmailRemindersService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailRemindersService.name);
  private interval?: ReturnType<typeof setInterval>;
  private running = false;
  private remindersDisabled = false;

  constructor(
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    const apiKey = this.config.getOrThrow<string>('RESEND_API_KEY');
    const from = this.config.getOrThrow<string>('EMAIL_FROM');

    if (!apiKey || !from) {
      this.remindersDisabled = true;

      this.logger.warn('Email reminders are disabled: RESEND_API_KEY and/or EMAIL_FROM is missing. Configure both environment variables and redeploy to enable reminders.',
      );
      return;
    }

    void this.dispatch().catch((error:unknown) => {
      this.logger.error('Email reminder dispatch failed',
        error instanceof Error ? error.stack : String(error),
      );
    });
    this.interval = setInterval(() => {
      void this.dispatch().catch((error:unknown) => {
        this.logger.error('Email reminder dispatch failed',
          error instanceof Error ? error.stack : String(error),
        );
      });
    }, POLL_INTERVAL_MS);
    this.interval.unref?.();
  }

  onModuleDestroy() {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }

  private async dispatch() {
    if (this.remindersDisabled || this.running) return;
    this.running = true;
    try {
      const [vehicles, funds] = await Promise.all([
        this.loadDueServiceVehicles(),
        this.loadDueFunds(),
      ]);
      const userIds = [
        ...new Set([
          ...vehicles.map((vehicle) => vehicle.user_id),
          ...funds.map((fund) => fund.user_id),
        ]),
      ];
      if (userIds.length === 0) return;

      const profiles = await this.loadProfiles(userIds);
      for (const vehicle of vehicles) {
        const profile = profiles.get(vehicle.user_id);
        if (!profile) continue;
        const localDate = this.localDate(new Date(), profile.timezone);
        if (vehicle.next_service > localDate) continue;

        const key = `service:${vehicle.id}:${vehicle.user_id}:${vehicle.next_service}`;
        const name = profile.first_name.trim() || 'there';
        const vehicleName = vehicle.name;
        const text = [
          `Hello ${name},`,
          '',
          `This is a friendly reminder that ${vehicleName} is due for service on ${vehicle.next_service}.`,
          'Booking a service appointment can help you stay ahead of maintenance and keep your vehicle in good condition.',
          '',
          'You can review the vehicle and update its service date in Auto-Chronicle once the service is complete.',
          '',
          'Take care,',
          'The Auto-Chronicle team',
        ].join('\n');
        await this.sendOnce(
          key,
          profile.email,
          `Service reminder for ${vehicleName}`,
          this.emailHtml(
            `Hello ${this.escape(name)},`,
            `<p>This is a friendly reminder that <strong>${this.escape(vehicleName)}</strong> is due for service on <strong>${vehicle.next_service}</strong>.</p><p>Booking a service appointment can help you stay ahead of maintenance and keep your vehicle in good condition.</p><p>You can review the vehicle and update its service date in Auto-Chronicle once the service is complete.</p>`,
          ),
          text,
          'service',
        );
      }

      for (const fund of funds) {
        const profile = profiles.get(fund.user_id);
        if (!profile) continue;
        const localDate = this.localDate(new Date(), profile.timezone);
        if (fund.next_reminder_date > localDate || this.localHour(profile.timezone) < 9) {
          continue;
        }

        const { data: shouldSend, error: prepareError } =
          await this.supabase.admin.rpc('prepare_car_fund_reminder', {
            p_fund_id: fund.id,
            p_expected_date: fund.next_reminder_date,
          });
        if (prepareError) {
          this.logger.error('Could not validate Car Fund reminder');
          continue;
        }
        if (!shouldSend) continue;

        const key = `car-fund:${fund.id}:${fund.next_reminder_date}`;
        const name = profile.first_name.trim() || 'there';
        const amount = `${fund.currency} ${Number(fund.planned_contribution_amount).toFixed(2)}`;
        const target = `${fund.currency} ${Number(fund.target_amount).toFixed(2)}`;
        const dateLine = fund.target_date
          ? `Your current target date is ${fund.target_date}.`
          : '';
        const text = [
          `Hello ${name},`,
          '',
          `This is your ${fund.contribution_cadence} Car Fund reminder. You planned to set aside ${amount} for your goal of ${target}.`,
          dateLine,
          '',
          'When you have made a contribution outside the app, you can record it in Car Fund to keep your progress up to date.',
          'Auto-Chronicle does not collect, hold, or transfer this money; this reminder does not make a payment.',
          '',
          'Every step toward your goal counts.',
          'The Auto-Chronicle team',
        ]
          .filter(Boolean)
          .join('\n');
        await this.sendOnce(
          key,
          profile.email,
          `Your ${fund.contribution_cadence} Car Fund reminder`,
          this.emailHtml(
            `Hello ${this.escape(name)},`,
            `<p>This is your <strong>${this.escape(fund.contribution_cadence)}</strong> Car Fund reminder. You planned to set aside <strong>${this.escape(amount)}</strong> toward your goal of <strong>${this.escape(target)}</strong>.</p>${fund.target_date ? `<p>Your current target date is ${this.escape(fund.target_date)}.</p>` : ''}<p>When you have made a contribution outside the app, you can record it in Car Fund to keep your progress up to date.</p><p><strong>Auto-Chronicle does not collect, hold, or transfer this money; this reminder does not make a payment.</strong></p><p>Every step toward your goal counts.</p>`,
          ),
          text,
          'car_fund',
          { fundId: fund.id, dueDate: fund.next_reminder_date, localDate },
        );
      }
    } finally {
      this.running = false;
    }
  }

  private async loadDueServiceVehicles(): Promise<DueVehicle[]> {
    const rows: DueVehicle[] = [];
    const latestDueDate = new Date();
    latestDueDate.setUTCDate(latestDueDate.getUTCDate() + 2);
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await this.supabase.admin
        .from('vehicles')
        .select('id, user_id, name, next_service')
        .eq('is_archived', false)
        .not('next_service', 'is', null)
        .lte('next_service', latestDueDate.toISOString().slice(0, 10))
        .order('id')
        .range(from, from + PAGE_SIZE - 1);
      if (error) {
        throw new InternalServerErrorException(
          'Unable to load service reminders',
        );
      }
      rows.push(...((data ?? []) as DueVehicle[]));
      if ((data?.length ?? 0) < PAGE_SIZE) return rows;
    }
  }

  private async loadDueFunds(): Promise<DueFund[]> {
    const rows: DueFund[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await this.supabase.admin
        .from('car_funds')
        .select(
          'id, user_id, target_amount, currency, target_date, planned_contribution_amount, contribution_cadence, next_reminder_date',
        )
        .eq('reminders_enabled', true)
        .not('next_reminder_date', 'is', null)
        .order('id')
        .range(from, from + PAGE_SIZE - 1);
      if (error) {
        throw new InternalServerErrorException(
          'Unable to load Car Fund reminders',
        );
      }
      rows.push(...((data ?? []) as DueFund[]));
      if ((data?.length ?? 0) < PAGE_SIZE) return rows;
    }
  }

  private async loadProfiles(userIds: string[]) {
    const profiles = new Map<string, ProfileEmail>();
    for (let i = 0; i < userIds.length; i += 100) {
      const { data, error } = await this.supabase.admin
        .from('profiles')
        .select('id, email, first_name, timezone')
        .in('id', userIds.slice(i, i + 100));
      if (error) {
        throw new InternalServerErrorException(
          'Unable to load reminder recipients',
        );
      }
      for (const profile of (data ?? []) as ProfileEmail[]) {
        profiles.set(profile.id, profile);
      }
    }
    return profiles;
  }

  private async sendOnce(
    key: string,
    email: string,
    subject: string,
    html: string,
    text: string,
    kind: 'service' | 'car_fund',
    fundContext?: { fundId: string; dueDate: string; localDate: string },
  ) {
    const { data: deliveryId, error: claimError } =
      await this.supabase.admin.rpc('claim_email_reminder', {
        p_reminder_key: key,
      });
    if (claimError) {
      this.logger.error(`Could not claim ${kind} reminder`);
      return;
    }
    if (!deliveryId) return;

    try {
      await this.sendEmail(email, subject, html, text);
    } catch {
      const { error: failureError } = await this.supabase.admin.rpc(
        'fail_email_reminder',
        {
          p_delivery_id: deliveryId,
        },
      );
      if (failureError) {
        this.logger.error(`Could not mark failed ${kind} reminder`);
      }
      this.logger.error(`Could not send ${kind} reminder email`);
      return;
    }

    const { error: completionError } =
      kind === 'car_fund' && fundContext
        ? await this.supabase.admin.rpc('complete_car_fund_reminder', {
            p_delivery_id: deliveryId,
            p_fund_id: fundContext.fundId,
            p_expected_date: fundContext.dueDate,
            p_local_date: fundContext.localDate,
          })
        : await this.supabase.admin.rpc('complete_email_reminder', {
            p_delivery_id: deliveryId,
          });
    if (completionError) {
      this.logger.error(
        `Email sent but reminder completion failed for ${kind}`,
      );
    }
  }

  private async sendEmail(
    to: string,
    subject: string,
    html: string,
    text: string,
  ) {
    const apiKey = this.config.getOrThrow<string>('RESEND_API_KEY');
    const from = this.config.getOrThrow<string>('EMAIL_FROM');
    if (!apiKey || !from) {
      throw new InternalServerErrorException(
        'Email reminders require RESEND_API_KEY and EMAIL_FROM',
      );
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, html, text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new InternalServerErrorException('Email provider rejected request');
    }
  }

  private emailHtml(greeting: string, body: string) {
    return `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937;max-width:600px;margin:0 auto;padding:24px"><h2 style="color:#14532d">Auto-Chronicle</h2><p>${greeting}</p>${body}<p style="margin-top:32px;color:#6b7280">You received this email because reminders are enabled for your Auto-Chronicle account.</p></div>`;
  }

  private localDate(date: Date, timezone: string | null) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || 'Africa/Lagos',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }

  private localHour(timezone: string | null) {
    return Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone || 'Africa/Lagos',
        hour: '2-digit',
        hourCycle: 'h23',
      }).format(new Date()),
    );
  }

  private escape(value: string) {
    return value.replace(/[&<>"']/g, (character) => {
      const entities: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      };
      return entities[character];
    });
  }
}
