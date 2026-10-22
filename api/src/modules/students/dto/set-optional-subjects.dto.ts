import { ArrayMaxSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';

/** The complete set of optional subjects this student takes. An empty list clears their choices. */
export class SetOptionalSubjectsDto {
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  subjectIds!: string[];
}
