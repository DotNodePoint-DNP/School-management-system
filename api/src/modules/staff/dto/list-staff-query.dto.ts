import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  STAFF_KINDS,
  STAFF_STATUSES,
  type StaffKindValue,
} from '../../../common/constants/people.js';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';

export class ListStaffQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsIn(STAFF_KINDS) kind?: StaffKindValue;
  @IsOptional() @IsIn(STAFF_STATUSES) status?: (typeof STAFF_STATUSES)[number];
  @IsOptional() @IsIn(['name', 'staffNo', 'joinDate']) sortBy:
    'name' | 'staffNo' | 'joinDate' = 'name';
  @IsOptional() @IsIn(['asc', 'desc']) sortOrder: 'asc' | 'desc' = 'asc';
}
