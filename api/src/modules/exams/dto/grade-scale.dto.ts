import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator.js';

export class GradeBandDto {
  @Trim() @IsString() @MinLength(1) @MaxLength(6) grade!: string;
  /** The band covers marks from this percentage up to the next band's start. */
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) minPercent!: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(10) gradePoint!: number;
  @Trim() @IsString() @MaxLength(40) description!: string;
  @IsBoolean() isPass!: boolean;
}

export class CreateGradeScaleDto {
  @Trim() @IsString() @MinLength(2) @MaxLength(60) name!: string;
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(15)
  @ValidateNested({ each: true })
  @Type(() => GradeBandDto)
  bands!: GradeBandDto[];
}

export class ReplaceGradeScaleDto {
  @IsOptional() @Trim() @IsString() @MinLength(2) @MaxLength(60) name?: string;
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(15)
  @ValidateNested({ each: true })
  @Type(() => GradeBandDto)
  bands!: GradeBandDto[];
}

export class CopyGradeScaleDto {
  @Trim() @IsString() @MinLength(2) @MaxLength(60) name!: string;
}
