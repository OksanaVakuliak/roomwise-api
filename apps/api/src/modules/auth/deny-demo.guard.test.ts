import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../common/http/app-error';
import { ERROR_CODES } from '../../common/http/error-codes';
import { DenyDemoGuard } from './deny-demo.guard';

function createContext(isDemo: boolean): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ admin: { isDemo } }),
    }),
  } as unknown as ExecutionContext;
}

function createReflector(action: string): Reflector {
  return {
    getAllAndOverride: vi.fn().mockReturnValue(action),
  } as unknown as Reflector;
}

describe('DenyDemoGuard', () => {
  it('throws DEMO_FORBIDDEN with the action for a demo admin', () => {
    const guard = new DenyDemoGuard(createReflector('change-password'));

    try {
      guard.canActivate(createContext(true));
      throw new Error('Expected guard to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe(ERROR_CODES.DEMO_FORBIDDEN);
      expect((error as AppError).params).toEqual({
        action: 'change-password',
      });
    }
  });

  it('allows a non-demo admin through', () => {
    const guard = new DenyDemoGuard(createReflector('change-password'));

    expect(guard.canActivate(createContext(false))).toBe(true);
  });
});
