import 'reflect-metadata';

process.env.NODE_ENV = 'test';
process.env.STORAGE_DRIVER = 'memory';
process.env.SMS_PROVIDER = 'disabled';
process.env.EMAIL_PROVIDER = 'disabled';
process.env.JWT_ACCESS_SECRET = 'local-test-suite-signing-secret-at-least-32';
process.env.PORT = '3000';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.CORS_ORIGINS = 'http://localhost:3001';
