import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class ApplyPromotionDto {
  @IsOptional() @IsUUID('all') toYearId?: string;
  /** Apply only this source class. */
  @IsOptional() @IsUUID('all') classId?: string;
  /** Needed when the year being closed has not ended yet. */
  @IsOptional() @IsBoolean() acknowledgeEarly?: boolean;
}

export class FinalizeRollsDto {
  @IsOptional() @IsUUID('all') toYearId?: string;
  /** Only this destination section. */
  @IsOptional() @IsUUID('all') sectionId?: string;
}
