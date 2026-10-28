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
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import {
  CalendarService,
  type CalendarEntryResponse,
  type CalendarResponse,
} from './calendar.service.js';
import {
  CreateCalendarEntryDto,
  UpdateCalendarSettingsDto,
} from './dto/calendar.dto.js';

@Controller('academic-years/:yearId/calendar')
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @Get()
  get(
    @Param('yearId', ParseUUIDPipe) yearId: string,
  ): Promise<CalendarResponse> {
    return this.calendar.get(yearId);
  }

  @Patch()
  @RequirePermissions('attendance:calendar-manage')
  update(
    @Param('yearId', ParseUUIDPipe) yearId: string,
    @Body() dto: UpdateCalendarSettingsDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<CalendarResponse> {
    return this.calendar.updateSettings(yearId, dto, actor);
  }

  @Post('entries')
  @RequirePermissions('attendance:calendar-manage')
  add(
    @Param('yearId', ParseUUIDPipe) yearId: string,
    @Body() dto: CreateCalendarEntryDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<CalendarEntryResponse[]> {
    return this.calendar.addEntries(yearId, dto, actor);
  }

  @Delete('entries/:entryId')
  @HttpCode(200)
  @RequirePermissions('attendance:calendar-manage')
  async remove(
    @Param('yearId', ParseUUIDPipe) yearId: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<{ deleted: true }> {
    await this.calendar.removeEntry(yearId, entryId, actor);
    return { deleted: true };
  }
}
