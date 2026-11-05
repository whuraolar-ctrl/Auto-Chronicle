import {
  Controller,
  Get,
  Header,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import type { User } from '@supabase/supabase-js';
import { CurrentUser } from '../auth/current-user.decorator';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { PlanGuard, RequireFeature } from '../billing/plan.guard';
import { MonthlyExpensesQueryDto } from './dto/monthly-expenses-query.dto';
import { ExpensesService } from './expenses.service';

@Controller('expenses')
@UseGuards(SupabaseAuthGuard, PlanGuard)
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get('monthly')
  monthly(@CurrentUser() user: User, @Query() query: MonthlyExpensesQueryDto) {
    return this.expenses.monthly(user.id, query);
  }

  /** CSV download — Premium & Fleet only. */
  @Get('export')
  @RequireFeature('canExport')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportCsv(
    @CurrentUser() user: User,
    @Query() query: MonthlyExpensesQueryDto,
    @Res() res: Response,
  ) {
    const { filename, csv } = await this.expenses.exportMonthlyCsv(user.id, query);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }
}
