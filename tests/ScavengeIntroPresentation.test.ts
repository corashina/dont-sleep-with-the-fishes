import { describe, expect, it } from 'vitest';
import { ScavengeIntroPresentation } from '../src/world/ScavengeIntroPresentation';

describe('ScavengeIntroPresentation', () => {
  it('uses fixed pools and settles after 2.2 seconds', () => {
    const effect = new ScavengeIntroPresentation();
    expect(effect.root.name).toBe('scavenge-intro-crash');
    expect(effect.snapshotForTest()).toMatchObject({
      active: false,
      debrisCount: 8,
      flashOpacity: 0,
      smokeCount: 12,
    });
    effect.trigger();
    expect(effect.snapshotForTest().flashOpacity).toBeGreaterThan(0);
    effect.update(0.25);
    expect(effect.snapshotForTest().active).toBe(true);
    effect.update(2.2);
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
