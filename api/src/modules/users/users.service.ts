import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ADMIN_ROLE } from '../../common/constants/rbac.js';
import {
  toPaginated,
  type Paginated,
} from '../../common/dto/pagination.dto.js';
import { normalizePhone } from '../../common/utils/identifier.js';
import {
  generateTemporaryPassword,
  hashPassword,
  temporaryCredentialExpiry,
} from '../../common/utils/password.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import type { CreateUserDto } from './dto/create-user.dto.js';
import type { ListUsersQueryDto } from './dto/query-user.dto.js';
import type { SetUserRolesDto } from './dto/set-user-roles.dto.js';
import type { UpdateUserDto } from './dto/update-user.dto.js';
import {
  USER_SELECT,
  toUserResponse,
  type UserResponse,
} from './dto/user-response.dto.js';
import { AuditService } from '../audit-logs/audit.service.js';

const permissionCode = (p: {
  permission: { module: string; action: string };
}): string => `${p.permission.module}:${p.permission.action}`;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListUsersQueryDto): Promise<Paginated<UserResponse>> {
    const where: Prisma.UserWhereInput = {};
    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.roleId) where.roles = { some: { roleId: query.roleId } };
    if (query.search) {
      const contains = { contains: query.search, mode: 'insensitive' as const };
      where.OR = [
        { fullName: contains },
        { email: contains },
        { phone: contains },
      ];
    }

    const primary: Prisma.UserOrderByWithRelationInput =
      query.sortBy === 'fullName'
        ? { fullName: query.sortOrder }
        : query.sortBy === 'lastLoginAt'
          ? { lastLoginAt: query.sortOrder }
          : { createdAt: query.sortOrder };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: [primary, { id: 'asc' }], // id keeps page boundaries stable
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: USER_SELECT,
      }),
      this.prisma.user.count({ where }),
    ]);
    return toPaginated(rows.map(toUserResponse), total, query);
  }

  async findOne(id: string): Promise<UserResponse> {
    const row = await this.prisma.user.findUnique({
      where: { id },
      select: USER_SELECT,
    });
    if (!row) throw new NotFoundException('User not found');
    return toUserResponse(row);
  }

  async create(
    dto: CreateUserDto,
    actor: AuthUser,
  ): Promise<{ user: UserResponse; temporaryPassword: string }> {
    const email = dto.email?.toLowerCase();
    const phone = dto.phone ? normalizePhone(dto.phone) : undefined;
    if (dto.phone && !phone)
      throw new BadRequestException('Invalid phone number');
    if (!email && !phone)
      throw new BadRequestException('Provide an email or a phone number');

    await this.assertRolesAssignable(dto.roleIds, actor);

    const temporaryPassword = generateTemporaryPassword();
    const row = await this.prisma.user.create({
      data: {
        fullName: dto.fullName,
        email,
        phone: phone ?? undefined,
        passwordHash: await hashPassword(temporaryPassword),
        credentialsExpireAt: temporaryCredentialExpiry(),
        mustChangePassword: true,
        roles: { create: dto.roleIds.map((roleId) => ({ roleId })) },
      },
      select: USER_SELECT,
    });
    await this.audit.record({
      actor,
      action: 'user.created',
      entityType: 'user',
      entityId: row.id,
      details: {
        fullName: row.fullName,
        email: row.email,
        phone: row.phone,
        roleIds: dto.roleIds,
      },
    });
    return { user: toUserResponse(row), temporaryPassword };
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    actor: AuthUser,
  ): Promise<UserResponse> {
    await this.requireManageable(id, actor);

    const data: Prisma.UserUpdateInput = {};
    if (dto.fullName !== undefined) data.fullName = dto.fullName;
    if (dto.email !== undefined) data.email = dto.email.toLowerCase();
    if (dto.phone !== undefined) {
      const phone = normalizePhone(dto.phone);
      if (!phone) throw new BadRequestException('Invalid phone number');
      data.phone = phone;
    }
    const row = await this.prisma.user.update({
      where: { id },
      data,
      select: USER_SELECT,
    });
    await this.audit.record({
      actor,
      action: 'user.updated',
      entityType: 'user',
      entityId: id,
      details: { changedFields: Object.keys(data) },
    });
    return toUserResponse(row);
  }

  async setRoles(
    id: string,
    dto: SetUserRolesDto,
    actor: AuthUser,
  ): Promise<UserResponse> {
    if (id === actor.id)
      throw new ForbiddenException('You cannot change your own roles');
    const target = await this.requireManageable(id, actor);

    const nextIds = new Set(dto.roleIds);
    const nextRoles = await this.prisma.role.findMany({
      where: { id: { in: dto.roleIds } },
      select: { id: true, name: true },
    });
    if (nextRoles.length !== nextIds.size)
      throw new BadRequestException('One or more roles do not exist');

    // Both added and removed roles must be within the actor's own permissions.
    const current = await this.prisma.userRole.findMany({
      where: { userId: id },
      select: { roleId: true },
    });
    const currentIds = new Set(current.map((r) => r.roleId));
    const changed = [...new Set([...currentIds, ...nextIds])].filter(
      (r) => currentIds.has(r) !== nextIds.has(r),
    );
    if (changed.length > 0) await this.assertRolesAssignable(changed, actor);

    if (
      target.isActive &&
      target.roleNames.includes(ADMIN_ROLE) &&
      !nextRoles.some((r) => r.name === ADMIN_ROLE)
    ) {
      await this.assertAnotherActiveAdmin(id);
    }

    await this.prisma.$transaction([
      this.prisma.userRole.deleteMany({
        where: { userId: id, roleId: { notIn: dto.roleIds } },
      }),
      this.prisma.userRole.createMany({
        data: dto.roleIds.map((roleId) => ({ userId: id, roleId })),
        skipDuplicates: true,
      }),
    ]);

    await this.audit.record({
      actor,
      action: 'user.roles_changed',
      entityType: 'user',
      entityId: id,
      details: { before: [...currentIds].sort(), after: [...nextIds].sort() },
    });
    return this.findOne(id);
  }

  async deactivate(id: string, actor: AuthUser): Promise<UserResponse> {
    if (id === actor.id)
      throw new BadRequestException('You cannot deactivate your own account');
    const target = await this.requireManageable(id, actor);
    if (!target.isActive) return this.findOne(id);
    if (target.roleNames.includes(ADMIN_ROLE))
      await this.assertAnotherActiveAdmin(id);

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { isActive: false } }),
      this.prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    await this.audit.record({
      actor,
      action: 'user.deactivated',
      entityType: 'user',
      entityId: id,
    });
    return this.findOne(id);
  }

  async activate(id: string, actor: AuthUser): Promise<UserResponse> {
    await this.requireManageable(id, actor);
    await this.prisma.user.update({ where: { id }, data: { isActive: true } });
    await this.audit.record({
      actor,
      action: 'user.activated',
      entityType: 'user',
      entityId: id,
    });
    return this.findOne(id);
  }

  async resetPassword(
    id: string,
    actor: AuthUser,
  ): Promise<{ temporaryPassword: string }> {
    if (id === actor.id)
      throw new BadRequestException(
        'Use change-password to change your own password',
      );
    await this.requireManageable(id, actor);

    const temporaryPassword = generateTemporaryPassword();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: {
          passwordHash: await hashPassword(temporaryPassword),
          mustChangePassword: true,
          credentialsExpireAt: temporaryCredentialExpiry(),
        },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    await this.audit.record({
      actor,
      action: 'user.password_reset',
      entityType: 'user',
      entityId: id,
    });
    return { temporaryPassword };
  }

  /** Loads the target and blocks managing someone who holds permissions the actor lacks. */
  private async requireManageable(
    id: string,
    actor: AuthUser,
  ): Promise<{ isActive: boolean; roleNames: string[] }> {
    const target = await this.prisma.user.findUnique({
      where: { id },
      select: {
        isActive: true,
        roles: {
          select: {
            role: {
              select: {
                name: true,
                permissions: {
                  select: {
                    permission: { select: { module: true, action: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!target) throw new NotFoundException('User not found');

    if (id !== actor.id) {
      const own = new Set(actor.permissions);
      const exceeds = target.roles.some((r) =>
        r.role.permissions.some((p) => !own.has(permissionCode(p))),
      );
      if (exceeds)
        throw new ForbiddenException(
          'You cannot manage a user who has more permissions than you',
        );
    }
    return {
      isActive: target.isActive,
      roleNames: target.roles.map((r) => r.role.name),
    };
  }

  private async assertRolesAssignable(
    roleIds: string[],
    actor: AuthUser,
  ): Promise<void> {
    const wanted = new Set(roleIds);
    const roles = await this.prisma.role.findMany({
      where: { id: { in: [...wanted] } },
      select: {
        name: true,
        permissions: {
          select: { permission: { select: { module: true, action: true } } },
        },
      },
    });
    if (roles.length !== wanted.size)
      throw new BadRequestException('One or more roles do not exist');

    const own = new Set(actor.permissions);
    for (const role of roles) {
      if (role.permissions.some((p) => !own.has(permissionCode(p)))) {
        throw new ForbiddenException(
          `You cannot assign or remove the role "${role.name}": it grants permissions you do not have`,
        );
      }
    }
  }

  // A concurrent double-demotion could slip past this count; acceptable for rare admin-only actions.
  private async assertAnotherActiveAdmin(
    excludingUserId: string,
  ): Promise<void> {
    const others = await this.prisma.user.count({
      where: {
        isActive: true,
        id: { not: excludingUserId },
        roles: { some: { role: { name: ADMIN_ROLE } } },
      },
    });
    if (others === 0)
      throw new ConflictException(
        'At least one active administrator is required',
      );
  }
}
