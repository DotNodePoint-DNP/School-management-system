import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator.js';

export class BuildProposalDto {
  @IsUUID('all') toYearId!: string;
}

export class UpdateDecisionDto {
  @IsOptional() @IsIn(['PROMOTE', 'REPEAT', 'GRADUATE', 'HOLD']) action?:
    'PROMOTE' | 'REPEAT' | 'GRADUATE' | 'HOLD';
  /** For PROMOTE only: a different class from the default next class (for example Science instead of Management). */
  @IsOptional() @IsUUID('all') toClassId?: string;
  /** null clears the section (the student then shows as "needs a section"). */
  @IsOptional() @IsUUID('all') toSectionId?: string | null;
  @IsOptional() @Trim() @IsString() @MaxLength(300) note?: string | null;
}

export class PromotionQueryDto {
  /** Which plan, when a year has more than one. Default: the latest. */
  @IsOptional() @IsUUID('all') toYearId?: string;
  @IsOptional() @IsUUID('all') sectionId?: string;
  @IsOptional() @IsIn(['RANK', 'ROLL']) order?: 'RANK' | 'ROLL';
}
