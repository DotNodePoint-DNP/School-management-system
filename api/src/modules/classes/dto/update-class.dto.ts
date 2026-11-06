import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator.js';

export class UpdateClassDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

    /** The class students move up to. null makes this a final class (its students graduate). */
  @IsOptional()
  @IsUUID('all')
  nextClassId?: string | null;
}