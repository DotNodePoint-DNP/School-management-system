import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class ClassSubjectItemDto {
  @IsUUID('all')
  subjectId!: string;

  @IsOptional()
  @IsBoolean()
  isCompulsory?: boolean;
}

export class ReplaceClassSubjectsDto {
  @IsArray()
  @ArrayMaxSize(60)
  @ArrayUnique((item: ClassSubjectItemDto) => item.subjectId)
  @ValidateNested({ each: true })
  @Type(() => ClassSubjectItemDto)
  subjects!: ClassSubjectItemDto[];
}
