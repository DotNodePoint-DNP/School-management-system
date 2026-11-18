import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import {
  RELATIONSHIPS,
  type Relationship,
} from '../../../common/constants/people.js';

export class GuardianLinkDto {
  @IsUUID('all') guardianId!: string;
  @IsIn(RELATIONSHIPS) relationship!: Relationship;
  @IsBoolean() isPrimary!: boolean;
  @IsOptional() @IsBoolean() isEmergencyContact?: boolean;
  /** false switches this guardian's portal view of the child off (custody or safety cases). Needs guardians:manage. */
  @IsOptional() @IsBoolean() portalAccess?: boolean;
}

export class ReplaceStudentGuardiansDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @ArrayUnique((link: GuardianLinkDto) => link.guardianId)
  @ValidateNested({ each: true })
  @Type(() => GuardianLinkDto)
  guardians!: GuardianLinkDto[];
}
