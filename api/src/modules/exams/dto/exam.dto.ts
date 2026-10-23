import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator.js';
import { DATE_SHAPE } from '../../../common/dto/date-range-input.dto.js';

export class CreateExamDto {
  @Trim() @IsString() @MinLength(1) @MaxLength(60) name!: string;
  @IsInt() @Min(1) @Max(20) sequence!: number;
  @IsOptional() @IsUUID('all') termId?: string;
  @IsOptional() @IsBoolean() isFinal?: boolean;
}

export class UpdateExamDto {
  @IsOptional() @Trim() @IsString() @MinLength(1) @MaxLength(60) name?: string;
  @IsOptional() @IsInt() @Min(1) @Max(20) sequence?: number;
  /** `null` detaches the term. */
  @IsOptional() @IsUUID('all') termId?: string | null;
  @IsOptional() @IsBoolean() isFinal?: boolean;
}

export class ExamSubjectInputDto {
  @IsUUID('all') subjectId!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(1) @Max(1000) fullTheory!: number;
  /** Defaults to 35% of fullTheory. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1000)
  passTheory?: number;
  /** Practical and internal assessment together. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(1000)
  fullPractical?: number;
  /** Defaults to 40% of fullPractical. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1000)
  passPractical?: number;
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'examDate must be YYYY-MM-DD' })
  examDate?: string;
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'examDateBs must be YYYY-MM-DD' })
  examDateBs?: string;
}

export class SetExamSubjectsDto {
  @IsArray()
  @ArrayMaxSize(60)
  @ArrayUnique((s: ExamSubjectInputDto) => s.subjectId)
  @ValidateNested({ each: true })
  @Type(() => ExamSubjectInputDto)
  subjects!: ExamSubjectInputDto[];
}

export class CopyExamSetupDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  classIds?: string[];
}
