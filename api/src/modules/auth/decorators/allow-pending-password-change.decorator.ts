import { SetMetadata } from '@nestjs/common';

export const ALLOW_PENDING_PASSWORD_CHANGE_KEY = 'allowPendingPasswordChange';
export const AllowPendingPasswordChange = (): MethodDecorator &
  ClassDecorator => SetMetadata(ALLOW_PENDING_PASSWORD_CHANGE_KEY, true);
