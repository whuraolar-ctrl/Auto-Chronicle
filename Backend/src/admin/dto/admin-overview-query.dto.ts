import { Type } from 'class-transformer';
import {
    IsIn,
    IsOptional,
} from 'class-validator';

export class AdminOverviewQueryDto {
    @IsOptional()
    @Type(() => Number)
    @IsIn([7, 30, 90], { message: 'days must be 7, 30 or 90' })
    days?: number;
}