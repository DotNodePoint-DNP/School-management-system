import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class ResultsQueryDto {
  /** Omit for the combined (policy) result; give an exam id for that exam's own result. */
  @IsOptional() @IsUUID('all') examId?: string;
  @IsOptional() @IsUUID('all') sectionId?: string;
  /** A specific version; omit for the latest. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) version?: number;
}
