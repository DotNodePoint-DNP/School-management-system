import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

/** Where to place a student. Omit `academicYearId` to use the active academic year; omit `rollNo` to take the last number. */
export class PlacementDto {
  @IsOptional() @IsUUID('all') academicYearId?: string;
  @IsUUID('all') sectionId!: string;
  @IsOptional() @IsInt() @Min(1) @Max(999) rollNo?: number;
}

export class MoveEnrollmentDto {
  @IsUUID('all') sectionId!: string;
  @IsOptional() @IsInt() @Min(1) @Max(999) rollNo?: number;
}

export class SetRollNumberDto {
  @IsInt() @Min(1) @Max(999) rollNo!: number;
}

/** The complete ordered list of a section's current enrollments; they receive 1..n in this order. */
export class AssignRollNumbersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  order!: string[];
}
