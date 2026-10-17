import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class PaginationQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export class Paginated<T> {
  constructor(
    public readonly items: T[],
    public readonly meta: PageMeta,
  ) {}
}

export function toPaginated<T>(items: T[], total: number, query: PaginationQueryDto): Paginated<T> {
  return new Paginated(items, {
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.ceil(total / query.pageSize),
  });
}