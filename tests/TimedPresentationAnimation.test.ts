import { describe, expect, it, vi } from 'vitest';
import { TimedPresentationAnimation } from '../src/survival/TimedPresentationAnimation';

describe('TimedPresentationAnimation', () => {
  it('samples normalized progress and resolves once after completion', async () => {
    const sample = vi.fn();
    const finish = vi.fn();
    const animation = new TimedPresentationAnimation<'reveal'>(sample, finish);
    const completed = animation.start('reveal', 2);

    animation.update(4, 0.5);
    animation.update(5, 1.5);

    await expect(completed).resolves.toBeUndefined();
    expect(sample.mock.calls).toEqual([
      ['reveal', 4, 0.25],
      ['reveal', 5, 1],
    ]);
    expect(finish).toHaveBeenCalledOnce();
    expect(animation.active).toBe(false);
  });

  it('settles with the completion result and cancels with the cancellation result', async () => {
    const animation = new TimedPresentationAnimation<'item'>(() => undefined);
    const settled = animation.start('item', 3, { complete: true, cancel: false });
    animation.settle(8);
    await expect(settled).resolves.toBe(true);

    const cancelled = animation.start('item', 3, { complete: true, cancel: false });
    animation.cancel();
    await expect(cancelled).resolves.toBe(false);
  });

  it('cancels the prior animation and clamps negative delta to zero', async () => {
    const sample = vi.fn();
    const animation = new TimedPresentationAnimation<'first' | 'second'>(sample);
    const first = animation.start('first', 1);
    const second = animation.start('second', 1);
    animation.update(2, -4);
    animation.update(3, 1);

    await expect(first).resolves.toBeUndefined();
    await expect(second).resolves.toBeUndefined();
    expect(sample).toHaveBeenCalledWith('second', 2, 0);
    expect(sample).toHaveBeenCalledWith('second', 3, 1);
  });
});
