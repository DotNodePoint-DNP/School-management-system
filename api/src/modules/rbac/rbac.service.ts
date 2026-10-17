import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface RoleResponse {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  userCount: number;
  permissions: string[];
}

export interface PermissionGroup {
  module: string;
  actions: { id: string; action: string; description: string | null }[];
}

@Injectable()
export class RbacService {
  constructor(private readonly prisma: PrismaService) {}

  async listRoles(): Promise<RoleResponse[]> {
    const roles = await this.prisma.role.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        isSystem: true,
        permissions: {
          select: { permission: { select: { module: true, action: true } } },
        },
        _count: { select: { users: true } },
      },
    });
    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      userCount: r._count.users,
      permissions: r.permissions
        .map((p) => `${p.permission.module}:${p.permission.action}`)
        .sort(),
    }));
  }

  async listPermissions(): Promise<PermissionGroup[]> {
    const rows = await this.prisma.permission.findMany({
      orderBy: [{ module: 'asc' }, { action: 'asc' }],
      select: { id: true, module: true, action: true, description: true },
    });
    const groups = new Map<string, PermissionGroup>();
    for (const row of rows) {
      const group = groups.get(row.module) ?? {
        module: row.module,
        actions: [],
      };
      group.actions.push({
        id: row.id,
        action: row.action,
        description: row.description,
      });
      groups.set(row.module, group);
    }
    return [...groups.values()];
  }
}
