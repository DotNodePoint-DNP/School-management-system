import { BadRequestException } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
  IsDefined,
  IsObject,
} from 'class-validator';

export const fields = [
  'schoolEn',
  'schoolNp',
  'addressEn',
  'addressNp',
  'name',
  'nameNp',
  'admissionNo',
  'class',
  'section',
  'roll',
  'year',
  'dobAd',
  'dobBs',
  'issueAd',
  'issueBs',
  'serial',
  'signer',
  'signerNp',
  'designation',
  'designationNp',
  'phone',
  'identifiers',
  'office',
] as const;
export const issueFieldLabels = {
  office: 'Office statement',
  leavingDateBs: 'Leaving date (BS)',
  destination: 'Receiving school',
} as const;
export class LayoutBlock {
  @IsOptional() @IsString() @Length(1, 100) label?: string;
  @IsIn(['front', 'back']) side!: 'front' | 'back';
  @IsIn(['text', 'logo', 'seal', 'photo', 'signature']) type!:
    'text' | 'logo' | 'seal' | 'photo' | 'signature';
  @IsString() @Length(0, 2000) text!: string;
  @IsNumber() @Min(0) x!: number;
  @IsNumber() @Min(0) y!: number;
  @IsNumber() @Min(1) width!: number;
  @IsNumber() @Min(1) height!: number;
  @IsNumber() @Min(5) @Max(80) points!: number;
  @Matches(/^#[0-9a-f]{6}$/i) color!: string;
  @IsBoolean() bold!: boolean;
  @IsIn(['left', 'center', 'right']) align!: 'left' | 'center' | 'right';
  @IsBoolean() required!: boolean;
}
export class LetterText {
  @IsString() @Length(1, 240) @Matches(/\S/) subject!: string;
  @IsString() @Length(1, 16000) @Matches(/\S/) body!: string;
}
export class LetterInput extends LetterText {
  @IsString() @Length(1, 500) @Matches(/\S/) recipient!: string;
  @IsOptional()
  @Matches(/^(PRINCIPAL|EXAM_CONTROLLER|ACCOUNTANT|OTHER:.{2,60})$/)
  signatorySlot?: string;
}
export class Layout {
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => LetterText)
  letter?: LetterText;
  @IsOptional() @IsIn(['EN', 'NP', 'BOTH']) language?: 'EN' | 'NP' | 'BOTH';
  @IsIn(['portrait', 'landscape']) orientation!: 'portrait' | 'landscape';
  @Matches(/^[A-Za-z0-9-]{1,16}$/) prefix!: string;
  @IsIn(['AD', 'BS']) serialYear!: 'AD' | 'BS';
  @IsOptional()
  @Matches(/^(PRINCIPAL|EXAM_CONTROLLER|ACCOUNTANT|OTHER:.{2,60})$/)
  signatorySlot?: string;
  @IsBoolean() nepaliDigits!: boolean;
  @IsOptional() @IsUUID() frontArt?: string;
  @IsOptional() @IsUUID() backArt?: string;
  @IsBoolean() printArt!: boolean;
  @IsArray()
  @ArrayMaxSize(60)
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => LayoutBlock)
  blocks!: LayoutBlock[];
}
export class SaveTemplate {
  @IsString() @Matches(/\S/) @Length(1, 100) title!: string;
  @IsIn(['ID_CARD', 'CERTIFICATE', 'OFFICIAL_LETTER']) kind!:
    'ID_CARD' | 'CERTIFICATE' | 'OFFICIAL_LETTER';
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => Layout)
  layout!: Layout;
  @IsOptional() @IsInt() @Min(1) revision?: number;
}
export class PublishTemplate {
  @IsInt() @Min(1) revision!: number;
}
export class PrepareDocuments {
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => LetterInput)
  letter?: LetterInput;
  @IsUUID() versionId!: string;
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  enrollmentIds!: string[];
  @IsOptional() @IsString() @Length(0, 500) office?: string;
  @IsOptional() @IsString() @Length(10, 10) leavingDateBs?: string;
  @IsOptional() @IsString() @Length(1, 200) destination?: string;
  @IsBoolean() signed!: boolean;
  @IsOptional() @IsUUID() replacesId?: string;
  @IsOptional() @IsString() @Length(2, 300) reason?: string;
}
export class IssueDocuments extends PrepareDocuments {
  @IsUUID() requestId!: string;
  @Matches(/^[0-9a-f]{64}$/) proof!: string;
}
export function dimensions(kind: string, orientation: string) {
  const [short, long] =
    kind === 'ID_CARD' ? ([53.98, 85.6] as const) : ([210, 297] as const);
  return orientation === 'portrait'
    ? { width: short, height: long }
    : { width: long, height: short };
}
export function validateLayout(kind: string, layout: Layout, publish = false) {
  const size = dimensions(kind, layout.orientation);
  if (kind === 'OFFICIAL_LETTER') {
    if (
      !layout.letter ||
      layout.blocks.length ||
      layout.frontArt ||
      layout.backArt ||
      layout.orientation !== 'portrait'
    )
      throw new BadRequestException(
        'Official letters use A4 portrait letterhead and flowing text',
      );
    validateWording(layout.letter.subject);
    validateWording(layout.letter.body);
    return;
  }
  if (layout.letter)
    throw new BadRequestException(
      'Letter wording belongs to an official letter template',
    );
  if (publish && !layout.blocks.length)
    throw new BadRequestException('Add a field before publishing');
  if (kind === 'CERTIFICATE' && layout.backArt)
    throw new BadRequestException('Certificate artwork belongs on the front');
  for (const block of layout.blocks) {
    if (
      block.x + block.width > size.width + 0.001 ||
      block.y + block.height > size.height + 0.001
    )
      throw new BadRequestException(
        'A block extends beyond the printable surface',
      );
    if (block.side === 'back' && kind !== 'ID_CARD')
      throw new BadRequestException('Only cards support a back');
    validateWording(block.text, true);
  }
}

export function validateWording(text: string, block = false) {
  const remaining = text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    if (
      !fields.some((f) => f === key) &&
      !(block && Object.hasOwn(issueFieldLabels, key))
    )
      throw new BadRequestException('Unknown field ' + key);
    return '';
  });
  if (remaining.includes('{{') || remaining.includes('}}'))
    throw new BadRequestException('Incomplete field placeholder');
}
