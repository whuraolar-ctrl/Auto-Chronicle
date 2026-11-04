import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import { SupabaseService } from '../../supabase/supabase.service';

/** Checks who can access each vehicle. */
@Injectable()
export class VehicleAccessService {
  constructor(private readonly supabase: SupabaseService) {}

  async listAccessibleVehicles(userId: string) {
    const { data: memberships, error: membershipError } = await this.supabase.admin
      .from('fleet_members')
      .select('fleet_id')
      .eq('user_id', userId);

    if (membershipError) {
      throw new InternalServerErrorException('Unable to load accessible vehicles');
    }

    const { data: ownedFleets, error: ownedFleetError } = await this.supabase.admin
      .from('fleets')
      .select('id')
      .eq('owner_id', userId);

    if (ownedFleetError) {
      throw new InternalServerErrorException('Unable to load accessible vehicles');
    }

    const fleetIds = [
      ...new Set([
        ...(memberships ?? []).map((membership) => membership.fleet_id),
        ...(ownedFleets ?? []).map((fleet) => fleet.id),
      ]),
    ];
    const { data: ownedVehicles, error: ownedError } = await this.supabase.admin
      .from('vehicles')
      .select('id, name, plate_number, user_id, fleet_id')
      .eq('user_id', userId);

    if (ownedError) {
      throw new InternalServerErrorException('Unable to load accessible vehicles');
    }

    const { data: fleetVehicles, error: fleetError } = fleetIds.length
      ? await this.supabase.admin
          .from('vehicles')
          .select('id, name, plate_number, user_id, fleet_id')
          .in('fleet_id', fleetIds)
      : { data: [], error: null };

    if (fleetError) {
      throw new InternalServerErrorException('Unable to load accessible vehicles');
    }

    const byId = new Map(
      [...(ownedVehicles ?? []), ...(fleetVehicles ?? [])].map((vehicle) => [
        vehicle.id,
        vehicle,
      ]),
    );

    return [...byId.values()] as {
      id: string;
      name: string | null;
      plate_number: string | null;
    }[];
  }

  async assertCanAccess(userId: string, vehicleId: string): Promise<void> {
    const vehicle = await this.getVehicle(vehicleId);
    if (vehicle.user_id === userId) return;
    if (!vehicle.fleet_id) throw new NotFoundException('Vehicle not found');

    const { data: member, error } = await this.supabase.admin
      .from('fleet_members')
      .select('user_id')
      .eq('fleet_id', vehicle.fleet_id)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException('Unable to verify vehicle access');
    }

    const { data: fleet, error: fleetError } = await this.supabase.admin
      .from('fleets')
      .select('id')
      .eq('id', vehicle.fleet_id)
      .eq('owner_id', userId)
      .maybeSingle();

    if (fleetError) {
      throw new InternalServerErrorException('Unable to verify vehicle access');
    }

    if (!member && !fleet) {
      throw new NotFoundException('Vehicle not found');
    }
  }

  async assertCanManageVehicle(userId: string, vehicleId: string): Promise<void> {
    const vehicle = await this.getVehicle(vehicleId);
    if (!vehicle.fleet_id) {
      if (vehicle.user_id !== userId) {
        throw new NotFoundException('Vehicle not found');
      }
      return;
    }

    const { data: fleet, error: fleetError } = await this.supabase.admin
      .from('fleets')
      .select('id')
      .eq('id', vehicle.fleet_id)
      .eq('owner_id', userId)
      .maybeSingle();

    if (fleetError) {
      throw new InternalServerErrorException('Unable to verify vehicle access');
    }
    if (fleet) return;
    throw new ForbiddenException('Fleet owner access is required');
  }

  private async getVehicle(vehicleId: string): Promise<{
    id: string;
    user_id: string;
    fleet_id: string | null;
  }> {
    const { data, error } = await this.supabase.admin
      .from('vehicles')
      .select('id, user_id, fleet_id')
      .eq('id', vehicleId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException('Unable to verify vehicle access');
    }

    if (!data) {
      throw new NotFoundException('Vehicle not found');
    }

    return data;
  }
}
