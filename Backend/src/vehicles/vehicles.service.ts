import {
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { BillingService } from '../billing/billing.service';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { ListVehiclesQueryDto } from './dto/list-vehicle-query.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';

const TABLE = 'vehicles';

const COLUMN_MAP: Record<string, string> = {
  name: 'name',
  plateNumber: 'plate_number',
  vehicleNumber: 'vehicle_number',
  vin: 'vin',
  make: 'make',
  model: 'model',
  year: 'year',
  vehicleType: 'vehicle_type',
  registrationCountry: 'registration_country',
  fuelType: 'fuel_type',
  transmission: 'transmission',
  colour: 'colour',
  assignedDriver: 'assigned_driver',
  ownership: 'ownership',
  mileageKm: 'mileage_km',
  lastServiced: 'last_serviced',
  insuranceExpiry: 'insurance_expiry',
  nextService: 'next_service',
};

@Injectable()
export class VehiclesService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly billing: BillingService,
  ) {}

  private get db() {
    return this.supabase.admin;
  }

  private toRow(dto: CreateVehicleDto | UpdateVehicleDto) {
    const row: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(dto)) {
      if (value !== undefined && COLUMN_MAP[key]) {
        row[COLUMN_MAP[key]] = value;
      }
    }
    return row;
  }

  async create(userId: string, dto: CreateVehicleDto) {
    const entitlements = await this.billing.getEntitlements(userId);

    const { count, error: countError } = await this.db
      .from(TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_archived', false);

    if (countError) {
      throw new InternalServerErrorException(countError.message);
    }

    const currentCount = count ?? 0;
    if (currentCount >= entitlements.maxVehicles) {
      throw new HttpException(
        {
          statusCode: HttpStatus.PAYMENT_REQUIRED,
          code: 'VEHICLE_LIMIT_REACHED',
          message: `Your ${entitlements.planName} plan allows up to \( {entitlements.maxVehicles} vehicle \){entitlements.maxVehicles === 1 ? '' : 's'}. Upgrade to add more.`,
          plan: entitlements.plan,
          maxVehicles: entitlements.maxVehicles,
          currentVehicles: currentCount,
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    const { data, error } = await this.db
      .from(TABLE)
      .insert({ ...this.toRow(dto), user_id: userId })
      .select()
      .single();

    if (error) throw new InternalServerErrorException(error.message);
    return data;
  }

  async findAll(userId: string, query: ListVehiclesQueryDto) {
    const { page, limit, offset } = query;
    const to = offset + limit - 1;

    const { data, error, count } = await this.db
      .from(TABLE)
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .eq('is_archived', query.archived ?? false)
      .order('created_at', { ascending: false })
      .range(offset, to);

    if (error) throw new InternalServerErrorException(error.message);

    return {
      data,
      meta: {
        page,
        limit,
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / limit),
      },
    };
  }

  async findOne(userId: string, id: string) {
    const { data, error } = await this.db
      .from(TABLE)
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException('Vehicle not found');
    return data;
  }

  async update(userId: string, id: string, dto: UpdateVehicleDto) {
    const row = this.toRow(dto);
    if (Object.keys(row).length === 0) {
      return this.findOne(userId, id);
    }

    const { data, error } = await this.db
      .from(TABLE)
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .maybeSingle();

    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException('Vehicle not found');
    return data;
  }

  archive(userId: string, id: string) {
    return this.setArchived(userId, id, true);
  }

  unarchive(userId: string, id: string) {
    return this.setArchived(userId, id, false);
  }

  private async setArchived(userId: string, id: string, archived: boolean) {
    const { data, error } = await this.db
      .from(TABLE)
      .update({
        is_archived: archived,
        archived_at: archived ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .maybeSingle();

    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException('Vehicle not found');
    return data;
  }

  async remove(userId: string, id: string) {
    const { data, error } = await this.db
      .from(TABLE)
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
      .select('id');

    if (error) throw new InternalServerErrorException(error.message);
    if (!data || data.length === 0) {
      throw new NotFoundException('Vehicle not found');
    }
    return { deleted: true, id };
  }
}
