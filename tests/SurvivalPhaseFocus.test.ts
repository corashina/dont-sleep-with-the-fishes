// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import type { ItemInstance } from '../src/game/ItemState';
import type { BoatInteractionAnchor } from '../src/survival/BoatInteraction';
import { SurvivalPhase } from '../src/survival/SurvivalPhase';
import { SurvivalSession } from '../src/survival/SurvivalSession';
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
});
