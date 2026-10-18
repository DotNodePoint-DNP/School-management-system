import { IsInt, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator.js';
import { DateRangeInputDto } from '../../../common/dto/date-range-input.dto.js';

export class CreateTermDto extends DateRangeInputDto {
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name!: string;

  @IsInt()
  @Min(1)
  @Max(20)
  sequence!: number;
}