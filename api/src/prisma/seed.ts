import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { hashPassword } from '../common/utils/password.js';
import { PERMISSIONS, SYSTEM_ROLES } from '../common/constants/rbac.js';

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  const adminEmail = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  console.log('SEED SCRIPT PASSWORD READ:', JSON.stringify(adminPassword));

  if (!connectionString || !adminEmail || !adminPassword) {
    throw new Error(
      'DATABASE_URL, SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set',
    );
  }
  if (adminPassword.length < 12) {
    throw new Error('SEED_ADMIN_PASSWORD must be at least 12 characters');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  const passwordHash = await hashPassword(adminPassword);

  try {
    await prisma.$transaction(async (tx) => {
      for (const code of PERMISSIONS) {
        const [module, action] = code.split(':') as [string, string];
        await tx.permission.upsert({
          where: { module_action: { module, action } },
          update: {},
          create: { module, action },
        });
      }

      for (const name of SYSTEM_ROLES) {
        await tx.role.upsert({
          where: { name },
          update: {},
          create: { name, isSystem: true },
        });
      }

      // ADMIN always holds every permission in the catalogue.
      const adminRole = await tx.role.findUniqueOrThrow({
        where: { name: 'ADMIN' },
      });
      const allPermissions = await tx.permission.findMany({
        select: { id: true },
      });
      await tx.rolePermission.createMany({
        data: allPermissions.map((p) => ({
          roleId: adminRole.id,
          permissionId: p.id,
        })),
        skipDuplicates: true,
      });

      // Default grade scale: the 8-band table published with NEB results. Each school confirms it before official use.
      if ((await tx.gradeScale.count()) === 0) {
        const bands: [string, number, number, string, boolean][] = [
          ['A+', 90, 4.0, 'Outstanding', true],
          ['A', 80, 3.6, 'Excellent', true],
          ['B+', 70, 3.2, 'Very Good', true],
          ['B', 60, 2.8, 'Good', true],
          ['C+', 50, 2.4, 'Satisfactory', true],
          ['C', 40, 2.0, 'Acceptable', true],
          ['D', 35, 1.6, 'Basic', true],
          ['NG', 0, 0, 'Not Graded', false],
        ];
        await tx.gradeScale.create({
          data: {
            name: 'Standard (A+ to NG)',
            isDefault: true,
            bands: {
              create: bands.map(
                ([grade, minPercent, gradePoint, description, isPass]) => ({
                  grade,
                  minPercent,
                  gradePoint,
                  description,
                  isPass,
                }),
              ),
            },
          },
        });
      }

      // Never overwrite an existing admin's password on re-seed.
      const admin = await tx.user.upsert({
        where: { email: adminEmail },
        update: {},
        create: {
          email: adminEmail,
          passwordHash,
          fullName: 'System Administrator',
          mustChangePassword: true,
        },
      });

      await tx.userRole.createMany({
        data: [{ userId: admin.id, roleId: adminRole.id }],
        skipDuplicates: true,
      });
    },{
      maxWait: 50000, // default: 2000 ms
      timeout: 80000, // default: 5000 ms
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
