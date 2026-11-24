import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.validation.js';

describe('validateEnv', () => {
  const validEnv = {
    NODE_ENV: 'test',
    PORT: '3000',
    JWT_ACCESS_SECRET: 'test-only-signing-secret-for-env-validation',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    CORS_ORIGINS: 'http://localhost:3001',
  };

  it('coerces a valid port to a number', () => {
    expect(validateEnv(validEnv).PORT).toBe(3000);
  });

  it('requires HTTPS and a token when a delivery gateway is selected', () => {
    const config = { ...validEnv, SMS_PROVIDER: 'gateway', MESSAGING_GATEWAY_URL: 'http://example.org/send' };
    expect(() => validateEnv(config)).toThrow('MESSAGING_GATEWAY_URL');
    expect(() => validateEnv({ ...config, MESSAGING_GATEWAY_URL: 'https://example.org/send' })).toThrow('MESSAGING_GATEWAY_TOKEN');
    expect(validateEnv({ ...config, MESSAGING_GATEWAY_URL: 'https://example.org/send', MESSAGING_GATEWAY_TOKEN: 'test-token' }).SMS_PROVIDER).toBe('gateway');
  });

  it('rejects a missing database URL', () => {
    const { DATABASE_URL: _databaseUrl, ...invalidEnv } = validEnv;
    expect(() => validateEnv(invalidEnv)).toThrow('DATABASE_URL');
  });
});
