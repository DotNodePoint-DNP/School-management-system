import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission } from '../../../common/constants/rbac.js';
import type { AuthenticatedRequest } from '../auth.types.js';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator.js';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user || !required.every((code) => user.permissions.includes(code))) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }
}
