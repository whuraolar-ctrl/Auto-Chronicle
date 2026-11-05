import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@supabase/supabase-js';
import { CurrentUser } from '../auth/current-user.decorator';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { CarFundService } from './car-fund.service';
import { CreateCarFundContributionDto } from './dto/create-car-fund-contribution.dto';
import { CreateCarFundSpendingDto } from './dto/create-car-fund-spending.dto';
import { ListCarFundContributionsQueryDto } from './dto/list-car-fund-contributions-query.dto';
import { UpdateCarFundGoalDto } from './dto/update-car-fund-goal.dto';

@Controller('car-fund')
@UseGuards(SupabaseAuthGuard)
export class CarFundController {
  constructor(private readonly carFund: CarFundService) {}

  @Get()
  get(@CurrentUser() user: User) {
    return this.carFund.get(user.id);
  }

  @Put('goal')
  updateGoal(@CurrentUser() user: User, @Body() dto: UpdateCarFundGoalDto) {
    return this.carFund.updateGoal(user.id, dto);
  }

  @Post('contributions')
  addContribution(
    @CurrentUser() user: User,
    @Body() dto: CreateCarFundContributionDto,
  ) {
    return this.carFund.addContribution(user.id, dto);
  }

  @Post('spending')
  recordSpending(
    @CurrentUser() user: User,
    @Body() dto: CreateCarFundSpendingDto,
  ) {
    return this.carFund.recordSpending(user.id, dto);
  }

  @Get('spending')
  listSpending(
    @CurrentUser() user: User,
    @Query() query: ListCarFundContributionsQueryDto,
  ) {
    return this.carFund.listSpending(user.id, query);
  }

  @Get('contributions')
  listContributions(
    @CurrentUser() user: User,
    @Query() query: ListCarFundContributionsQueryDto,
  ) {
    return this.carFund.listContributions(user.id, query);
  }

  @Delete('contributions/:contributionId')
  deleteContribution(
    @CurrentUser() user: User,
    @Param('contributionId', ParseUUIDPipe) contributionId: string,
  ) {
    return this.carFund.deleteContribution(user.id, contributionId);
  }
}
