import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsNumber,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class ResultComponentDto {
  @IsUUID('all') examId!: string;
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100)
  weightPercent!: number;
}

export class SetResultPolicyDto {
  @IsUUID('all') gradeScaleId!: string;
  /** The weights must add up to exactly 100. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ArrayUnique((c: ResultComponentDto) => c.examId)
  @ValidateNested({ each: true })
  @Type(() => ResultComponentDto)
  components!: ResultComponentDto[];
}
