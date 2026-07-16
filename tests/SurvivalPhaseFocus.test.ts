// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ItemInstance } from '../src/game/ItemState';
import type { BoatInteractionAnchor } from '../src/survival/BoatInteraction';
import { SurvivalPhase } from '../src/survival/SurvivalPhase';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { sequenceRandom } from './helpers/random';
import type { SurvivalSnapshot } from '../src/survival/survivalTypes';
import { SurvivalUI } from '../src/ui/SurvivalUI';

const can: ItemInstance = { instanceId: 'cannedFood-1', type: 'cannedFood' };
const canAnchor: BoatInteractionAnchor = {
  id: can.instanceId,
  itemType: can.type,
  action: 'eat',
  remainingUses: 1,
  x: 320,
  y: 240,
  visible: true,
  depleted: false,
};

const rod: ItemInstance = { instanceId: 'fishingRod-1', type: 'fishingRod' };
const bait: ItemInstance = { instanceId: 'baitTin-1', type: 'baitTin' };
const scuba: ItemInstance = { instanceId: 'scubaSet-1', type: 'scubaSet' };
const scubaAnchor: BoatInteractionAnchor = {
  id: scuba.instanceId, itemType: scuba.type, action: 'dive', remainingUses: null,
  x: 220, y: 220, visible: true, depleted: false,
};
const rodAnchor: BoatInteractionAnchor = {
  id: rod.instanceId, itemType: rod.type, action: 'fish', remainingUses: null,
  x: 360, y: 220, visible: true, depleted: false,
};

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
afterEach(() => {
  document.body.innerHTML = '';
});

describe('SurvivalPhase focus synchronization', () => {
  it('moves focus to stable End Day after a cue consumes the last can', async () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = new SurvivalUI(mount);
    const session = new SurvivalSession([can], { seed: 1, initial: { hunger: 80 } });
    let anchors: BoatInteractionAnchor[] = [canAnchor];
    const world = {
      syncInventory(current: SurvivalSnapshot) {
        anchors = current.food > 0 ? [canAnchor] : [];
      },
      projectInteractionAnchors: () => anchors,
      play: () => Promise.resolve(),
      dispose: () => undefined,
    };
    const phase = SurvivalPhase.forTest({ session, world, ui });
    phase.start();

    const eat = mount.querySelector<HTMLButtonElement>('[data-anchor-id="cannedFood-1"]')!;
    eat.click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(eat.isConnected && !eat.hidden).toBe(false);
    expect(document.activeElement).toBe(mount.querySelector('[data-action="endDay"]'));
    phase.dispose();
  });

  it('restores accepted baited fishing to Fish when another action precedes it', async () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = new SurvivalUI(mount);
    const session = new SurvivalSession([rod, bait, scuba], { seed: 1 });
    let finishCue!: () => void;
    const cue = new Promise<void>((resolve) => { finishCue = resolve; });
    const world = {
      syncInventory: () => undefined,
      projectInteractionAnchors: () => [scubaAnchor, rodAnchor],
      play: () => cue,
      dispose: () => undefined,
    };
    const phase = SurvivalPhase.forTest({
      session: {
        snapshot: () => session.snapshot(),
        perform: (action, option) => session.perform(action, option),
      },
      world,
      ui,
    });
    phase.start();

    const fish = mount.querySelector<HTMLButtonElement>('[data-anchor-id="fishingRod-1"]')!;
    fish.click();
    mount.querySelector<HTMLButtonElement>('[data-action-option="useBait"]')!.click();
    expect(mount.querySelector<HTMLButtonElement>('[data-anchor-id="scubaSet-1"]')!.disabled).toBe(true);

    finishCue();
    await flushPromises();

    expect(document.activeElement).toBe(fish);
    phase.dispose();
  });

  it('keeps Pause focused while sleep completion opens an event underneath it', async () => {
    vi.useFakeTimers();
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = new SurvivalUI(mount, { matches: true });
    const session = new SurvivalSession([], {
      seed: 4,
      random: sequenceRandom([0.5, 0]),
    });
    let finishNightfall!: () => void;
    const nightfall = new Promise<void>((resolve) => { finishNightfall = resolve; });
    const world = {
      syncInventory: () => undefined,
      projectInteractionAnchors: () => [],
      play: () => nightfall,
      dispose: () => undefined,
    };
    const phase = SurvivalPhase.forTest({ session, world, ui });

    try {
      phase.start();
      mount.querySelector<HTMLButtonElement>('[data-action="endDay"]')!.click();
      phase.setPaused(true);
      const pause = mount.querySelector<HTMLElement>('[data-pause]')!;
      const resume = mount.querySelector<HTMLButtonElement>('[data-resume]')!;
      const event = mount.querySelector<HTMLElement>('[data-event]')!;
      const eventTitle = mount.querySelector<HTMLElement>('[data-event-title]')!;
      expect(document.activeElement).toBe(resume);

      finishNightfall();
      await vi.runAllTimersAsync();
      await flushPromises();
      await vi.runAllTimersAsync();
      await flushPromises();

      expect(pause.classList).toContain('is-visible');
      expect(event.classList).toContain('is-visible');
      expect(event.hasAttribute('inert')).toBe(true);
      expect(document.activeElement).toBe(resume);

      phase.setPaused(false);
      expect(event.hasAttribute('inert')).toBe(false);
      expect(document.activeElement).toBe(eventTitle);
    } finally {
      phase.dispose();
      vi.useRealTimers();
    }
  });
});
