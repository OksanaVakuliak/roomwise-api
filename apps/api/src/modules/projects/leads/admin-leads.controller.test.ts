import { describe, expect, it, vi } from 'vitest';
import { LeadStatus } from '../../../generated/prisma/enums';
import { AdminLeadsController } from './admin-leads.controller';

const ADMIN = { id: 'admin-1', login: 'admin', isDemo: false, sessionId: 's' };
const PARAMS = { id: 'lead-1' };

function createController() {
  const leads = {
    list: vi.fn().mockResolvedValue({ items: [] }),
    get: vi.fn().mockResolvedValue({ id: 'lead-1' }),
    changeStatus: vi.fn().mockResolvedValue({ status: 'DONE' }),
    addNote: vi.fn().mockResolvedValue({ id: 'note-1' }),
    delete: vi.fn().mockResolvedValue(undefined),
  };

  return { leads, controller: new AdminLeadsController(leads as never) };
}

describe('AdminLeadsController', () => {
  it('lists leads for the current admin', async () => {
    const { controller, leads } = createController();
    const query = { page: 1, pageSize: 50 } as never;

    expect(await controller.list(query, ADMIN)).toEqual({ items: [] });
    expect(leads.list).toHaveBeenCalledWith(query, ADMIN);
  });

  it('reads a lead in the requested language', async () => {
    const { controller, leads } = createController();

    await controller.get(PARAMS, { lang: 'uk' }, ADMIN);

    expect(leads.get).toHaveBeenCalledWith('lead-1', 'uk', ADMIN);
  });

  it('changes the status with the body and language', async () => {
    const { controller, leads } = createController();
    const body = { status: LeadStatus.DONE, revision: 'r' } as never;

    await controller.changeStatus(PARAMS, { lang: 'en' }, body, ADMIN);

    expect(leads.changeStatus).toHaveBeenCalledWith(
      'lead-1',
      body,
      ADMIN,
      'en',
    );
  });

  it('adds a note as the current admin', async () => {
    const { controller, leads } = createController();
    const body = { text: 'called' } as never;

    expect(await controller.addNote(PARAMS, body, ADMIN)).toEqual({
      id: 'note-1',
    });
    expect(leads.addNote).toHaveBeenCalledWith('lead-1', body, ADMIN);
  });

  it('deletes a lead', async () => {
    const { controller, leads } = createController();

    await controller.remove(PARAMS);

    expect(leads.delete).toHaveBeenCalledWith('lead-1');
  });
});
