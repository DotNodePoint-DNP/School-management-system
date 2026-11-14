import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { ReminderRunDto } from './dto/fee-reminder.dto.js';
import { FeeRemindersService } from './fee-reminders.service.js';

@Controller('reminders/fees')
export class FeeRemindersController {
  constructor(private readonly reminders: FeeRemindersService) {}

  @Post('preview')
  @HttpCode(200)
  @RequirePermissions('fees:remind')
  preview(@Body() dto: ReminderRunDto): unknown {
    return this.reminders.preview(dto);
  }

  @Post('send')
  @HttpCode(200)
  @RequirePermissions('fees:remind')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  send(@Body() dto: ReminderRunDto, @CurrentUser() actor: AuthUser) {
    return this.reminders.send(dto, actor);
  }

  @Get('runs')
  @RequirePermissions('fees:remind')
  runs() {
    return this.reminders.runs();
  }

  @Get('runs/:id')
  @RequirePermissions('fees:remind')
  run(@Param('id', ParseUUIDPipe) id: string) {
    return this.reminders.run(id);
  }
}
