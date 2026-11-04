import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator.js';

export class CreateFeeAssignmentDto {
  @IsUUID('all') feeHeadId!: string;
  /** Rupees charged in each period it applies to. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(10_000_000)
  amount!: number;
  @IsOptional() @Trim() @IsString() @MaxLength(200) note?: string;
  /** Give exactly one: the billing periods it applies to, or allPeriods. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(24)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  periodIds?: string[];
  @IsOptional() @IsBoolean() allPeriods?: boolean;
}

export class UpdateFeeAssignmentDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(10_000_000)
  amount?: number;
  @IsOptional() @Trim() @IsString() @MaxLength(200) note?: string | null;
  /** Replaces the periods. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(24)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  periodIds?: string[];
  @IsOptional() @IsBoolean() allPeriods?: boolean;
}
