import { SetMetadata } from '@nestjs/common';
import type { Permission } from '../../../common/constants/rbac.js';

export const PERMISSIONS_KEY = 'requiredPermissions';
export const RequirePermissions = (
  ...codes: Permission[]
): MethodDecorator & ClassDecorator => SetMetadata(PERMISSIONS_KEY, codes);
