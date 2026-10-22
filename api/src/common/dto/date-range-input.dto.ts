import { IsOptional, Matches } from 'class-validator';

export const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

/** A start/end pair where each date may be given as AD (`startDate`) or BS (`startDateBs`). */
export class DateRangeInputDto {
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'startDate must be YYYY-MM-DD' })
  startDate?: string;

  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'startDateBs must be YYYY-MM-DD' })
  startDateBs?: string;

  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'endDate must be YYYY-MM-DD' })
  endDate?: string;

  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'endDateBs must be YYYY-MM-DD' })
  endDateBs?: string;
}
