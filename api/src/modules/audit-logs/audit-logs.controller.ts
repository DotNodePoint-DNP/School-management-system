import { Controller, Get, Query } from '@nestjs/common';
import type { CursorPaginated } from '../../common/dto/pagination.dto.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import {
  AuditLogsService,
  type AuditLogResponse,
} from './audit-logs.service.js';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto.js';

@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly logs: AuditLogsService) {}

  @Get()
  @RequirePermissions('audit-logs:read')
  list(
    @Query() query: ListAuditLogsQueryDto,
  ): Promise<CursorPaginated<AuditLogResponse>> {
    return this.logs.list(query);
  }
}
