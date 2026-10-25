import { SetMetadata } from '@nestjs/common';
import type { PublicWriteLimitName } from './public-write-throttle.constants';

export const PUBLIC_WRITE_LIMIT_KEY = 'publicWriteLimit';

export const PublicWriteLimit = (name: PublicWriteLimitName) =>
  SetMetadata(PUBLIC_WRITE_LIMIT_KEY, name);
