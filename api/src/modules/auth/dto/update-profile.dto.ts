import { IsString, Length } from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator.js';

export class UpdateProfileDto {
  @Trim()
  @IsString()
  @Length(2, 120)
  fullName!: string;
}
