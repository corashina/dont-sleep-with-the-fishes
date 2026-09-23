import { describe, expect, it, vi } from 'vitest';
import { Group } from 'three';
import type { BoatSupplyDisplay } from '../src/survival/BoatSupplyDisplay';
import type { EventModelLibrary } from '../src/survival/EventModelLibrary';
import { WeatherEventAnimator } from '../src/survival/WeatherEventAnimator';

describe('fog monster presentation', () => {
  // Importance: 95/100. The threat must exist before the event becomes visible.
  it('shows the monster at staging and throughout the reveal, then clears it', async () => {
    const supplies = {
      clearEventPose: vi.fn(), resetEventPoseForFrame: vi.fn(),
    } as unknown as BoatSupplyDisplay;
    const models = {
      create: () => ({ root: new Group(), dispose: vi.fn() }),
    } as unknown as EventModelLibrary;
    const animator = new WeatherEventAnimator(new Group(), supplies, models, undefined, 'monster-in-the-fog');
    const monster = animator.worldRoot.getObjectByName('fog-monster')!;
    try {
      animator.stage('monster-in-the-fog', 19);
      expect(monster.visible).toBe(true);
      const reveal = animator.reveal('monster-in-the-fog');
      expect(monster.visible).toBe(true);
      for (const delta of [0, 0.1, 0.9, 1, 3.2]) {
        animator.update(0, delta);
        expect(monster.visible).toBe(true);
      }
      await reveal;
      animator.clear();
      expect(monster.visible).toBe(false);
    } finally { animator.dispose(); }
  });
});
