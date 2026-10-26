import type { RetiredOption } from '../../pricing/estimate/pricing-estimate.service';
import type { SnapshotV1 } from './snapshot.schema';

export function retiredOptionsOf(snapshot: SnapshotV1): RetiredOption[] {
  const retired = new Map<string, RetiredOption>();

  for (const line of snapshot.lines) {
    if (
      line.optionId !== null &&
      (line.section === 'ENGINEERING' || line.section === 'ADDITIONAL')
    ) {
      retired.set(line.optionId, { id: line.optionId, kind: line.section });
    }
  }

  return [...retired.values()];
}
