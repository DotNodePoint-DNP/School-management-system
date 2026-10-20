import { IsUUID, ValidateIf } from 'class-validator';

/** `staffId: null` clears the assignment; a missing field is rejected. */
export class SetTeacherDto {
  @ValidateIf((o: SetTeacherDto) => o.staffId !== null)
  @IsUUID('all')
  staffId!: string | null;
}
