import { IsInt, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator.js';

export class CreateClassDto {
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;

  @IsInt()
  @Min(1)
  @Max(1000)
  sortOrder!: number;
}