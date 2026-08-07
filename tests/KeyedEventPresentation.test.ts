import { describe, expect, it, vi } from 'vitest';
import { KeyedEventPresentation } from '../src/survival/KeyedEventPresentation';

class TestPresentation extends KeyedEventPresentation {
  readonly samples: Array<readonly [string, number]> = [];
  readonly finished = vi.fn();

  constructor() {
    super('test-keyed-event');
  }

  protected reset(): void {}
  protected applyIdle(): void {}
  protected applyAnimation(kind: string, _time: number, progress: number): void {
    this.samples.push([kind, progress]);
  }
  protected finishAnimation(kind: string): void {
    this.finished(kind);
  }
}

describe('KeyedEventPresentation', () => {
  it('settles an active reaction once when visibility changes', async () => {
    const presentation = new TestPresentation();
    presentation.stage();
    const reaction = presentation.react('flowers.collect');
    presentation.settleForVisibilityChange();

    await reaction;
    expect(presentation.samples.at(-1)).toEqual(['flowers.collect', 1]);
    expect(presentation.finished).toHaveBeenCalledOnce();
  });
});
