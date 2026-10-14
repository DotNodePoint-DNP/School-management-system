import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { hashPassword } from '../common/utils/password.js';
import { PERMISSIONS, SYSTEM_ROLES } from '../common/constants/rbac.js';

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  const adminEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;

  if (!connectionString || !adminEmail || !adminPassword) {
    throw new Error('DATABASE_URL, SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set');
  }
  if (adminPassword.length < 12) {
    throw new Error('SEED_ADMIN_PASSWORD must be at least 12 characters');
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const passwordHash = await hashPassword(adminPassword);

  try {
    for (const code of PERMISSIONS) {
      const [module, action] = code.split(':') as [string, string];
      await prisma.permission.upsert({
        where: { module_action: { module, action } },
        update: {},
        create: { module, action },
      });
    }

    for (const name of SYSTEM_ROLES) {
      await prisma.role.upsert({ where: { name }, update: {}, create: { name, isSystem: true } });
    }

    // ADMIN always holds every permission in the catalogue.
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'ADMIN' } });
    const allPermissions = await prisma.permission.findMany({ select: { id: true } });
    await prisma.rolePermission.createMany({
      data: allPermissions.map((p) => ({ roleId: adminRole.id, permissionId: p.id })),
      skipDuplicates: true,
    });

    // Never overwrite an existing admin's password on re-seed.
    const admin = await prisma.user.upsert({
      where: { email: adminEmail },
      update: {},
      create: { email: adminEmail, passwordHash, fullName: 'System Administrator', mustChangePassword: true },
    });
    
    await prisma.userRole.createMany({
      data: [{ userId: admin.id, roleId: adminRole.id }],
      skipDuplicates: true,
    });

    console.log('Database seeded successfully!');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});