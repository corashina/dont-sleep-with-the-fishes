import { describe, expect, it } from 'vitest';
import { ScavengeIntroPresentation } from '../src/world/ScavengeIntroPresentation';

describe('ScavengeIntroPresentation', () => {
  it('uses one fixed pool and settles after 1.5 seconds', () => {
    const effect = new ScavengeIntroPresentation();
    expect(effect.root.name).toBe('scavenge-intro-crash');
    expect(effect.snapshotForTest()).toMatchObject({ active: false, debrisCount: 8 });
    effect.trigger();
    effect.update(0.25);
    expect(effect.snapshotForTest().active).toBe(true);
    effect.update(2);
    expect(effect.snapshotForTest().active).toBe(false);
    effect.dispose();
    expect(() => effect.dispose()).not.toThrow();
  });

  it('keeps active debris at the same age for a zero-delta update', () => {
    const effect = new ScavengeIntroPresentation();
    effect.trigger();
    effect.update(0.25);
    const before = effect.snapshotForTest();

    effect.update(0);

    expect(effect.snapshotForTest()).toEqual(before);
    effect.dispose();
  });
});
