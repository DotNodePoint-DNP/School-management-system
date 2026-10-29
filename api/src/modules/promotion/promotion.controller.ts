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
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import {
  BuildProposalDto,
  PromotionQueryDto,
  UpdateDecisionDto,
} from './dto/promotion.dto.js';
import { PromotionService } from './promotion.service.js';

@Controller('academic-years/:fromYearId/promotion')
export class PromotionController {
  constructor(private readonly promotion: PromotionService) {}

  /** Builds the plan from published results, or refreshes it. Safe to repeat: manual decisions are kept. */
  @Post()
  @HttpCode(200)
  @RequirePermissions('promotion:manage')
  propose(
    @Param('fromYearId', ParseUUIDPipe) fromYearId: string,
    @Body() dto: BuildProposalDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.promotion.propose(fromYearId, dto, actor);
  }

  @Get()
  @RequirePermissions('promotion:read')
  summary(
    @Param('fromYearId', ParseUUIDPipe) fromYearId: string,
    @Query() q: PromotionQueryDto,
  ) {
    return this.promotion.summary(fromYearId, q.toYearId);
  }

  @Get('classes/:classId')
  @RequirePermissions('promotion:read')
  classDecisions(
    @Param('fromYearId', ParseUUIDPipe) fromYearId: string,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Query() q: PromotionQueryDto,
  ) {
    return this.promotion.classDecisions(fromYearId, classId, q);
  }

  @Patch('decisions/:enrollmentId')
  @RequirePermissions('promotion:manage')
  update(
    @Param('fromYearId', ParseUUIDPipe) fromYearId: string,
    @Param('enrollmentId', ParseUUIDPipe) enrollmentId: string,
    @Query() q: PromotionQueryDto,
    @Body() dto: UpdateDecisionDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.promotion.updateDecision(
      fromYearId,
      enrollmentId,
      dto,
      actor,
      q.toYearId,
    );
  }
}
