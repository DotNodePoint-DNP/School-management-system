import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';

export class ListInvoicesQueryDto extends PaginationQueryDto {
  @IsOptional() @IsIn(['PERIODIC', 'ADMISSION', 'AD_HOC']) kind?:
    'PERIODIC' | 'ADMISSION' | 'AD_HOC';
  @IsOptional() @IsUUID('all') fiscalYearId?: string;
  @IsOptional() @IsUUID('all') academicYearId?: string;
  @IsOptional() @IsUUID('all') periodId?: string;
  @IsOptional() @IsUUID('all') classId?: string;
  @IsOptional() @IsUUID('all') sectionId?: string;
  @IsOptional() @IsUUID('all') studentId?: string;
  /** Part of an invoice number or an admission number. */
  @IsOptional() @IsString() @MaxLength(40) search?: string;
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  voided?: boolean;
}
