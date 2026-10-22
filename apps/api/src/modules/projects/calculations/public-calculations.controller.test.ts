import { describe, expect, it, vi } from 'vitest';
import { IdempotencyScope } from '../../../generated/prisma/enums';
import { PublicCalculationsController } from './public-calculations.controller';

const CONTEXT = {
  scope: IdempotencyScope.SAVE,
  key: 'key',
  requestHash: 'hash',
};

function createController() {
  const calculations = {
    create: vi.fn().mockResolvedValue({ created: true }),
    findVersion: vi.fn().mockResolvedValue({ found: true }),
  };

  return {
    calculations,
    controller: new PublicCalculationsController(calculations as never),
  };
}

describe('PublicCalculationsController', () => {
  it('saves with the body, idempotency context and language', async () => {
    const { controller, calculations } = createController();
    const body = { styleId: 'style' } as never;

    const result = await controller.create(body, { lang: 'uk' }, CONTEXT);

    expect(result).toEqual({ created: true });
    expect(calculations.create).toHaveBeenCalledWith(body, CONTEXT, 'uk');
  });

  it('reads the latest version without a number', async () => {
    const { controller, calculations } = createController();

    await controller.getLatest('public', { lang: 'en' });

    expect(calculations.findVersion).toHaveBeenCalledWith('public', null, 'en');
  });

  it('passes a valid version number', async () => {
    const { controller, calculations } = createController();

    await controller.getVersion('public', '3', { lang: 'en' });

    expect(calculations.findVersion).toHaveBeenCalledWith('public', 3, 'en');
  });

  it.each(['abc', '0', '-1', '1.5', '', '99999999999'])(
    'maps invalid version number %j to a number no version has',
    async (value) => {
      const { controller, calculations } = createController();

      await controller.getVersion('public', value, { lang: 'en' });

      expect(calculations.findVersion).toHaveBeenCalledWith('public', 0, 'en');
    },
  );
});
