import { randomBytes } from 'node:crypto';

const PUBLIC_ID_BYTES = 16;

export function generatePublicId(): string {
  return randomBytes(PUBLIC_ID_BYTES).toString('base64url');
}
