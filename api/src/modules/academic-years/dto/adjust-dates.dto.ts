import { IsString, MaxLength, MinLength } from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator.js';
import { DateRangeInputDto } from '../../../common/dto/date-range-input.dto.js';

export class AdjustDatesDto extends DateRangeInputDto {
  @Trim()
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}