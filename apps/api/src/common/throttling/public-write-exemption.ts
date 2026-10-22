import type { ExecutionContext } from '@nestjs/common';

export abstract class PublicWriteExemption {
  abstract isExempt(context: ExecutionContext): Promise<boolean>;
}
