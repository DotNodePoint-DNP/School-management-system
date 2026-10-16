import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'src/prisma/schema',
  migrations: { path: 'src/prisma/migrations',seed:'tsx src/prisma/seed.ts' },
  datasource: process.env.DATABASE_URL
    ? { url: process.env.DATABASE_URL }
    : { url: process.env.DATABASE_URL },
});