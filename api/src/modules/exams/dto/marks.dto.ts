import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator.js';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';

export class MarkEntryDto {
  @IsUUID('all') enrollmentId!: string;
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1000)
  theory?: number;
  /** Practical and internal assessment together. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1000)
  practical?: number;
  @IsOptional() @IsBoolean() absent?: boolean;
  /** Removes this student's entry (back to "not entered"). */
  @IsOptional() @IsBoolean() clear?: boolean;
}

export class SaveMarksDto {
  /** Each entry replaces that student's row; students not listed are untouched. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique((e: MarkEntryDto) => e.enrollmentId)
  @ValidateNested({ each: true })
  @Type(() => MarkEntryDto)
  entries!: MarkEntryDto[];
}

export class ReasonDto {
  @Trim() @IsString() @MinLength(10) @MaxLength(500) reason!: string;
}

export class CorrectMarkDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1000)
  theory?: number;
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1000)
  practical?: number;
  @IsOptional() @IsBoolean() absent?: boolean;
  @Trim() @IsString() @MinLength(10) @MaxLength(500) reason!: string;
}

export class MarkChangesQueryDto {
  @IsOptional() @IsUUID('all') examId?: string;
  @IsOptional() @IsUUID('all') sectionId?: string;
  @IsOptional() @IsUUID('all') subjectId?: string;
  @IsOptional() @IsUUID('all') studentId?: string;
  @IsOptional() @IsUUID('all') cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit: number =
    50;
}

export type { PaginationQueryDto };
