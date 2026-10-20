import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { Paginated } from '../../common/dto/pagination.dto.js';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { CreateGuardianLoginDto } from './dto/create-guardian-login.dto.js';
import { ListGuardiansQueryDto } from './dto/list-guardians-query.dto.js';
import { UpdateGuardianDto } from './dto/update-guardian.dto.js';
import {
  GuardiansService,
  type GuardianDetail,
  type GuardianSummary,
} from './guardians.service.js';
import type { LoginOutcome } from './parent-accounts.service.js';

@Controller('guardians')
export class GuardiansController {
  constructor(private readonly guardians: GuardiansService) {}

  @Get()
  @RequirePermissions('guardians:read')
  list(
    @Query() query: ListGuardiansQueryDto,
  ): Promise<Paginated<GuardianSummary>> {
    return this.guardians.list(query);
  }

  @Get(':id')
  @RequirePermissions('guardians:read')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<GuardianDetail> {
    return this.guardians.get(id);
  }

  @Patch(':id')
  @RequirePermissions('guardians:manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGuardianDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<GuardianDetail> {
    return this.guardians.update(id, dto, actor);
  }

  @Post(':id/create-login')
  @HttpCode(200)
  @RequirePermissions('guardians:create-login')
  createLogin(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateGuardianLoginDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<LoginOutcome> {
    return this.guardians.createLogin(id, dto, actor);
  }

  @Post(':id/resend-credentials')
  @HttpCode(200)
  @RequirePermissions('guardians:create-login')
  resend(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<LoginOutcome> {
    return this.guardians.resend(id, actor);
  }
}
