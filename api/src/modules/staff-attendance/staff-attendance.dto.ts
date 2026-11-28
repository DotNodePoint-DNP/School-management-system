import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator.js';

export class CoordinatesDto {
  @IsNumber() @Min(-90) @Max(90) latitude: number;
  @IsNumber() @Min(-180) @Max(180) longitude: number;
}

export class StaffPolicyDto extends CoordinatesDto {
  @Trim() @Length(1, 120) name: string;
  @IsInt() @Min(10) @Max(5000) radius: number;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) startsAt: string;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) endsAt: string;
  @IsInt() @Min(0) @Max(120) grace: number;
  @IsArray()
  @ArrayMaxSize(6)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  offDays: number[];
}

export class PunchDto extends CoordinatesDto {
  @IsIn(['IN', 'OUT']) kind: 'IN' | 'OUT';
  @IsNumber() @Min(0.01) accuracy: number;
  @IsInt() @Min(1) capturedAt: number;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) workDate: string;
}

export class StaffRequestDto {
  @IsIn(['LEAVE', 'MISSED_IN', 'MISSED_OUT']) kind:
    'LEAVE' | 'MISSED_IN' | 'MISSED_OUT';
  @Matches(/^\d{4}-\d{2}-\d{2}$/) fromDate: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) toDate: string;
  @Trim() @Length(1, 500) reason: string;
  @IsOptional() @IsDateString({ strict: true }) proposedAt?: string;
}

export class ReviewDto {
  @IsIn(['APPROVED', 'REJECTED']) status: 'APPROVED' | 'REJECTED';
  @Trim() @Length(1, 500) note: string;
}
