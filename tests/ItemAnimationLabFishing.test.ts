// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { SurvivalPhase } from '../src/survival/SurvivalPhase';
import { SurvivalUI } from '../src/ui/SurvivalUI';

describe('Item Animation Lab fishing', () => {
  it.each(['click', 'keyboard'])('casts from the lab rod with %s and returns to the lab', async (input) => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = new SurvivalUI(mount);
    const world = {
      projectInteractionAnchors: () => [{
        id: 'fishing-tools', itemType: null, toolId: 'fishingRod' as const,
        action: 'fish' as const, remainingUses: null, backingInstanceId: null,
        x: 90, y: 180, visible: true, depleted: false,
      }],
      enterFishingView: vi.fn(async () => undefined),
      centeredFishingCast: () => ({ x: 0, z: -6.4 }),
      playFishingCast: vi.fn(async () => undefined),
      playFishingMiss: vi.fn(async () => undefined),
      exitFishingView: vi.fn(async () => undefined),
    };
    const phase = SurvivalPhase.forTest({ ui, world }, 'item-animation-lab');
    try {
      phase.start();
      const rod = mount.querySelector<HTMLButtonElement>('[data-anchor-id="fishing-tools"]')!;
      expect(rod.disabled).toBe(false);
      if (input === 'click') rod.click();
      else rod.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await vi.waitFor(() => expect(world.enterFishingView).toHaveBeenCalledOnce());
      const fishing = mount.querySelector<HTMLElement>('[data-fishing]')!;
      fishing.click();
      expect(world.playFishingCast).toHaveBeenCalledOnce();
      await Promise.resolve();
      phase.update(100, 100);
      await vi.waitFor(() => expect(world.playFishingMiss).toHaveBeenCalledOnce());
      mount.querySelector<HTMLButtonElement>('[data-fishing-result-continue]')!.click();
      mount.querySelector<HTMLButtonElement>('[data-fishing-view-exit]')!.click();
      await vi.waitFor(() => expect(world.exitFishingView).toHaveBeenCalledOnce());
      rod.click();
      expect(world.enterFishingView).toHaveBeenCalledTimes(2);
    } finally {
      phase.dispose();
      mount.remove();
    }
  });
});
