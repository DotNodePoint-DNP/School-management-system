import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator.js';

export class SalaryRateDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) effectiveMonth: string;
  @IsInt() @Min(1) @Max(2147483647) basicPaisa: number;
}
export class AdjustmentDto {
  @IsIn(['ADDITION', 'DEDUCTION']) kind: 'ADDITION' | 'DEDUCTION';
  @Trim() @Length(1, 100) label: string;
  @Trim() @Length(1, 500) reason: string;
  @IsInt() @Min(1) @Max(2147483647) amountPaisa: number;
}
export class ReviewEntryDto {
  @IsOptional() @IsInt() @Min(1) @Max(32) totalDays?: number;
  @IsOptional() @IsInt() @Min(0) @Max(32) presentDays?: number | null;
  @IsOptional() @IsIn(['NONE','AUTO','OVERRIDE']) leaveMode?: 'NONE'|'AUTO'|'OVERRIDE';
  @IsOptional() @IsInt() @Min(0) @Max(2147483647) leaveOverridePaisa?: number;
  @IsOptional() @IsArray() @ArrayUnique() @IsUUID('all',{each:true}) deferredAdvanceIds?: string[];
  @IsInt() @Min(0) revision: number;
  @IsOptional() @Trim() @Length(0, 500) reviewNote?: string;
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => AdjustmentDto)
  adjustments: AdjustmentDto[];
}
export class PaymentDetailsDto {
  @IsUUID() requestId: string;
  @IsString() paidOn: string;
  @IsIn(['BANK', 'WALLET','CASH', 'CHEQUE', 'OTHER']) method:
    'BANK' | 'WALLET' | 'CASH' | 'CHEQUE' | 'OTHER';
  @IsOptional() @Trim() @Length(0, 150) reference?: string;
}
export class RecordPaymentDto extends PaymentDetailsDto {
  @IsInt() @Min(1) @Max(2147483647) amountPaisa: number;
}
export class AllocationDto {
  @IsUUID() entryId: string;
  @IsInt() @Min(1) @Max(2147483647) amountPaisa: number;
}
export class TransferDto extends PaymentDetailsDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(120)
  @ValidateNested({each:true}) @Type(()=>AllocationDto) allocations: AllocationDto[];
}
export class AdvanceDto {
  @IsUUID() staffId: string;
  @IsUUID() requestId: string;
  @IsString() issuedOn: string;
  @IsInt() @Min(1) @Max(2147483647) amountPaisa: number;
  @Trim() @Length(1,500) note: string;
}
export class PreferenceDto {
  @IsIn(['CASH','BANK','WALLET']) method: 'CASH'|'BANK'|'WALLET';
  @IsOptional() @Trim() @Length(0,150) accountRef?: string;
}
export class ReasonDto {
  @Trim() @Length(1, 500) reason: string;
}
export class ReportFilterDto {
  @IsOptional() @IsString() month?: string;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
}
