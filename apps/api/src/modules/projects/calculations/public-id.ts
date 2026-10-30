import { randomBytes } from 'node:crypto';

const PUBLIC_ID_BYTES = 16;

export function generatePublicId(): string {
  return randomBytes(PUBLIC_ID_BYTES).toString('base64url');
}

export function publicIdFromUuid(uuid: string): string {
  return Buffer.from(uuid.replaceAll('-', ''), 'hex').toString('base64url');
}
