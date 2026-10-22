import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator.js';
import { DateRangeInputDto } from '../../../common/dto/date-range-input.dto.js';

export class UpdateTermDto extends DateRangeInputDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  sequence?: number;
}