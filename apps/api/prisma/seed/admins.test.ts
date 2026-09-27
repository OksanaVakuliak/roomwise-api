import { describe, expect, it } from 'vitest';
import { resolveAdminSeedAction } from './admins';

describe('resolveAdminSeedAction', () => {
  it('updates the existing demo admin when one is found', () => {
    const action = resolveAdminSeedAction({ id: 'demo-id' }, null);

    expect(action).toEqual({ kind: 'update', adminId: 'demo-id' });
  });

  it('creates a new admin when no demo admin and no conflict exist', () => {
    const action = resolveAdminSeedAction(null, null);

    expect(action).toEqual({ kind: 'create' });
  });

  it('reports a conflict when the login belongs to a non-demo admin', () => {
    const action = resolveAdminSeedAction(null, { id: 'other-id' });

    expect(action).toEqual({ kind: 'conflict' });
  });

  it('reports a conflict when renaming the demo admin onto a login already taken by another admin', () => {
    const action = resolveAdminSeedAction(
      { id: 'demo-id' },
      { id: 'other-id' },
    );

    expect(action).toEqual({ kind: 'conflict' });
  });

  it('updates the demo admin when the login already belongs to it', () => {
    const action = resolveAdminSeedAction({ id: 'demo-id' }, { id: 'demo-id' });

    expect(action).toEqual({ kind: 'update', adminId: 'demo-id' });
  });
});
