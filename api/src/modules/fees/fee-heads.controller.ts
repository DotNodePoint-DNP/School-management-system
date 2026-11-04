import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { CreateFeeHeadDto, UpdateFeeHeadDto } from './dto/fee-head.dto.js';
import { FeeHeadsService, type FeeHeadResponse } from './fee-heads.service.js';

class ListHeadsQuery {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  isActive?: boolean;
}

@Controller('fee-heads')
export class FeeHeadsController {
  constructor(private readonly heads: FeeHeadsService) {}

  @Get()
  @RequirePermissions('fees:read')
  list(@Query() q: ListHeadsQuery): Promise<FeeHeadResponse[]> {
    return this.heads.list(q.isActive);
  }

  @Post()
  @RequirePermissions('fees:structure-manage')
  create(
    @Body() dto: CreateFeeHeadDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<FeeHeadResponse> {
    return this.heads.create(dto, actor);
  }

  @Patch(':id')
  @RequirePermissions('fees:structure-manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFeeHeadDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<FeeHeadResponse> {
    return this.heads.update(id, dto, actor);
  }

  @Delete(':id')
  @HttpCode(200)
  @RequirePermissions('fees:structure-manage')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<{ deleted: true }> {
    await this.heads.remove(id, actor);
    return { deleted: true };
  }
}
