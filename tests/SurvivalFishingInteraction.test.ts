// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { SurvivalPhase } from '../src/survival/SurvivalPhase';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { SurvivalUI } from '../src/ui/SurvivalUI';

describe('fishing controls', () => {
  it.each(['click', 'keyboard'])('opens the rod once and casts with %s after each result', async (input) => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = new SurvivalUI(mount);
    const session = new SurvivalSession([], { seed: 1, initial: { energy: 2 } });
    const world = {
      projectInteractionAnchors: () => [{
        id: 'fishing-tools', itemType: null, toolId: 'fishingRod' as const,
        action: 'fish' as const, remainingUses: null, backingInstanceId: null,
        x: 90, y: 180, visible: true, depleted: false,
      }],
      enterFishingView: vi.fn(async () => undefined),
      castFishingAtScreenPoint: () => ({ x: 0, z: -6.4 }),
      centeredFishingCast: () => ({ x: 0, z: -6.4 }),
      playFishingCast: vi.fn(async () => undefined),
      playFishingMiss: vi.fn(async () => undefined),
      exitFishingView: vi.fn(async () => undefined),
    };
    const phase = SurvivalPhase.forTest({ ui, world, session });
    try {
      phase.start();
      const rod = mount.querySelector<HTMLButtonElement>('[data-anchor-id="fishing-tools"]')!;
      rod.click();
      const fishing = mount.querySelector<HTMLElement>('[data-fishing]')!;
      await vi.waitFor(() => expect(fishing.dataset.mode).toBe('aiming'));
      expect(session.snapshot().energy).toBe(2);
      expect(world.playFishingCast).not.toHaveBeenCalled();

      for (let cast = 1; cast <= 2; cast += 1) {
        if (input === 'click') fishing.click();
        else fishing.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
        expect(world.playFishingCast).toHaveBeenCalledTimes(cast);
        expect(session.snapshot().energy).toBe(2 - cast);
        await Promise.resolve();
        phase.update(100 * cast, 100);
        await vi.waitFor(() => expect(fishing.dataset.mode).toBe('result'));
        mount.querySelector<HTMLButtonElement>('[data-fishing-result-close]')!.click();
        if (cast === 1) {
          expect(fishing.dataset.mode).toBe('aiming');
          expect(world.exitFishingView).not.toHaveBeenCalled();
        }
      }
      await vi.waitFor(() => expect(fishing.dataset.mode).toBe('hidden'));
      expect(world.enterFishingView).toHaveBeenCalledOnce();
      expect(world.exitFishingView).toHaveBeenCalledOnce();
    } finally {
      phase.dispose();
      mount.remove();
    }
  });
});
