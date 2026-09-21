import { randomUUID } from 'node:crypto';
import { AppError } from '../http/app-error';
import { ERROR_CODES } from '../http/error-codes';

export interface RevisionMutation {
  revision: string;
  updatedAt: Date;
  updatedById: string;
}

export interface RevisionUpdateOptions {
  id: string;
  expectedRevision: string;
  updatedById: string;
  update: (input: {
    id: string;
    expectedRevision: string;
    mutation: RevisionMutation;
  }) => Promise<number>;
  readCurrentRevision: (id: string) => Promise<string | null>;
}

export async function updateWithRevision(
  options: RevisionUpdateOptions,
): Promise<RevisionMutation> {
  const mutation: RevisionMutation = {
    revision: randomUUID(),
    updatedAt: new Date(),
    updatedById: options.updatedById,
  };
  const count = await options.update({
    id: options.id,
    expectedRevision: options.expectedRevision,
    mutation,
  });

  if (count === 0) {
    const currentRevision = await options.readCurrentRevision(options.id);
    if (currentRevision === null) {
      throw new AppError(ERROR_CODES.NOT_FOUND);
    }
    throw new AppError(ERROR_CODES.STALE_REVISION, {
      params: { currentRevision },
    });
  }

  return mutation;
}
