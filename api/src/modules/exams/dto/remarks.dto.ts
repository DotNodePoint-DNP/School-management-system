import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class RemarkEntryDto {
  @IsUUID('all') enrollmentId!: string;
  /** null or an empty string removes the remark. The key must be present. */
  @ValidateIf((o: RemarkEntryDto) => o.remark !== null)
  @IsString()
  @MaxLength(500)
  remark!: string | null;
}

export class SaveRemarksDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique((e: RemarkEntryDto) => e.enrollmentId)
  @ValidateNested({ each: true })
  @Type(() => RemarkEntryDto)
  entries!: RemarkEntryDto[];
}

export class RemarksQueryDto {
  /** Omit for the combined (final) card; give an exam id for that exam's card. */
  @IsOptional() @IsUUID('all') examId?: string;
}
