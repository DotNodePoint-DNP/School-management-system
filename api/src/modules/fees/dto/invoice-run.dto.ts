import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator.js';
import { DATE_SHAPE } from '../../../common/dto/date-range-input.dto.js';

export class ExpectDto {
  @IsInt() @Min(0) count!: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) netTotal!: number;
}

/** Choose exactly one of sectionId, classId, enrollmentIds or all. */
export class InvoiceRunDto {
  @IsIn(['PERIODIC', 'ADMISSION']) kind!: 'PERIODIC' | 'ADMISSION';
  /** PERIODIC: which billing period to invoice. */
  @IsOptional() @IsUUID('all') periodId?: string;
  /** ADMISSION: which academic year the new students were admitted into. */
  @IsOptional() @IsUUID('all') academicYearId?: string;
  @IsOptional() @IsUUID('all') sectionId?: string;
  @IsOptional() @IsUUID('all') classId?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  enrollmentIds?: string[];
  @IsOptional() @IsBoolean() all?: boolean;
  /** ADMISSION only. Default: today. PERIODIC invoices use the period's due date. */
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'dueDate must be YYYY-MM-DD' })
  dueDate?: string;
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'dueDateBs must be YYYY-MM-DD' })
  dueDateBs?: string;
  /** The figures from the preview. If they have changed, nothing is created. */
  @IsOptional() @ValidateNested() @Type(() => ExpectDto) expect?: ExpectDto;
}

export class AdHocLineDto {
  @IsUUID('all') feeHeadId!: string;
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  description?: string;
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(10_000_000)
  amount!: number;
}

export class CreateAdHocInvoiceDto {
  /** A new random UUID for each form. Sending the same one again returns the invoice already created. */
  @IsUUID('all') requestKey!: string;
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  description?: string;
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => AdHocLineDto)
  lines!: AdHocLineDto[];
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'dueDate must be YYYY-MM-DD' })
  dueDate?: string;
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'dueDateBs must be YYYY-MM-DD' })
  dueDateBs?: string;
}
