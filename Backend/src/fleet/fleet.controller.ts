import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@supabase/supabase-js';
import { CurrentUser } from '../auth/current-user.decorator';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { PlanGuard, RequireFeature } from '../billing/plan.guard';
import { CreateFleetDto } from './dto/create-fleet.dto';
import { CreateFleetInvitationDto } from './dto/create-fleet-invitation.dto';
import { FleetInvitationsService } from './fleet-invitations.service';
import { FleetService } from './fleet.service';

@Controller('fleets')
@UseGuards(SupabaseAuthGuard, PlanGuard)
export class FleetController {
  constructor(
    private readonly fleets: FleetService,
    private readonly invitations: FleetInvitationsService,
  ) {}

  @Post()
  @RequireFeature('canUseFleet')
  create(@CurrentUser() user: User, @Body() dto: CreateFleetDto) {
    return this.fleets.create(user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: User) {
    return this.fleets.list(user.id);
  }

  @Post(':fleetId/vehicles/:vehicleId')
  @RequireFeature('canUseFleet')
  assignVehicle(
    @CurrentUser() user: User,
    @Param('fleetId', ParseUUIDPipe) fleetId: string,
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
  ) {
    return this.fleets.assignVehicle(user.id, fleetId, vehicleId);
  }

  @Post(':fleetId/invitations')
  @RequireFeature('canInviteDrivers')
  inviteDriver(
    @CurrentUser() user: User,
    @Param('fleetId', ParseUUIDPipe) fleetId: string,
    @Body() dto: CreateFleetInvitationDto,
  ) {
    return this.invitations.create(user.id, fleetId, dto);
  }
}
