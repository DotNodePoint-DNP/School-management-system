import { IsString, MaxLength, MinLength } from 'class-validator';
import { IsOptional } from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator.js';
import { DateRangeInputDto } from '../../../common/dto/date-range-input.dto.js';

/** Enter the exact start and end dates (AD, or BS with the ...Bs fields). For example Shrawan 1 to the last day of Ashadh. */
export class CreateFiscalYearDto extends DateRangeInputDto {
  @Trim() @IsString() @MinLength(3) @MaxLength(20) label!: string;
}

export class UpdateFiscalYearDto extends DateRangeInputDto {
  @IsOptional() @Trim() @IsString() @MinLength(3) @MaxLength(20) label?: string;
}
