import { BadRequestException } from '@nestjs/common';
import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  IsNumber,
  Min,
  Max,
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator.js';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import { AllocationDto } from './payment.dto.js';

export class QrMerchantDto {
  @Trim() @Matches(/\S/) @MaxLength(100) merchant!: string;
}
export class QrEvidenceDto {
  @IsOptional()
  @Trim()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9 _/.-]{1,58}[A-Za-z0-9]$/)
  reference?: string;
}
export class SubmitQrDto extends QrEvidenceDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(10000000)
  amount!: number;
  @IsUUID() requestKey!: string;
  @IsUUID() qrId!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) transferredOn!: string;
  @Transform(({ value }: { value: unknown }) => {
    try {
      const rows: unknown =
        typeof value === 'string' ? JSON.parse(value) : value;
      if (
        !Array.isArray(rows) ||
        rows.some(
          (row) => !row || typeof row !== 'object' || Array.isArray(row),
        )
      )
        throw new Error();
      return plainToInstance(AllocationDto, rows);
    } catch {
      throw new BadRequestException('Invalid invoice allocations');
    }
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  allocations!: AllocationDto[];
}
export class QrDecisionDto extends QrEvidenceDto {
  @IsIn(['APPROVED', 'REJECTED', 'CLARIFICATION']) status!:
    'APPROVED' | 'REJECTED' | 'CLARIFICATION';
  @IsOptional() @Trim() @IsString() @MaxLength(300) note?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(100) sender?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => AllocationDto)
  allocations?: AllocationDto[];
  @IsOptional() @IsUUID() creditStudentId?: string;
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  verifiedAmount?: number;
  @IsOptional() @Trim() @IsString() @MaxLength(100) existingReceiptNo?: string;
  @IsOptional() @IsUUID() existingPaymentId?: string;
}
export class QrListDto extends PaginationQueryDto {
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) transferredOn?: string;
  @IsOptional()
  @IsIn(['PENDING', 'APPROVED', 'REJECTED', 'CLARIFICATION'])
  status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CLARIFICATION';
}

export class StatementLineDto {
  @Matches(/^[A-Za-z0-9][A-Za-z0-9 _/.-]{1,58}[A-Za-z0-9]$/) reference!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amount!: number;
}
export class MatchStatementDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => StatementLineDto)
  lines!: StatementLineDto[];
}
