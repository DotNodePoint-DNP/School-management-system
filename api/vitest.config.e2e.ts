import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    setupFiles: ['./test/setup.ts'],
    fileParallelism: false, // one suite at a time: a single Prisma pool and no cross-suite interference
    testTimeout: 30_000, // each test makes several round trips to a remote database
    hookTimeout: 60_000, // beforeAll creates users and hashes passwords
  },
});