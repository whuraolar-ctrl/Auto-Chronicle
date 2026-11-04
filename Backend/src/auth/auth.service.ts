import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import type { User } from '@supabase/supabase-js';

import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import { CURRENT_TERMS_VERSION, RESERVED_USERNAMES } from './auth.constants';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateProfileDto } from '../profiles/dto/update-profile.dto';
import { CompleteProfileDto } from './dto/complete-profile.dto';
import { normalizePhone } from '../common/utils/phone';

@Injectable()
export class AuthService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const email = dto.email.trim().toLowerCase();
    const username = dto.username.toLowerCase();
    this.assertUsernameAllowed(username);
    await this.assertUnique(email, dto.phone, username);

    const { data, error } = await this.supabase.createAuthClient().auth.signUp({
      email,
      password: dto.password,
      options: {
        emailRedirectTo: `${this.config.getOrThrow<string>('FRONTEND_URL')}/login`,
      },
    });
    if (error || !data.user) {
      throw new BadRequestException('Could not create account');
    }

    const { error: profileError } = await this.supabase.admin
      .from('profiles')
      .insert({
        id: data.user.id,
        first_name: dto.firstName.trim(),
        last_name: dto.lastName.trim(),
        email,
        phone: dto.phone,
        username,
        ...this.consentFields(dto.accountType),
      });

    if (profileError) {
      // Roll back the auth user so email/username can be reused.
      await this.supabase.admin.auth.admin.deleteUser(data.user.id);
      //23505 = unique violation
      if (profileError.code === '23505') {
        throw new ConflictException(
          'Email, phone number, or username is already in use',
        );
      }
      throw new InternalServerErrorException('Could not create account');
    }

    return {
      message:
        'Registration successful. Check your email to verify your account using the link provided.',
    };
  }

  async login(dto: LoginDto) {
    const email = await this.resolveEmail(dto.identifier);

    const { data, error } = await this.supabase
      .createAuthClient()
      .auth.signInWithPassword({ email, password: dto.password });

    if (error || !data.session) {
      if (error?.code === 'email_not_confirmed') {
        throw new ForbiddenException(
          'Please verify your email before logging in',
        );
      }
      throw new UnauthorizedException('Invalid credentials');
    }

    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresIn: data.session.expires_in,
      user: { id: data.user.id, email: data.user.email },
    };
  }

  /** Swaps a refresh token for a new access + refresh token pair. */
  async refresh(refreshToken: string) {
    const { data, error } = await this.supabase
      .createAuthClient()
      .auth.refreshSession({ refresh_token: refreshToken });

    if (error || !data.session) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    return {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresIn: data.session.expires_in,
    };
  }

  /** Ends this session on Supabase so its refresh token stops working. */
  async logout(accessToken: string) {
    const { error } = await this.supabase.admin.auth.admin.signOut(
      accessToken,
      'local',
    );
    if (error) {
      throw new BadRequestException('Unable to log out');
    }
    return { message: 'Logged out successfully' };
  }

  async resendVerification(email: string) {
    const { error } = await this.supabase.createAuthClient().auth.resend({
      type: 'signup',
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: `${this.config.getOrThrow<string>('FRONTEND_URL')}/login`,
      },
    });

    if (error) {
      throw new BadRequestException(error.message);
    }

    // Same response whether or not the account exists.
    return {
      message:
        'If an unverified account exists with this email, a new verification link has been sent.',
    };
  }

  async forgotPassword(email: string) {
    if (!email) {
      throw new BadRequestException('Email is required.');
    }

    const { error } = await this.supabase
      .createAuthClient()
      .auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: this.config.getOrThrow<string>(
          'PASSWORD_RESET_REDIRECT_URL',
        ),
      });

    if (error) {
      throw new BadRequestException(error.message);
    }

    return {
      message:
        'If an account exists with this email, a password reset link has been sent.',
    };
  }

  async resetPassword(dto: ResetPasswordDto, accessToken: string) {
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match.');
    }

    const {
      data: { user },
      error: userError,
    } = await this.supabase.createAuthClient().auth.getUser(accessToken);

    if (userError || !user) {
      throw new UnauthorizedException(
        'Invalid or expired authorization token.',
      );
    }

    // supabase-js's `updateUser` needs a full stored session (access *and*
    // refresh token), but the reset flow only hands us the recovery access
    // token. Call the GoTrue `/user` endpoint directly with that token instead
    // — it's the same request `updateUser` makes under the hood, and it accepts
    // a recovery access token on its own.
    const res = await fetch(
      `${this.config.getOrThrow<string>('SUPABASE_URL')}/auth/v1/user`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          apikey: this.config.getOrThrow<string>('SUPABASE_PUBLISHABLE_KEY'),
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ password: dto.password }),
      },
    );

    if (!res.ok) {
      let message = 'Unable to update password.';
      try {
        const body = await res.json();
        if (body?.msg) message = body.msg;
        else if (body?.message) message = body.message;
      } catch {
        // Non-JSON error body — fall back to the generic message.
      }
      throw new BadRequestException(message);
    }

    await this.supabase.admin.auth.admin.signOut(accessToken, 'global');
    const data = await res.json();

    return {
      message: 'Password updated successfully.',
      user: data.user,
    };
  }

  async googleLogin() {
    const { data, error } = await this.supabase
      .createAuthClient()
      .auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: this.config.getOrThrow<string>(
            'GOOGLE_AUTH_REDIRECT_URL',
          ),
        },
      });

    if (error) {
      throw new BadRequestException(error.message);
    }

    return {
      message: 'Google authentication started',
      url: data.url,
    };
  }

  /** Current user plus their profile (null until a Google user completes it). */
  async getMe(user: User) {
    const { data, error } = await this.supabase.admin
      .from('profiles')
      .select(
        'id, first_name, last_name, email, phone, username, avatar_url, account_type, created_at',
      )
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException('Unable to load profile');
    }

    return {
      id: user.id,
      email: user.email,
      createdAt: user.created_at,
      profileComplete: !!data,
      profile: data
        ? {
            ...data,
            created_at: user.created_at,
          }
        : null,
    };
  }

  async updateProfile(user: User, dto: UpdateProfileDto) {
    const { data: existingProfile, error: profileError } =
      await this.supabase.admin
        .from('profiles')
        .select('id, first_name, last_name, email, phone, username')
        .eq('id', user.id)
        .maybeSingle();
    if (profileError) {
      throw new InternalServerErrorException('Unable to load your profile.');
    }
    if (!existingProfile) {
      throw new BadRequestException('Complete your profile before editing it.');
    }
    const updates: Record<string, string> = {};
    if (dto.firstName !== undefined) {
      const firstName = dto.firstName.trim();
      if (!firstName) {
        throw new BadRequestException('First name cannot be empty.');
      }
      updates.first_name = firstName;
    }
    if (dto.lastName !== undefined) {
      const lastName = dto.lastName.trim();
      if (!lastName) {
        throw new BadRequestException('Last name cannot be empty.');
      }
      updates.last_name = lastName;
    }
    if (dto.username !== undefined) {
      const username = dto.username.trim().toLowerCase();
      this.assertUsernameAllowed(username);
      if (username !== existingProfile.username) {
        const { count, error } = await this.supabase.admin
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('username', username)
          .neq('id', user.id);
        if (error) {
          throw new InternalServerErrorException(
            'Unable to check username availability.',
          );
        }
        if (count && count > 0) {
          throw new ConflictException('That username is already in use.');
        }
      }
      updates.username = username;
    }
    if (dto.phone !== undefined) {
      const phone = dto.phone;
      if (phone !== existingProfile.phone) {
        const { count, error } = await this.supabase.admin
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('phone', phone)
          .neq('id', user.id);
        if (error) {
          throw new InternalServerErrorException(
            'Unable to check phone number availability.',
          );
        }
        if (count && count > 0) {
          throw new ConflictException('That phone number is already in use.');
        }
      }
      updates.phone = phone;
    }
    if (Object.keys(updates).length === 0) {
      throw new BadRequestException(
        'Provide at least one profile field to update.',
      );
    }
    const { data, error } = await this.supabase.admin
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
      .select('id, first_name, last_name, email, phone, username')
      .single();
    if (error) {
      if (error.code === '23505') {
        throw new ConflictException(
          'The username or phone number is already in use.',
        );
      }
      throw new InternalServerErrorException('Unable to update your profile.');
    }
    return { message: 'Profile updated successfully.', profile: data };
  }

  /** Create a profile for an existing authenticated user. */
  async completeProfile(user: User, dto: CompleteProfileDto) {
    if (!user.email) {
      throw new BadRequestException('Account has no email address');
    }

    const { count, error: existsError } = await this.supabase.admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('id', user.id);
    if (existsError) {
      throw new InternalServerErrorException('Unable to load profile');
    }
    if (count) throw new ConflictException('Profile is already complete');

    const email = user.email.toLowerCase();
    const username = dto.username.toLowerCase();
    this.assertUsernameAllowed(username);
    await this.assertUnique(email, dto.phone, username);

    const { error } = await this.supabase.admin.from('profiles').insert({
      id: user.id,
      first_name: dto.firstName.trim(),
      last_name: dto.lastName.trim(),
      email,
      phone: dto.phone,
      username,
      ...this.consentFields(dto.accountType),
    });

    if (error) {
      if (error.code === '23505') {
        throw new ConflictException(
          'Email, phone number, or username is already in use',
        );
      }
      throw new InternalServerErrorException('Could not save profile');
    }

    return { message: 'Profile completed successfully' };
  }

  async usernameAvailable(username: string) {
    const value = username.toLocaleLowerCase();
    if (RESERVED_USERNAMES.has(value)) return { available: false };

    const { count, error } = await this.supabase.admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('username', value);

    if (error) {
      throw new InternalServerErrorException('Unable to check username');
    }
    return { available: !count };
  }

  private assertUsernameAllowed(username: string) {
    if (RESERVED_USERNAMES.has(username)) {
      throw new ConflictException('Username is already taken');
    }
  }

  private consentFields(accountType: string) {
    return {
      account_type: accountType,
      terms_version: CURRENT_TERMS_VERSION,
      terms_accepted_at: new Date().toISOString(),
    };
  }

  /** Turns an email, phone, or username into the account's email. */
  private async resolveEmail(identifier: string): Promise<string> {
    const value = identifier.trim();
    if (value.includes('@')) return value.toLowerCase();

    const isPhone = /^\+?[\d\s-]{7,}$/.test(value);
    const column = isPhone ? 'phone' : 'username';
    const lookup = isPhone
      ? String(normalizePhone(value)).replace(/[\s-]/g, '')
      : value.toLowerCase();

    const { data } = await this.supabase.admin
      .from('profiles')
      .select('email')
      .eq(column, lookup)
      .maybeSingle();

    // Same error as a wrong password, so accounts can't be probed.
    if (!data) throw new UnauthorizedException('Invalid credentials');
    return data.email;
  }

  private async assertUnique(email: string, phone: string, username: string) {
    const check = (column: string, value: string) =>
      this.supabase.admin
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq(column, value);

    const [e, p, u] = await Promise.all([
      check('email', email),
      check('phone', phone),
      check('username', username),
    ]);

    if (e.error || p.error || u.error) {
      throw new InternalServerErrorException(
        'Unable to validate registration details.',
      );
    }

    if (e.count) throw new ConflictException('Email is already in use');
    if (p.count) throw new ConflictException('Phone number is already in use');
    if (u.count) throw new ConflictException('Username is already taken');
  }
}
