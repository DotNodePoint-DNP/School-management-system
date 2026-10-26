import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator.js';
import { DATE_SHAPE } from '../../../common/dto/date-range-input.dto.js';

const upperTrim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class PhoneDto {
  @Trim() @IsString() @MinLength(1) @MaxLength(30) label!: string;
  /** MOBILE numbers are normalised to +977; landlines and others print as typed. */
  @IsIn(['MOBILE', 'LANDLINE', 'OTHER']) type!: 'MOBILE' | 'LANDLINE' | 'OTHER';
  @Trim()
  @Matches(/^[0-9+\-() ]{6,25}$/, {
    message: 'number may contain digits, spaces, + - ( )',
  })
  number!: string;
}

export class IdentifierDto {
  @Trim() @IsString() @MinLength(1) @MaxLength(60) labelEn!: string;
  @IsOptional() @Trim() @IsString() @MaxLength(60) labelNp?: string;
  @Trim() @IsString() @MinLength(1) @MaxLength(60) value!: string;
  @IsBoolean() showOnDocuments!: boolean;
}

/** Every field is optional. Send null (or an empty string, for plain text) to clear an optional field. */
export class UpdateSchoolProfileDto {
  @ValidateIf((o: UpdateSchoolProfileDto) => o.nameEn !== undefined)
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nameEn?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(120) nameNp?: string | null;
  @IsOptional() @Trim() @IsString() @MaxLength(40) shortName?: string | null;
  @IsOptional() @Trim() @IsString() @MaxLength(160) taglineEn?: string | null;
  @IsOptional() @Trim() @IsString() @MaxLength(160) taglineNp?: string | null;
  /** Free text; the UI can suggest values such as Community or Institutional. */
  @IsOptional() @Trim() @IsString() @MaxLength(60) schoolType?: string | null;
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'establishedOn must be YYYY-MM-DD' })
  establishedOn?: string | null;
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'establishedOnBs must be YYYY-MM-DD' })
  establishedOnBs?: string;

  @IsOptional() @Trim() @IsString() @MaxLength(60) province?: string | null;
  @IsOptional() @Trim() @IsString() @MaxLength(60) district?: string | null;
  /** Municipality, rural municipality, metropolitan or sub-metropolitan city. */
  @IsOptional() @Trim() @IsString() @MaxLength(80) localLevel?: string | null;
  @IsOptional() @IsInt() @Min(1) @Max(99) wardNo?: number | null;
  @IsOptional() @Trim() @IsString() @MaxLength(120) tole?: string | null;
  @IsOptional() @Trim() @IsString() @MaxLength(10) postalCode?: string | null;
  /** The address line as it prints on Nepali documents. */
  @IsOptional() @Trim() @IsString() @MaxLength(255) addressLineNp?:
    string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => PhoneDto)
  phones?: PhoneDto[];
  @IsOptional() @Trim() @IsEmail() @MaxLength(254) email?: string | null;
  @IsOptional()
  @Trim()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(200)
  website?: string | null;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => IdentifierDto)
  identifiers?: IdentifierDto[];

  @IsOptional() @IsIn(['EN', 'NP', 'BOTH']) documentLanguage?:
    'EN' | 'NP' | 'BOTH';
  @IsOptional() @IsBoolean() nepaliDigits?: boolean;
  @IsOptional()
  @Transform(upperTrim)
  @Matches(/^[A-Z0-9]{1,8}$/, {
    message: 'Prefix must be 1-8 letters or digits',
  })
  admissionNoPrefix?: string;
  @IsOptional()
  @Transform(upperTrim)
  @Matches(/^[A-Z0-9]{1,8}$/, {
    message: 'Prefix must be 1-8 letters or digits',
  })
  staffNoPrefix?: string;
}
