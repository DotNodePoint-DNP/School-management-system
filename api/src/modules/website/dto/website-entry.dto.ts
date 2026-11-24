import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { WebsiteSection } from '../legacy-section.js';
import { Trim } from '../../../common/decorators/trim.decorator.js';

export class WebsiteEntryDto {
  @IsEnum(WebsiteSection)
  section!: WebsiteSection;

  @Trim()
  @IsString()
  @Length(1, 180)
  title!: string;

  @Trim()
  @IsString()
  @Length(1, 16000)
  body!: string;

  @ValidateIf(
    (entry: WebsiteEntryDto) =>
      entry.section === 'gallery' || entry.imageUrl != null,
  )
  @IsUrl({ protocols: ['https'], require_protocol: true, disallow_auth: true })
  @MaxLength(2048)
  imageUrl?: string;

  @ValidateIf(
    (entry: WebsiteEntryDto) => !!entry.imageUrl || entry.imageAlt != null,
  )
  @Trim()
  @IsString()
  @Length(1, 300)
  imageAlt?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  displayDate?: string;

  @IsBoolean()
  published: boolean = false;
}
