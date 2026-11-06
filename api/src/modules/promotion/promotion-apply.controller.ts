import {
  Body,
  Controller,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import {
  ApplyPromotionDto,
  FinalizeRollsDto,
} from './dto/promotion-apply.dto.js';
import { PromotionQueryDto } from './dto/promotion.dto.js';
import { PromotionApplyService } from './promotion-apply.service.js';

@Controller('academic-years/:fromYearId/promotion')
export class PromotionApplyController {
  constructor(private readonly apply: PromotionApplyService) {}

  @Post('apply')
  @HttpCode(200)
  @RequirePermissions('promotion:apply')
  applyPlan(
    @Param('fromYearId', ParseUUIDPipe) fromYearId: string,
    @Body() dto: ApplyPromotionDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.apply.apply(fromYearId, dto, actor);
  }

  @Post('finalize-rolls')
  @HttpCode(200)
  @RequirePermissions('promotion:apply')
  finalizeRolls(
    @Param('fromYearId', ParseUUIDPipe) fromYearId: string,
    @Body() dto: FinalizeRollsDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.apply.finalizeRolls(fromYearId, dto, actor);
  }

  @Post('decisions/:enrollmentId/undo')
  @HttpCode(200)
  @RequirePermissions('promotion:apply')
  undo(
    @Param('fromYearId', ParseUUIDPipe) fromYearId: string,
    @Param('enrollmentId', ParseUUIDPipe) enrollmentId: string,
    @Query() q: PromotionQueryDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.apply.undo(fromYearId, enrollmentId, actor, q.toYearId);
  }
}
