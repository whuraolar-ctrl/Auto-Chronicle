import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

/** Verifies Authorization: Bearer <access token> and attaches the user to. */
@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(private readonly supabase: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const header: string = req.headers['authorization'] ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) {
      throw new UnauthorizedException('Authorization token is required');
    }

    const { data, error } = await this.supabase
      .createAuthClient()
      .auth.getUser(token);
    if (error || !data.user) {
      throw new UnauthorizedException('Invalid or expired authorization token');
    }

    req.user = data.user;
    return true;
  }
}
