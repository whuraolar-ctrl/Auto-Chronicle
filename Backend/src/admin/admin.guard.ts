import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
    InternalServerErrorException,
} from '@nestjs/common'; 
import type { User } from '@supabase/supabase-js';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class AdminGuard implements CanActivate {
    constructor(private readonly supabase: SupabaseService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const user: User | undefined = context.switchToHttp().getRequest().user;
        const email = user?.email?.toLowerCase();

        if (!user || !email || !user.email_confirmed_at) {
            throw new ForbiddenException('Admin access only');
        }

        const { data, error } = await this.supabase.admin
            .from('admin_allowlist')
            .select('email')
            .eq('email', email)
            .maybeSingle();
        
        if (error) {
            throw new InternalServerErrorException('Unable to verify admin access');
        }
        if (!data) {
            throw new ForbiddenException('Admin access only');
        }
        return true;
    }
}