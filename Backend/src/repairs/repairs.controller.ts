import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { User } from '@supabase/supabase-js';
import { CurrentUser } from '../auth/current-user.decorator';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { CreateRepairDto } from './dto/create-repair.dto';
import { ListRepairsQueryDto } from './dto/list-repairs-query.dto';
import { MAX_RECEIPT_BYTES } from './repairs.constants';
import { RepairsService } from './repairs.service';

@Controller()
@UseGuards(SupabaseAuthGuard)
export class RepairsController {
  constructor(private readonly repairs: RepairsService) {}

  /** Send an Idempotency-Key header (a UUID) so a retry never. */
  @Post('vehicles/:vehicleId/repairs')
  create(
    @CurrentUser() user: User,
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Body() dto: CreateRepairDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.repairs.create(user.id, vehicleId, dto, idempotencyKey);
  }

  @Get('vehicles/:vehicleId/repairs')
  list(
    @CurrentUser() user: User,
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Query() query: ListRepairsQueryDto,
  ) {
    return this.repairs.list(user.id, vehicleId, query);
  }

  @Get('repairs/:repairId')
  get(
    @CurrentUser() user: User,
    @Param('repairId', ParseUUIDPipe) repairId: string,
  ) {
    return this.repairs.get(user.id, repairId);
  }

  /** multipart/form-data with one file in the field named file (JPG,. */
  @Post('repairs/:repairId/receipt')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_RECEIPT_BYTES, files: 1 } }),
  )
  uploadReceipt(
    @CurrentUser() user: User,
    @Param('repairId', ParseUUIDPipe) repairId: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.repairs.uploadReceipt(user.id, repairId, file);
  }

  @Delete('repairs/:repairId/receipt')
  @HttpCode(200)
  removeReceipt(
    @CurrentUser() user: User,
    @Param('repairId', ParseUUIDPipe) repairId: string,
  ) {
    return this.repairs.removeReceipt(user.id, repairId);
  }
}
