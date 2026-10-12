import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'src/prisma/schema',
  migrations: { path: 'src/prisma/migrations' },
  // Client generation does not need a database connection. Migration and
  // database commands still fail if DATABASE_URL has not been configured.
  datasource: process.env.DATABASE_URL
    ? { url: process.env.DATABASE_URL }
    : undefined,
});
