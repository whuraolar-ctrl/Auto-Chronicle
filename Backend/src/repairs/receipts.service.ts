import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SupabaseService } from '../supabase/supabase.service';
import {
  MEDIA_COLUMNS,
  RECEIPT_URL_TTL_SECONDS,
  RECEIPTS_BUCKET,
} from './repairs.constants';
import { MediaRow } from './repairs.mapper';
import { detectReceiptType } from './receipt-type';

/** * Stores receipt files in the private receipts bucket and. */
@Injectable()
export class ReceiptsService {
  private readonly logger = new Logger(ReceiptsService.name);

  constructor(private readonly supabase: SupabaseService) {}

  async findForRepair(repairId: string): Promise<MediaRow | null> {
    const { data, error } = await this.supabase.admin
      .from('media')
      .select(MEDIA_COLUMNS)
      .eq('repair_id', repairId)
      .eq('media_type', 'receipt')
      .maybeSingle();

    if (error) throw new InternalServerErrorException('Unable to load receipt');
    return (data as MediaRow) ?? null;
  }

  /** Which of these repairs have a receipt? */
  async repairIdsWithReceipt(repairIds: string[]): Promise<Set<string>> {
    if (repairIds.length === 0) return new Set();
    const { data, error } = await this.supabase.admin
      .from('media')
      .select('repair_id')
      .in('repair_id', repairIds)
      .eq('media_type', 'receipt');

    if (error) throw new InternalServerErrorException('Unable to load receipts');
    return new Set((data ?? []).map((r: { repair_id: string }) => r.repair_id));
  }

  async toResponse(media: MediaRow) {
    const { data, error } = await this.supabase.admin.storage
      .from(media.storage_bucket)
      .createSignedUrl(media.storage_path, RECEIPT_URL_TTL_SECONDS);

    if (error || !data) {
      this.logger.error(`Signed URL failed for media ${media.id}`);
      throw new InternalServerErrorException('Unable to load receipt');
    }

    return {
      id: media.id,
      mimeType: media.mime_type,
      fileSizeBytes: Number(media.file_size_bytes),
      url: data.signedUrl,
      urlExpiresInSeconds: RECEIPT_URL_TTL_SECONDS,
      uploadedAt: media.created_at,
    };
  }

  async attach(userId: string, repairId: string, file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('A file is required (form field name: file)');
    }

    const detected = detectReceiptType(file.buffer);
    if (!detected) {
      throw new BadRequestException('Receipt must be a JPG, PNG, or PDF file');
    }

    if (await this.findForRepair(repairId)) {
      throw new ConflictException(
        'This repair already has a receipt. Remove it before uploading a new one.',
      );
    }

    const path = `${userId}/${repairId}/${randomUUID()}.${detected.ext}`;

    const { error: uploadError } = await this.supabase.admin.storage
      .from(RECEIPTS_BUCKET)
      .upload(path, file.buffer, { contentType: detected.mime, upsert: false });

    if (uploadError) {
      this.logger.error(`Receipt upload failed: ${uploadError.message}`);
      throw new InternalServerErrorException('Unable to upload receipt');
    }

    const { data, error } = await this.supabase.admin
      .from('media')
      .insert({
        repair_id: repairId,
        uploaded_by: userId,
        storage_bucket: RECEIPTS_BUCKET,
        storage_path: path,
        media_type: 'receipt',
        mime_type: detected.mime,
        file_size_bytes: file.size,
      })
      .select(MEDIA_COLUMNS)
      .single();

    if (error || !data) {
      // Don't leave an unreferenced file in storage.
      await this.supabase.admin.storage.from(RECEIPTS_BUCKET).remove([path]);
      throw new InternalServerErrorException('Unable to save receipt');
    }

    return this.toResponse(data as MediaRow);
  }

  async remove(repairId: string) {
    const media = await this.findForRepair(repairId);
    if (!media) throw new NotFoundException('This repair has no receipt');

    const { error: removeError } = await this.supabase.admin.storage
      .from(media.storage_bucket)
      .remove([media.storage_path]);
    if (removeError) {
      this.logger.error(`Receipt delete failed: ${removeError.message}`);
      throw new InternalServerErrorException('Unable to remove receipt');
    }

    const { error } = await this.supabase.admin
      .from('media')
      .delete()
      .eq('id', media.id);
    if (error) throw new InternalServerErrorException('Unable to remove receipt');

    return { message: 'Receipt removed' };
  }
}
