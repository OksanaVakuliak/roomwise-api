import type { ExecutionContext } from '@nestjs/common';

export abstract class PublicWriteReplayCheck {
  abstract isReplay(context: ExecutionContext): Promise<boolean>;
}
