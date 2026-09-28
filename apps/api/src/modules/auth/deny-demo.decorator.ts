import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { DenyDemoGuard } from './deny-demo.guard';

export const DENY_DEMO_ACTION_KEY = 'denyDemoAction';

export const DenyDemo = (action: string) =>
  applyDecorators(
    SetMetadata(DENY_DEMO_ACTION_KEY, action),
    UseGuards(DenyDemoGuard),
  );
