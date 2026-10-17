import { hash, verify } from '@node-rs/argon2';
import { randomInt } from 'node:crypto';

const OPTIONS = { memoryCost: 2 ** 16, timeCost: 5, parallelism: 1 };
// No look-alike characters (0/O, 1/l/I) so it can be read out or typed from a note.
const TEMP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

export function verifyPassword(hash: string, plain: string): Promise<boolean> {
  return verify(hash, plain, OPTIONS);
}

export function generateTemporaryPassword(length = 14): string {
  return Array.from({ length }, () => TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)]).join('');
}