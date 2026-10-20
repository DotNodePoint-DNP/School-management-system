import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { GuardiansController } from './guardians.controller.js';
import { GuardiansService } from './guardians.service.js';
import { ParentAccountsService } from './parent-accounts.service.js';

@Module({
  imports: [UsersModule],
  controllers: [GuardiansController],
  providers: [GuardiansService, ParentAccountsService],
  exports: [ParentAccountsService],
})
export class GuardiansModule {}
