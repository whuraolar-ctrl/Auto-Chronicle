import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { User } from '@supabase/supabase-js';

import { RESERVED_USERNAMES } from '../auth/auth.constants';
import { SupabaseService } from '../supabase/supabase.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { isValidTimezone, PROFILE_COLUMNS } from './profile.constants';

type ChangeEmailDto = {
  newEmail: string;
};

type ProfileRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  username: string | null;
  avatar_url: string | null;
  account_type: string;
  preferred_currency: string | null;
  locale: string | null;
  timezone: string | null;
  distance_unit: string | null;
  created_at: string;
};

function toProfileResponse(row: ProfileRow) {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    username: row.username,
    avatarUrl: row.avatar_url,
    accountType: row.account_type,
    preferences: {
      currency: row.preferred_currency,
      locale: row.locale,
      timezone: row.timezone,
      distanceUnit: row.distance_unit,
    },
    createdAt: row.created_at,
  };
}

@Injectable()
export class ProfileService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
  ) {}

  async get(user: User) {
    const { data, error } = await this.supabase.admin
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException('Unable to load profile');
    }

    if (!data) {
      throw new NotFoundException(
        'Profile not found. Please complete your profile first.',
      );
    }

    const row = data as ProfileRow;

    /** After the user confirms an email change, Supabase Auth has. */
    const authEmail = user.email?.toLowerCase();

    if (authEmail && authEmail !== row.email) {
      const { data: synced } = await this.supabase.admin
        .from('profiles')
        .update({ email: authEmail, updated_at: new Date().toISOString() })
        .eq('id', user.id)
        .select(PROFILE_COLUMNS)
        .maybeSingle();

      if (synced) {
        return toProfileResponse(synced as ProfileRow);
      }
    }

    return toProfileResponse(row);
  }

  async getStatistics(user: User) {
    const [activeVehicles, archivedVehicles, driverReports, resolvedIssues] =
      await Promise.all([
        this.supabase.admin
          .from('vehicles')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('is_archived', false),
        this.supabase.admin
          .from('vehicles')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('is_archived', true),
        this.supabase.admin
          .from('driver_reports')
          .select('id', { count: 'exact', head: true })
          .eq('reported_by', user.id),
        this.supabase.admin
          .from('issues')
          .select('id', { count: 'exact', head: true })
          .eq('reported_by', user.id)
          .eq('status', 'fixed'),
      ]);

    if (
      activeVehicles.error ||
      archivedVehicles.error ||
      driverReports.error ||
      resolvedIssues.error
    ) {
      throw new InternalServerErrorException(
        'Unable to load profile statistics',
      );
    }

    const activeVehicleCount = activeVehicles.count ?? 0;
    const archivedVehicleCount = archivedVehicles.count ?? 0;

    return {
      activeVehicles: activeVehicleCount,
      archivedVehicles: archivedVehicleCount,
      totalVehicles: activeVehicleCount + archivedVehicleCount,
      driverReports: driverReports.count ?? 0,
      resolvedIssues: resolvedIssues.count ?? 0,
    };
  }

  async update(userId: string, dto: UpdateProfileDto) {
    const changes: Record<string, string> = {};

    if (dto.firstName !== undefined) {
      changes.first_name = dto.firstName.trim();
    }
    if (dto.lastName !== undefined) {
      changes.last_name = dto.lastName.trim();
    }
    if (dto.phone !== undefined) {
      changes.phone = dto.phone;
    }
    if (dto.accountType !== undefined) {
      changes.account_type = dto.accountType;
    }
    if (dto.avatarUrl !== undefined) {
      const supabaseUrl = this.config
      .getOrThrow<string>('SUPABASE_URL')
      .replace(/\/$/, ''); // Remove trailing slash if present
      const ownFolder = `${supabaseUrl}/storage/v1/object/public/profile-avatars/${userId}/`;

      if (dto.avatarUrl && !dto.avatarUrl.startsWith(ownFolder)) {
        throw new BadRequestException(
          'avatarUrl must be an image in your own profile folder',
        );
      }
      changes.avatar_url = dto.avatarUrl;
    }
    if (dto.username !== undefined) {
      const username = dto.username.toLowerCase();

      if (RESERVED_USERNAMES.has(username)) {
        throw new ConflictException('Username is already taken');
      }

      changes.username = username;
    }

    if (Object.keys(changes).length === 0) {
      throw new BadRequestException('No changes provided');
    }

    await this.assertUniqueExceptSelf(userId, changes.phone, changes.username);
    return this.save(userId, changes);
  }

  async updatePreferences(userId: string, dto: UpdatePreferencesDto) {
    const changes: Record<string, string> = {};

    if (dto.currency !== undefined) {
      changes.preferred_currency = dto.currency;
    }
    if (dto.locale !== undefined) {
      changes.locale = dto.locale;
    }
    if (dto.distanceUnit !== undefined) {
      changes.distance_unit = dto.distanceUnit;
    }
    if (dto.timezone !== undefined) {
      if (!isValidTimezone(dto.timezone)) {
        throw new BadRequestException(
          'timezone must be a valid timezone, e.g. Africa/Lagos',
        );
      }

      changes.timezone = dto.timezone;
    }

    if (Object.keys(changes).length === 0) {
      throw new BadRequestException('No changes provided');
    }

    return this.save(userId, changes);
  }

  async changePassword(
    user: User,
    accessToken: string,
    dto: ChangePasswordDto & { currentPassword: string },
  ) {
    const currentPassword = dto.currentPassword;

    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    if (dto.newPassword === currentPassword) {
      throw new BadRequestException(
        'New password must be different from the current password',
      );
    }

    await this.verifyCurrentPassword(
      user,
      currentPassword,
      'This account signs in with Google and has no password. Use "Forgot password" to set one.',
    );

    const { error } = await this.supabase.admin.auth.admin.updateUserById(
      user.id,
      {
        password: dto.newPassword,
      },
    );

    if (error) {
      throw new BadRequestException('Unable to update password');
    }

    // Log out every OTHER device. This session stays signed in. Best effort.
    await this.supabase.admin.auth.admin.signOut(accessToken, 'others');

    return { message: 'Password updated successfully' };
  }

  /** * Starts an email change. Supabase emails a confirmation link;. */
  async changeEmail(user: User, accessToken: string, dto: ChangeEmailDto) {
    const newEmail = dto.newEmail.trim().toLowerCase();

    if (newEmail === user.email?.toLowerCase()) {
      throw new BadRequestException(
        'New email must be different from the current email',
      );
    }

    const { count, error: lookupError } = await this.supabase.admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('email', newEmail)
      .neq('id', user.id);

    if (lookupError) {
      throw new InternalServerErrorException('Unable to validate email');
    }

    if (count) {
      throw new ConflictException('Email is already in use');
    }

    const redirectTo = `${this.config.getOrThrow<string>('FRONTEND_URL')}/profile`;
    const res = await fetch(
      `${this.config.getOrThrow<string>('SUPABASE_URL')}/auth/v1/user?redirect_to=${encodeURIComponent(redirectTo)}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          apikey: this.config.getOrThrow<string>('SUPABASE_PUBLISHABLE_KEY'),
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ email: newEmail }),
      },
    );

    if (!res.ok) {
      let message = 'Unable to start email change';

      try {
        const body = await res.json();
        message = body?.msg ?? body?.message ?? message;
      } catch {
        // Non-JSON error body: keep the generic message.
      }

      throw new BadRequestException(message);
    }

    return {
      message: `We sent a confirmation link to ${newEmail}. Your email changes once you confirm it.`,
      pendingEmail: newEmail,
    };
  }

  /** Signs the user out of every device, including this one. */
  async revokeAllSessions(accessToken: string) {
    const { error } = await this.supabase.admin.auth.admin.signOut(
      accessToken,
      'global',
    );

    if (error) {
      throw new BadRequestException('Unable to sign out of all devices');
    }

    return { message: 'Signed out of all devices' };
  }

  /** Confirms the user's password. Rejects Google-only accounts (they have no. */
  private async verifyCurrentPassword(
    user: User,
    password: string,
    googleOnlyMessage: string,
  ) {
    const providers = (user.app_metadata?.providers as
      string[] | undefined) ?? [user.app_metadata?.provider];

    if (!user.email || !providers.includes('email')) {
      throw new BadRequestException(googleOnlyMessage);
    }

    // Return 400 so the app treats this as a bad password, not an expired session.
    const { error } = await this.supabase
      .createAuthClient()
      .auth.signInWithPassword({ email: user.email, password });

    if (error) {
      throw new BadRequestException('Current password is incorrect');
    }
  }

  private async save(userId: string, changes: Record<string, string>) {
    const { data, error } = await this.supabase.admin
      .from('profiles')
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select(PROFILE_COLUMNS)
      .maybeSingle();

    if (error) {
      if (error.code === '23505') {
        throw new ConflictException(
          'Phone number or username is already in use',
        );
      }

      throw new InternalServerErrorException('Unable to update profile');
    }

    if (!data) {
      throw new NotFoundException(
        'Profile not found. Please complete your profile first.',
      );
    }

    return toProfileResponse(data as ProfileRow);
  }

  /** Same as sign-up uniqueness checks, but ignores the user's own row. */
  private async assertUniqueExceptSelf(
    userId: string,
    phone?: string,
    username?: string,
  ) {
    const taken = async (column: string, value: string) => {
      const { count, error } = await this.supabase.admin
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq(column, value)
        .neq('id', userId);

      if (error) {
        throw new InternalServerErrorException(
          'Unable to validate profile details',
        );
      }

      return !!count;
    };

    if (phone && (await taken('phone', phone))) {
      throw new ConflictException('Phone number is already in use');
    }

    if (username && (await taken('username', username))) {
      throw new ConflictException('Username is already taken');
    }
  }
}
