import { hash, verify } from '@node-rs/argon2';

const OPTIONS = { memoryCost: 2 ** 16, timeCost: 5, parallelism: 1 };

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

export function verifyPassword(hash: string, plain: string): Promise<boolean> {
  return verify(hash, plain, OPTIONS);
}
