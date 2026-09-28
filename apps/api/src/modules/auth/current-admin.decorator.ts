import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export interface AuthenticatedAdmin {
  id: string;
  login: string;
  isDemo: boolean;
  sessionId: string;
}

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedAdmin => {
    const request = context
      .switchToHttp()
      .getRequest<Request & { admin: AuthenticatedAdmin }>();

    return request.admin;
  },
);
