import { createHash } from 'node:crypto';
import * as bcrypt from 'bcryptjs';

export const BCRYPT_COST = 12;

function prehash(plain: string): string {
  return createHash('sha256').update(plain, 'utf8').digest('base64');
}

export async function hashPassword(
  plain: string,
  cost: number = BCRYPT_COST,
): Promise<string> {
  return bcrypt.hash(prehash(plain), cost);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(prehash(plain), hash);
}
