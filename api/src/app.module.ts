import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { validateEnv } from './config/env.validation.js';
import { HealthModule } from './infra/health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { PermissionsGuard } from './modules/auth/guards/permissions.guard.js';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { RbacModule } from './modules/rbac/rbac.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module.js';
import { AcademicYearsModule } from './modules/academic-years/academic-years.module.js';
import { ClassesModule } from './modules/classes/classes.module.js';
import { SubjectsModule } from './modules/subjects/subjects.module.js';
import { StaffModule } from './modules/staff/staff.module.js';
import { MessagingModule } from './infra/messaging/messaging.module.js';
import { GuardiansModule } from './modules/guardians/guardians.module.js';
import { StudentsModule } from './modules/students/students.module.js';
import { AttendanceModule } from './modules/attendance/attendance.module.js';
import { ExamsModule } from './modules/exams/exams.module.js';
import { StorageModule } from './infra/storage/storage.module.js';
import { SchoolModule } from './modules/school/school.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    AuditLogsModule,
    HealthModule,
    AuthModule,
    UsersModule,
    RbacModule,
    AcademicYearsModule,
    ClassesModule,
    SubjectsModule,
    StaffModule,
    MessagingModule,
    GuardiansModule,
    StudentsModule,
    AttendanceModule,
    ExamsModule,
    StorageModule,
    SchoolModule
  ],
  providers: [
    ...(process.env.NODE_ENV === 'test'
      ? []
      : [{ provide: APP_GUARD, useClass: ThrottlerGuard }]),
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}