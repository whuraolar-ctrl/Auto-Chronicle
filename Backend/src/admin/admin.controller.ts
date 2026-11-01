import {
    Controller,
    Get,
    Query,
    UseGuards,
} from '@nestjs/common';
import type { User } from '@supabase/supabase-js';
import { CurrentUser } from '../auth/current-user.decorator';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';
import { AdminOverviewQueryDto } from './dto/admin-overview-query.dto';

@Controller('admin')
@UseGuards(SupabaseAuthGuard, AdminGuard)
export class AdminController {
    constructor(private readonly admin: AdminService) {}

    @Get('me')
    me(@CurrentUser() user: User) {
        return { isAdmin: true, email: user.email };
    }

    @Get('overview')
    overview(@Query() query: AdminOverviewQueryDto) {
        return this.admin.overview(query.days ?? 30);
    }
}
