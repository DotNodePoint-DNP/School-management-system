import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { GENDERS, STUDENT_STATUSES } from '../../../common/constants/people.js';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';

export class ListStudentsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional()
  @IsIn(STUDENT_STATUSES)
  status?: (typeof STUDENT_STATUSES)[number];
  @IsOptional() @IsIn(GENDERS) gender?: (typeof GENDERS)[number];
  /** Class / section in the ACTIVE academic year. */
  @IsOptional() @IsUUID('all') classId?: string;
  @IsOptional() @IsUUID('all') sectionId?: string;
  @IsOptional() @IsIn(['name', 'admissionNo', 'admissionDate']) sortBy:
    'name' | 'admissionNo' | 'admissionDate' = 'name';
  @IsOptional() @IsIn(['asc', 'desc']) sortOrder: 'asc' | 'desc' = 'asc';
}
