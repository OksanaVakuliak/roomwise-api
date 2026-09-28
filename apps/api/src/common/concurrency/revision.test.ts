import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../http/app-error';
import { updateWithRevision } from './revision';

describe('updateWithRevision', () => {
  it('returns the audit mutation after a matching update', async () => {
    const update = vi.fn().mockResolvedValue(1);
    const readCurrentRevision = vi.fn();

    const mutation = await updateWithRevision({
      id: 'entity-1',
      expectedRevision: 'revision-1',
      updatedById: 'admin-1',
      update,
      readCurrentRevision,
    });

    expect(mutation.revision).not.toBe('revision-1');
    expect(mutation.updatedById).toBe('admin-1');
    expect(readCurrentRevision).not.toHaveBeenCalled();
  });

  it('reports the current revision after a stale update', async () => {
    const action = updateWithRevision({
      id: 'entity-1',
      expectedRevision: 'revision-1',
      updatedById: 'admin-1',
      update: vi.fn().mockResolvedValue(0),
      readCurrentRevision: vi.fn().mockResolvedValue('revision-2'),
    });

    await expect(action).rejects.toMatchObject({
      code: 'STALE_REVISION',
      params: { currentRevision: 'revision-2' },
    } satisfies Partial<AppError>);
  });

  it('reports not found when the entity no longer exists', async () => {
    const action = updateWithRevision({
      id: 'entity-1',
      expectedRevision: 'revision-1',
      updatedById: 'admin-1',
      update: vi.fn().mockResolvedValue(0),
      readCurrentRevision: vi.fn().mockResolvedValue(null),
    });

    await expect(action).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<AppError>);
  });
});
