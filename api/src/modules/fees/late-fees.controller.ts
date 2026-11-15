import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import {
  LateFineRunDto,
  ListLateFinesQueryDto,
  SetLateFeePolicyDto,
} from './dto/late-fee.dto.js';
import { LateFeesService } from './late-fees.service.js';

@Controller()
export class LateFeesController {
  constructor(private readonly lateFees: LateFeesService) {}

  @Get('late-fee-policy')
  @RequirePermissions('fees:read')
  policy() {
    return this.lateFees.policy();
  }

  @Put('late-fee-policy')
  @RequirePermissions('fees:late-fee-manage')
  setPolicy(@Body() dto: SetLateFeePolicyDto, @CurrentUser() actor: AuthUser) {
    return this.lateFees.setPolicy(dto, actor);
  }

  /** Shows exactly which fines would be applied. Writes nothing and uses no invoice numbers. */
  @Post('late-fines/preview')
  @HttpCode(200)
  @RequirePermissions('fees:late-fee-apply')
  preview(@Body() dto: LateFineRunDto) {
    return this.lateFees.preview(dto);
  }

  @Post('late-fines/apply')
  @HttpCode(200)
  @RequirePermissions('fees:late-fee-apply')
  apply(@Body() dto: LateFineRunDto, @CurrentUser() actor: AuthUser) {
    return this.lateFees.apply(dto, actor);
  }

  @Get('late-fines')
  @RequirePermissions('fees:read')
  list(@Query() q: ListLateFinesQueryDto) {
    return this.lateFees.list(q);
  }

  @Get('late-fines/runs')
  @RequirePermissions('fees:read')
  runs() {
    return this.lateFees.runs();
  }
}
