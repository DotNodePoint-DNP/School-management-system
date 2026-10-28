import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PARENT_ROLE } from '../../common/constants/rbac.js';
import { dateParts } from '../../common/utils/bs-date.js';
import { displayName } from '../../common/utils/person.js';
import {
  generateTemporaryPassword,
  hashPassword,
  temporaryCredentialExpiry,
} from '../../common/utils/password.js';
import { Prisma } from '../../generated/prisma/client.js';
import { MessagingService } from '../../infra/messaging/messaging.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit-logs/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { UsersService } from '../users/users.service.js';
import { SchoolService } from '../school/school.service.js';

const TX = { maxWait: 15_000, timeout: 60_000 } as const;

export type LoginStatus =
  | 'sent'
  | 'delivery_failed'
  | 'exists'
  | 'no_contact'
  | 'contact_in_use'
  | 'failed';

export interface LoginOutcome {
  guardianId: string;
  status: LoginStatus;
  channel?: 'sms' | 'email';
  identifier?: string;
  /** Present ONLY when delivery failed, so staff can hand it over in person. */
  temporaryPassword?: string;
  message?: string;
}

interface GuardianContact {
  id: string;
  firstName: string;
  middleName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  userId: string | null;
}

interface CreatedAccount {
  identifier: string;
  temporaryPassword: string;
  expiresAt: Date;
}

const GUARDIAN_SELECT = {
  id: true,
  firstName: true,
  middleName: true,
  lastName: true,
  phone: true,
  email: true,
  userId: true,
} satisfies Prisma.GuardianSelect;

@Injectable()
export class ParentAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly messaging: MessagingService,
    private readonly users: UsersService,
    private readonly school: SchoolService,
  ) {}

  /** Creates the guardian's login (once) and sends the credentials. Never exposes the password unless delivery failed. */
  async provision(
    guardianId: string,
    childName: string | null,
    actor: AuthUser,
  ): Promise<LoginOutcome> {
    const guardian = await this.prisma.guardian.findUnique({
      where: { id: guardianId },
      select: GUARDIAN_SELECT,
    });
    if (!guardian) throw new NotFoundException('Guardian not found');
    if (guardian.userId) return { guardianId, status: 'exists' };
    if (!guardian.phone && !guardian.email) {
      return {
        guardianId,
        status: 'no_contact',
        message: 'Add a phone number or email before creating a login',
      };
    }

    const account = await this.createAccount(guardian);
    if (account === 'exists') return { guardianId, status: 'exists' };
    if (account === 'conflict') {
      return {
        guardianId,
        status: 'contact_in_use',
        message:
          'This phone number or email already belongs to another account. Add a different email, or create the login later.',
      };
    }

    const outcome = await this.deliver(guardian, account, childName);
    await this.audit.record({
      actor,
      action: 'guardian.login_created',
      entityType: 'guardian',
      entityId: guardianId,
      details: { delivery: outcome.status, channel: outcome.channel },
    });
    return { guardianId, ...outcome };
  }

  /** New temporary password for an existing parent login; the old one stops working. */
  async resend(guardianId: string, actor: AuthUser): Promise<LoginOutcome> {
    const guardian = await this.prisma.guardian.findUnique({
      where: { id: guardianId },
      select: GUARDIAN_SELECT,
    });
    if (!guardian) throw new NotFoundException('Guardian not found');
    if (!guardian.userId)
      throw new ConflictException(
        'This guardian has no login yet. Create one instead.',
      );
    if (!guardian.phone && !guardian.email)
      throw new ConflictException(
        'This guardian has no phone number or email to send to',
      );

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: guardian.userId },
      select: { isActive: true, phone: true, email: true },
    });
    if (!user.isActive)
      throw new ConflictException('This account is deactivated');

    const { temporaryPassword } = await this.users.resetPassword(
      guardian.userId,
      actor,
    );
    const fresh = await this.prisma.user.findUniqueOrThrow({
      where: { id: guardian.userId },
      select: { credentialsExpireAt: true },
    });
    const outcome = await this.deliver(
      guardian,
      {
        identifier: (user.phone ?? user.email) as string,
        temporaryPassword,
        expiresAt: fresh.credentialsExpireAt ?? temporaryCredentialExpiry(),
      },
      null,
    );
    await this.audit.record({
      actor,
      action: 'guardian.credentials_resent',
      entityType: 'guardian',
      entityId: guardianId,
      details: { delivery: outcome.status, channel: outcome.channel },
    });
    return { guardianId, ...outcome };
  }

  private async createAccount(
    guardian: GuardianContact,
  ): Promise<CreatedAccount | 'exists' | 'conflict'> {
    const role = await this.prisma.role.findUnique({
      where: { name: PARENT_ROLE },
      select: { id: true },
    });
    if (!role)
      throw new Error(`The ${PARENT_ROLE} role is missing: run the seed`);

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    const expiresAt = temporaryCredentialExpiry();
    const fullName = displayName(guardian);

    // If the phone is already another account's login, fall back to email alone.
    const attempts: { phone?: string; email?: string }[] =
      guardian.phone && guardian.email
        ? [
            { phone: guardian.phone, email: guardian.email },
            { email: guardian.email },
          ]
        : [
            {
              phone: guardian.phone ?? undefined,
              email: guardian.email ?? undefined,
            },
          ];

    for (const contact of attempts) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          // Row lock: two requests for the same guardian cannot both create an account.
          await tx.$queryRaw`SELECT id FROM guardians WHERE id = ${guardian.id}::uuid FOR UPDATE`;
          const current = await tx.guardian.findUniqueOrThrow({
            where: { id: guardian.id },
            select: { userId: true },
          });
          if (current.userId) return 'exists' as const;

          const user = await tx.user.create({
            data: {
              fullName,
              phone: contact.phone,
              email: contact.email,
              passwordHash,
              mustChangePassword: true,
              credentialsExpireAt: expiresAt,
              roles: { create: [{ roleId: role.id }] },
            },
            select: { id: true },
          });
          await tx.guardian.update({
            where: { id: guardian.id },
            data: { userId: user.id },
          });
          return {
            identifier: (contact.phone ?? contact.email) as string,
            temporaryPassword,
            expiresAt,
          };
        }, TX);
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        )
          continue;
        throw error;
      }
    }
    return 'conflict';
  }

  private async deliver(
    guardian: GuardianContact,
    account: CreatedAccount,
    childName: string | null,
  ): Promise<Omit<LoginOutcome, 'guardianId'>> {
    const schoolName = await this.school.displayName();
    const channel = guardian.phone ? 'sms' : 'email';
    const expires = dateParts(account.expiresAt);
    const text =
      `${schoolName}: Parent account${childName ? ` for ${childName}` : ''}. ` +
      `Login: ${account.identifier} Temporary password: ${account.temporaryPassword} ` +
      `(change it at first login; valid until ${expires.bs ?? expires.ad}).`;

    const result = guardian.phone
      ? await this.messaging.sendSms(guardian.phone, text)
      : await this.messaging.sendEmail(
          guardian.email as string,
          `${schoolName}: your parent account`,
          text,
        );

    if (result.ok)
      return { status: 'sent', channel, identifier: account.identifier };
    return {
      status: 'delivery_failed',
      channel,
      identifier: account.identifier,
      temporaryPassword: account.temporaryPassword,
      message:
        'The message could not be sent. Give the guardian these credentials in person. They must change the password at first login.',
    };
  }
}
