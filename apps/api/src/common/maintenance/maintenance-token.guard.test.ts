import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../../config/env';
import { AppError } from '../http/app-error';
import { ERROR_CODES } from '../http/error-codes';
import { MaintenanceTokenGuard } from './maintenance-token.guard';

const MAINTENANCE_TOKEN = 'a'.repeat(32);

function createContext(header?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        header: vi.fn().mockReturnValue(header),
      }),
    }),
  } as unknown as ExecutionContext;
}

function createConfig(): ConfigService<AppEnv, true> {
  return {
    get: vi.fn().mockReturnValue(MAINTENANCE_TOKEN),
  } as unknown as ConfigService<AppEnv, true>;
}

describe('MaintenanceTokenGuard', () => {
  it('allows the request when the token matches', () => {
    const guard = new MaintenanceTokenGuard(createConfig());

    expect(guard.canActivate(createContext(MAINTENANCE_TOKEN))).toBe(true);
  });

  it('rejects the request when the token is wrong', () => {
    const guard = new MaintenanceTokenGuard(createConfig());

    expect(() => guard.canActivate(createContext('wrong-token'))).toThrow(
      AppError,
    );

    try {
      guard.canActivate(createContext('wrong-token'));
    } catch (error) {
      expect((error as AppError).code).toBe(ERROR_CODES.UNAUTHENTICATED);
    }
  });

  it('rejects the request when the token is missing', () => {
    const guard = new MaintenanceTokenGuard(createConfig());

    expect(() => guard.canActivate(createContext(undefined))).toThrow(AppError);
  });

  it('rejects a token of a different length without throwing from timingSafeEqual', () => {
    const guard = new MaintenanceTokenGuard(createConfig());

    expect(() => guard.canActivate(createContext('short'))).toThrow(AppError);
  });
});
