import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.validation.js';

describe('validateEnv', () => {
  const validEnv = {
    NODE_ENV: 'test',
    PORT: '3000',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    CORS_ORIGINS: 'http://localhost:3001',
  };

  it('coerces a valid port to a number', () => {
    expect(validateEnv(validEnv).PORT).toBe(3000);
  });

  it('rejects a missing database URL', () => {
    const { DATABASE_URL: _databaseUrl, ...invalidEnv } = validEnv;
    expect(() => validateEnv(invalidEnv)).toThrow('DATABASE_URL');
  });
});
