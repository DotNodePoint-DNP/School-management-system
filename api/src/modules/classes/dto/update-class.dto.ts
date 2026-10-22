import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
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
}