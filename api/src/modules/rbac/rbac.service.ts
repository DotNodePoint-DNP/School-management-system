import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ADMIN_ROLE } from '../../common/constants/rbac.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import type { CreateRoleDto } from './dto/create-role.dto.js';
import type { SetRolePermissionsDto } from './dto/set-role-permissions.dto.js';
import type { UpdateRoleDto } from './dto/update-role.dto.js';
import { AuditService } from '../audit-logs/audit.service.js';

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

const ROLE_SELECT = {
  id: true,
  name: true,
  description: true,
  isSystem: true,
  permissions: {
    select: { permission: { select: { module: true, action: true } } },
  },
  _count: { select: { users: true } },
} satisfies Prisma.RoleSelect;

type RoleRow = Prisma.RoleGetPayload<{ select: typeof ROLE_SELECT }>;

const codesOf = (role: RoleRow): string[] =>
  role.permissions
    .map((p) => `${p.permission.module}:${p.permission.action}`)
    .sort();

function toRoleResponse(role: RoleRow): RoleResponse {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    userCount: role._count.users,
    permissions: codesOf(role),
  };
}

@Injectable()
export class RbacService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listRoles(): Promise<RoleResponse[]> {
    const roles = await this.prisma.role.findMany({
      orderBy: { name: 'asc' },
      select: ROLE_SELECT,
    });
    return roles.map(toRoleResponse);
  }

  async getRole(id: string): Promise<RoleResponse> {
    return toRoleResponse(await this.requireRole(id));
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

  async createRole(dto: CreateRoleDto, actor: AuthUser): Promise<RoleResponse> {
    await this.assertNameFree(dto.name);
    this.assertActorHolds(dto.permissions, actor);
    const permissionIds = await this.resolvePermissionIds(dto.permissions);

    const role = await this.prisma.role.create({
      data: {
        name: dto.name,
        description: dto.description,
        permissions: {
          create: permissionIds.map((permissionId) => ({ permissionId })),
        },
      },
      select: ROLE_SELECT,
    });
    await this.audit.record({
      actor,
      action: 'role.created',
      entityType: 'role',
      entityId: role.id,
      details: { name: role.name, permissions: [...dto.permissions].sort() },
    });
    return toRoleResponse(role);
  }

  async updateRole(
    id: string,
    dto: UpdateRoleDto,
    actor: AuthUser,
  ): Promise<RoleResponse> {
    const role = await this.requireRole(id);
    if (role.isSystem)
      throw new ForbiddenException('System roles cannot be renamed');
    this.assertActorHolds(codesOf(role), actor);
    if (dto.name !== undefined) await this.assertNameFree(dto.name, id);

    const data: Prisma.RoleUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    await this.prisma.role.update({ where: { id }, data });
    await this.audit.record({
      actor,
      action: 'role.updated',
      entityType: 'role',
      entityId: id,
      details: { changedFields: Object.keys(data) },
    });
    return this.getRole(id);
  }

  async setPermissions(
    id: string,
    dto: SetRolePermissionsDto,
    actor: AuthUser,
  ): Promise<RoleResponse> {
    const role = await this.requireRole(id);
    if (role.name === ADMIN_ROLE) {
      throw new ForbiddenException(
        'ADMIN always holds every permission and cannot be changed',
      );
    }
    // The actor must hold everything the role has now (to touch it) and everything it will have (to grant it).
    this.assertActorHolds(
      [...new Set([...codesOf(role), ...dto.permissions])],
      actor,
    );
    const permissionIds = await this.resolvePermissionIds(dto.permissions);

    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({
        where: { roleId: id, permissionId: { notIn: permissionIds } },
      }),
      this.prisma.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({
          roleId: id,
          permissionId,
        })),
        skipDuplicates: true,
      }),
    ]);
    await this.audit.record({
      actor,
      action: 'role.permissions_changed',
      entityType: 'role',
      entityId: id,
      details: {
        role: role.name,
        before: codesOf(role),
        after: [...dto.permissions].sort(),
      },
    });
    return this.getRole(id);
  }

  async deleteRole(id: string, actor: AuthUser): Promise<void> {
    const role = await this.requireRole(id);
    if (role.isSystem)
      throw new ForbiddenException('System roles cannot be deleted');
    this.assertActorHolds(codesOf(role), actor);
    if (role._count.users > 0) {
      throw new ConflictException(
        `This role is assigned to ${role._count.users} user(s). Reassign them first.`,
      );
    }
    await this.prisma.role.delete({ where: { id } });
    await this.audit.record({
      actor,
      action: 'role.deleted',
      entityType: 'role',
      entityId: id,
      details: { name: role.name, permissions: codesOf(role) },
    });
  }

  private async requireRole(id: string): Promise<RoleRow> {
    const role = await this.prisma.role.findUnique({
      where: { id },
      select: ROLE_SELECT,
    });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  private async assertNameFree(
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.prisma.role.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (existing)
      throw new ConflictException('A role with this name already exists');
  }

  private assertActorHolds(codes: string[], actor: AuthUser): void {
    const own = new Set(actor.permissions);
    const missing = codes.filter((code) => !own.has(code));
    if (missing.length > 0) {
      throw new ForbiddenException(
        `You cannot grant or modify permissions you do not hold: ${missing.join(', ')}`,
      );
    }
  }

  private async resolvePermissionIds(codes: string[]): Promise<string[]> {
    if (codes.length === 0) return [];
    const pairs = codes.map((code) => {
      const [module, action] = code.split(':') as [string, string];
      return { module, action };
    });
    const rows = await this.prisma.permission.findMany({
      where: { OR: pairs },
      select: { id: true },
    });
    if (rows.length !== pairs.length)
      throw new BadRequestException('One or more permissions do not exist');
    return rows.map((r) => r.id);
  }
}
