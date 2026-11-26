import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import { PayrollService } from './payroll.service.js';
import {
  SalaryRateDto,
  ReviewEntryDto,
  RecordPaymentDto,
  ReasonDto,
  ReportFilterDto,
  AdvanceDto, PreferenceDto, TransferDto,
} from './payroll.dto.js';

@Controller('payroll')
@RequirePermissions('payroll:read')
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}
  @Get('advances')
  advances(){return this.payroll.advances();}

  @Post('advances') @RequirePermissions('payroll:read','payroll:record-payment')
  issue(@Body() dto:AdvanceDto,@CurrentUser() actor:AuthUser){return this.payroll.issueAdvance(dto,actor);}

  @Put('staff/:id/preference') @RequirePermissions('payroll:read','payroll:manage')
  preference(@Param('id',ParseUUIDPipe) id:string,@Body() dto:PreferenceDto,@CurrentUser() actor:AuthUser){return this.payroll.preferences(id,dto,actor);}

  @Get('staff/:id/missing-months')
  missing(@Param('id',ParseUUIDPipe) id:string){return this.payroll.missing(id);}

  @Get('periods/:month/staff/:id/attendance')
  attendance(@Param('month') month:string,@Param('id',ParseUUIDPipe) id:string){return this.payroll.attendance(month,id);}

  @Post('staff/:id/transfers') @RequirePermissions('payroll:read','payroll:record-payment')
  transfer(@Param('id',ParseUUIDPipe) id:string,@Body() dto:TransferDto,@CurrentUser() actor:AuthUser){return this.payroll.transfer(id,dto,actor);}

  @Post('periods/:month/supplements/:staffId') @RequirePermissions('payroll:read','payroll:manage','payroll:unlock')
  supplement(@Param('month') month:string,@Param('staffId',ParseUUIDPipe) id:string,@Body() dto:ReasonDto,@CurrentUser() actor:AuthUser){
    return this.payroll.supplement(month,id,dto.reason,actor);
  }

  @Post('periods/:month/entries/:id/lock') @RequirePermissions('payroll:read','payroll:manage','payroll:unlock')
  lockSupplement(@Param('month') month:string,@Param('id',ParseUUIDPipe) id:string,@CurrentUser() actor:AuthUser){
    return this.payroll.lockSupplement(month,id,actor);
  }
  @Get('today') today() {
    return this.payroll.today();
  }
  @Get('staff') staff() {
    return this.payroll.staff();
  }
  @Get('staff/:id/history') history(@Param('id', ParseUUIDPipe) id: string) {
    return this.payroll.history(id);
  }
  @Get('reports/paid') report(@Query() filter: ReportFilterDto) {
    return this.payroll.report(filter);
  }
  @Get('periods/:month') register(@Param('month') month: string) {
    return this.payroll.register(month);
  }
  @Put('staff/:id/rate')
  @RequirePermissions('payroll:read', 'payroll:manage')
  rate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SalaryRateDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.payroll.rate(id, dto, actor);
  }
  @Post('periods/:month/generate')
  @RequirePermissions('payroll:read', 'payroll:manage')
  generate(@Param('month') month: string, @CurrentUser() actor: AuthUser) {
    return this.payroll.generate(month, actor);
  }
  @Put('periods/:month/entries/:id')
  @RequirePermissions('payroll:read', 'payroll:manage')
  review(
    @Param('month') month: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewEntryDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.payroll.review(month, id, dto, actor);
  }
  @Post('periods/:month/finalize')
  @RequirePermissions('payroll:read', 'payroll:manage')
  finalize(@Param('month') month: string, @CurrentUser() actor: AuthUser) {
    return this.payroll.finalize(month, actor);
  }
  @Post('periods/:month/reopen')
  @RequirePermissions('payroll:read', 'payroll:manage','payroll:unlock')
  reopen(
    @Param('month') month: string,
    @Body() dto: ReasonDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.payroll.reopen(month, dto.reason, actor);
  }
  @Post('periods/:month/entries/:id/payments')
  @RequirePermissions('payroll:read', 'payroll:record-payment')
  pay(
    @Param('month') month: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordPaymentDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.payroll.pay(month, id, dto, actor);
  }
  @Post('periods/:month/payments/:id/void')
  @RequirePermissions('payroll:read', 'payroll:record-payment')
  voidPayment(
    @Param('month') month: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReasonDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.payroll.voidPayment(month, id, dto.reason, actor);
  }
}
