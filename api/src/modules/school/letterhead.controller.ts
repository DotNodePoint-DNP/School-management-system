import { Controller, Get, Query } from '@nestjs/common';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { DATE_SHAPE } from '../../common/dto/date-range-input.dto.js';
import { resolveDate } from '../../common/utils/bs-date.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import {
  LetterheadService,
  type Letterhead,
  type ResolvedSignature,
} from './letterhead.service.js';

class PreviewQueryDto {
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'asOf must be YYYY-MM-DD' })
  asOf?: string;
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'asOfBs must be YYYY-MM-DD' })
  asOfBs?: string;
  @IsOptional() @IsIn(['auto', 'line']) signatures?: 'auto' | 'line';
  /** Comma-separated, for example PRINCIPAL,EXAM_CONTROLLER,OTHER:Chair. Empty for none. */
  @IsOptional() @IsString() @MaxLength(300) slots?: string;
  @IsOptional() @IsUUID('all') academicYearId?: string;
  @IsOptional() @IsUUID('all') sectionId?: string;
}

const flatten = (s: ResolvedSignature | null) =>
  s
    ? {
        slot: s.slot,
        nameEn: s.nameEn,
        nameNp: s.nameNp,
        designationEn: s.designationEn,
        designationNp: s.designationNp,
        mode: s.mode,
        hasImage: s.image !== null,
        sha256: s.image?.sha256 ?? null,
      }
    : null;

@Controller('school/letterhead')
export class LetterheadController {
  constructor(private readonly letterhead: LetterheadService) {}

  @Get('preview')
  @RequirePermissions('school:manage-signatories')
  async preview(@Query() q: PreviewQueryDto) {
    const result: Letterhead = await this.letterhead.assemble({
      asOf: resolveDate('asOf', q.asOf, q.asOfBs),
      signatures: q.signatures,
      slots:
        q.slots === undefined
          ? undefined
          : q.slots
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
      classTeacher:
        q.academicYearId && q.sectionId
          ? { academicYearId: q.academicYearId, sectionId: q.sectionId }
          : undefined,
    });
    return {
      asOf: result.asOf,
      profileVersion: result.profileVersion,
      school: result.school,
      logo: result.logo ? { sha256: result.logo.sha256 } : null,
      seal: result.seal ? { sha256: result.seal.sha256 } : null,
      signatures: result.signatures.map(flatten),
      classTeacher: flatten(result.classTeacher),
      warnings: result.warnings,
    };
  }
}
