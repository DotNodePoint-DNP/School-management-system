import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RemarksQueryDto, SaveRemarksDto } from './dto/remarks.dto.js';
import { RemarksService } from './remarks.service.js';

@Controller('academic-years/:yearId/sections/:sectionId/remarks')
export class RemarksController {
  constructor(private readonly remarks: RemarksService) {}

  @Get()
  get(
    @Param('yearId', ParseUUIDPipe) yearId: string,
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @Query() q: RemarksQueryDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.remarks.get(yearId, sectionId, q.examId, actor);
  }

  @Put()
  @HttpCode(200)
  save(
    @Param('yearId', ParseUUIDPipe) yearId: string,
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @Query() q: RemarksQueryDto,
    @Body() dto: SaveRemarksDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.remarks.save(yearId, sectionId, q.examId, dto, actor);
  }
}
