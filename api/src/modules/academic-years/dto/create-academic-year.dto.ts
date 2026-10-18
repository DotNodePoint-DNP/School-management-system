import { IsString, MaxLength, MinLength } from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator.js';
import { DateRangeInputDto } from '../../../common/dto/date-range-input.dto.js';

export class CreateAcademicYearDto extends DateRangeInputDto {
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name!: string;
}
