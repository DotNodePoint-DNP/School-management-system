import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { IsOptional, Matches } from 'class-validator';
import { DATE_SHAPE } from '../../common/dto/date-range-input.dto.js';
import {
  adToBsString,
  bsToIso,
  parseIsoDate,
} from '../../common/utils/bs-date.js';

class ConvertDateQueryDto {
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'ad must be YYYY-MM-DD' })
  ad?: string;
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'bs must be YYYY-MM-DD' })
  bs?: string;
}

@Controller('dates')
export class DatesController {
  /** Send exactly one of `ad` or `bs`. */
  @Get('convert')
  convert(@Query() query: ConvertDateQueryDto): {
    ad: string;
    bs: string | null;
  } {
    if ((query.ad === undefined) === (query.bs === undefined))
      throw new BadRequestException('Send exactly one of ad or bs');
    if (query.ad !== undefined) {
      parseIsoDate(query.ad, 'ad');
      return { ad: query.ad, bs: adToBsString(query.ad) };
    }
    const ad = bsToIso(query.bs as string, 'bs');
    return { ad, bs: adToBsString(ad) };
  }
}
