import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Min,
} from 'class-validator';
import { DATE_SHAPE } from '../../../common/dto/date-range-input.dto.js';

const SLOT = /^(PRINCIPAL|EXAM_CONTROLLER|ACCOUNTANT|OTHER:.{2,60})$/;

export class PrintReportCardsDto {
  @IsUUID('all') academicYearId!: string;
  @IsUUID('all') classId!: string;
  @IsOptional() @IsUUID('all') sectionId?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  enrollmentIds?: string[];
  /** Omit for the combined (final) result. */
  @IsOptional() @IsUUID('all') examId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) version?: number;
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'issuedOn must be YYYY-MM-DD' })
  issuedOn?: string;
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'issuedOnBs must be YYYY-MM-DD' })
  issuedOnBs?: string;
  /** "line" prints blank signature lines for everyone, to sign by hand. */
  @IsOptional() @IsIn(['auto', 'line']) signatures?: 'auto' | 'line';
  @IsOptional() @IsIn(['ROLL', 'RANK']) order?: 'ROLL' | 'RANK';
  /** Signatory roles to show, in order. Default: principal and exam controller. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @Matches(SLOT, {
    each: true,
    message:
      'Each slot must be PRINCIPAL, EXAM_CONTROLLER, ACCOUNTANT or OTHER:<label>',
  })
  slots?: string[];
}

export class ReportCardQueryDto {
  @IsOptional() @IsUUID('all') examId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) version?: number;
}
