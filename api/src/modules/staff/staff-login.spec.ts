import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { StaffService } from './staff.service.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AuditService } from '../audit-logs/audit.service.js';
import type { UsersService } from '../users/users.service.js';
import type { SchoolService } from '../school/school.service.js';
import type { AuthUser } from '../auth/auth.types.js';

const admin: AuthUser = {
  id: 'admin',
  fullName: 'Admin',
  email: null,
  phone: null,
  mustChangePassword: false,
  roles: ['ADMIN'],
  permissions: ['staff:create-login', 'users:read'],
};

describe('staff login linking', () => {
  it.each([
    ['LEFT', null, true, 'This staff member has left'],
    ['ACTIVE', 'another-account', true, 'already has a login'],
    ['ACTIVE', null, false, 'Choose an active user account'],
  ] as const)(
    'rejects incompatible staff or account state (%s, %s, %s)',
    async (status, userId, active, message) => {
      const tx = {
        $queryRaw: vi
          .fn()
          .mockResolvedValueOnce([{ id: 'staff' }])
          .mockResolvedValueOnce([{ active }]),
        staff: {
          findUniqueOrThrow: vi.fn().mockResolvedValue({ status, userId }),
          update: vi.fn(),
        },
      };
      const audit = { recordIn: vi.fn() };
      const prisma = {
        $transaction: (run: (db: typeof tx) => unknown) => run(tx),
      };
      const service = new StaffService(
        prisma as unknown as PrismaService,
        audit as unknown as AuditService,
        {} as UsersService,
        {} as SchoolService,
      );
      await expect(
        service.linkLogin('staff', 'account', admin),
      ).rejects.toThrow(message);
      expect(tx.staff.update).not.toHaveBeenCalled();
      expect(audit.recordIn).not.toHaveBeenCalled();
    },
  );
});
