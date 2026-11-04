import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ACCOUNT_TYPES } from '../../auth/auth.constants';
import type { AccountType } from '../../auth/auth.constants';
import { normalizePhone } from '../../common/utils/phone';

/** Every field is optional. Send only what changed. Email has. */
export class UpdateProfileDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(50)
  firstName?: string;

  @IsOptional() @IsString() @MinLength(1) @MaxLength(50)
  lastName?: string;

  @IsOptional()
  @Transform(({ value }) => normalizePhone(value))
  @Matches(/^\+[1-9]\d{7,14}$/, {
    message: 'phone must be a valid phone number, e.g. 08012345678 or +2348012345678',
  })
  phone?: string;

  @IsOptional()
  @Matches(/^[a-zA-Z][a-zA-Z0-9_]{2,19}$/, {
    message:
      'username must be 3-20 characters, and use only letters, numbers, or underscores',
  })
  username?: string;

  @IsOptional()
  @IsIn([...ACCOUNT_TYPES], { message: 'accountType must be either personal or fleet' })
  accountType?: AccountType;

  @IsOptional()
  @IsUrl({
    protocols: ['https'],
    require_protocol: true,
  })
  @MaxLength(2048)
  avatarUrl?: string;
}
