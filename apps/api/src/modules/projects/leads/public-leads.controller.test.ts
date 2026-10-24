import { describe, expect, it, vi } from 'vitest';
import { IdempotencyScope } from '../../../generated/prisma/enums';
import { PublicLeadsController } from './public-leads.controller';

const CONTEXT = {
  scope: IdempotencyScope.LEAD,
  key: 'key',
  requestHash: 'hash',
};

function createController() {
  const leads = {
    create: vi.fn().mockResolvedValue({ created: true }),
    formSettings: vi.fn().mockResolvedValue({ notice: 'n' }),
  };

  return {
    leads,
    controller: new PublicLeadsController(leads as never),
  };
}

describe('PublicLeadsController', () => {
  it('submits with the body and idempotency context', async () => {
    const { controller, leads } = createController();
    const body = { name: 'Oksana' } as never;

    const result = await controller.create(body, CONTEXT);

    expect(result).toEqual({ created: true });
    expect(leads.create).toHaveBeenCalledWith(body, CONTEXT);
  });

  it('reads form settings in the requested language', async () => {
    const { controller, leads } = createController();

    const result = await controller.formSettings({ lang: 'en' });

    expect(result).toEqual({ notice: 'n' });
    expect(leads.formSettings).toHaveBeenCalledWith('en');
  });
});
