import { Module } from '@nestjs/common';
import { PayrollController } from './payroll.controller.js';
import { PayrollService } from './payroll.service.js';
@Module({ controllers: [PayrollController], providers: [PayrollService] })
export class PayrollModule {}
