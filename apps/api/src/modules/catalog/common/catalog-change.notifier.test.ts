import { describe, expect, it, vi } from 'vitest';
import { CatalogChangeNotifier } from './catalog-change.notifier';

describe('CatalogChangeNotifier', () => {
  it('emits to every subscriber on notify', () => {
    const notifier = new CatalogChangeNotifier();
    const first = vi.fn();
    const second = vi.fn();
    notifier.changes$.subscribe(first);
    notifier.changes$.subscribe(second);

    notifier.notify();
    notifier.notify();

    expect(first).toHaveBeenCalledTimes(2);
    expect(second).toHaveBeenCalledTimes(2);
  });

  it('does not replay past changes to late subscribers', () => {
    const notifier = new CatalogChangeNotifier();
    notifier.notify();
    const listener = vi.fn();

    notifier.changes$.subscribe(listener);

    expect(listener).not.toHaveBeenCalled();
  });

  it('stops emitting after unsubscribe', () => {
    const notifier = new CatalogChangeNotifier();
    const listener = vi.fn();
    const subscription = notifier.changes$.subscribe(listener);

    subscription.unsubscribe();
    notifier.notify();

    expect(listener).not.toHaveBeenCalled();
  });
});
