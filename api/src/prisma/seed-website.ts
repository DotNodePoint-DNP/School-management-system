import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { seedWebsite } from './website-seed.js';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
try {
  await db.$transaction((tx) => seedWebsite(tx), { timeout: 60000 });
  console.log('Website CMS seed complete');
} finally {
  await db.$disconnect();
}
