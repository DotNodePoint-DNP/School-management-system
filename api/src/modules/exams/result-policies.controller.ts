import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { SetResultPolicyDto } from './dto/result-policy.dto.js';
import {
  ResultPoliciesService,
  type EffectivePolicy,
} from './result-policies.service.js';

@Controller('academic-years/:yearId')
export class ResultPoliciesController {
  constructor(private readonly policies: ResultPoliciesService) {}

  @Get('result-policies')
  @RequirePermissions('exams:read')
  list(@Param('yearId', ParseUUIDPipe) yearId: string) {
    return this.policies.list(yearId);
  }

  @Get('classes/:classId/result-policy')
  @RequirePermissions('exams:read')
  get(
    @Param('yearId', ParseUUIDPipe) yearId: string,
    @Param('classId', ParseUUIDPipe) classId: string,
  ): Promise<EffectivePolicy> {
    return this.policies.getEffective(yearId, classId);
  }

  @Put('classes/:classId/result-policy')
  @RequirePermissions('exams:manage')
  set(
    @Param('yearId', ParseUUIDPipe) yearId: string,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Body() dto: SetResultPolicyDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<EffectivePolicy> {
    return this.policies.set(yearId, classId, dto, actor);
  }

  @Delete('classes/:classId/result-policy')
  @HttpCode(200)
  @RequirePermissions('exams:manage')
  async remove(
    @Param('yearId', ParseUUIDPipe) yearId: string,
    @Param('classId', ParseUUIDPipe) classId: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<{ deleted: true }> {
    await this.policies.remove(yearId, classId, actor);
    return { deleted: true };
  }
}
