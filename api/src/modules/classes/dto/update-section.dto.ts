import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator.js';

export class UpdateSectionDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  capacity?: number | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}