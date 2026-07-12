// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import type { ItemInstance } from '../src/game/ItemState';
import type { BoatInteractionAnchor } from '../src/survival/BoatInteraction';
import { applyInventoryMutation } from '../src/survival/inventory';
import { SurvivalPhase } from '../src/survival/SurvivalPhase';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import type { SurvivalInventory, SurvivalSnapshot } from '../src/survival/survivalTypes';
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
const horizonAnchor: BoatInteractionAnchor = {
  id: 'horizon',
  itemType: null,
  action: 'endDay',
  remainingUses: null,
  x: 400,
  y: 80,
  visible: true,
  depleted: false,
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('SurvivalPhase focus synchronization', () => {
  it('uses an Energy Bar through a real anchor click and returns focus after Continue', async () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = new SurvivalUI(mount);
    const bar: ItemInstance = { instanceId: 'energyBar-1', type: 'energyBar' };
    const session = new SurvivalSession([bar], { seed: 1, initial: { energy: 1 } });
    const barAnchor: BoatInteractionAnchor = {
      id: bar.instanceId, itemType: bar.type, action: null, condition: 'usable', remainingUses: 1,
      x: 320, y: 240, visible: true, depleted: false,
    };
    const world = {
      syncInventory: () => undefined,
      projectInteractionAnchors: () => [barAnchor, horizonAnchor],
      play: () => Promise.resolve(),
      dispose: () => undefined,
    };
    const phase = SurvivalPhase.forTest({ session, world, ui });
    phase.start();
    const button = mount.querySelector<HTMLButtonElement>('[data-anchor-id="energyBar-1"]')!;
    button.focus();

    button.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(session.snapshot()).toMatchObject({ energy: 4 });
    expect(session.snapshot().inventory.energyBar.instances[0]?.condition).toBe('consumed');
    mount.querySelector<HTMLButtonElement>('[data-continue]')!.click();
    expect(document.activeElement).toBe(button);
    phase.dispose();
  });

  it('announces unavailable Chest use without mutation or RNG and restores anchor focus', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = new SurvivalUI(mount);
    let randomCalls = 0;
    const chest: ItemInstance = { instanceId: 'chest-1', type: 'chest' };
    const session = new SurvivalSession([chest], {
      seed: 1,
      random: { next: () => { randomCalls += 1; return 0; } },
    });
    const before = session.snapshot();
    const chestAnchor: BoatInteractionAnchor = {
      id: chest.instanceId, itemType: chest.type, action: null, condition: 'usable', remainingUses: 1,
      x: 320, y: 240, visible: true, depleted: false,
    };
    const phase = SurvivalPhase.forTest({
      session,
      world: {
        syncInventory: () => undefined,
        projectInteractionAnchors: () => [chestAnchor, horizonAnchor],
        dispose: () => undefined,
      },
      ui,
    });
    phase.start();
    const button = mount.querySelector<HTMLButtonElement>('[data-anchor-id="chest-1"]')!;
    button.focus();

    button.click();

    expect(mount.querySelector('[data-outcome-message]')?.textContent).toMatch(/wiki.*utility pool/i);
    expect(session.snapshot()).toEqual(before);
    expect(randomCalls).toBe(0);
    mount.querySelector<HTMLButtonElement>('[data-continue]')!.click();
    expect(document.activeElement).toBe(button);
    phase.dispose();
  });

  it('repairs the selected broken recovered instance through the Duct Tape target dialog', async () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = new SurvivalUI(mount);
    const items: ItemInstance[] = [
      { instanceId: 'ductTape-1', type: 'ductTape' },
      { instanceId: 'map-1', type: 'map' },
    ];
    const session = new SurvivalSession(items, { seed: 1 });
    const mutable = (session as unknown as { inventory: SurvivalInventory }).inventory;
    applyInventoryMutation(mutable, { kind: 'break', itemId: 'map', instanceId: 'map-1', quantity: 1 });
    const anchors: BoatInteractionAnchor[] = [
      {
        id: 'ductTape-1', itemType: 'ductTape', action: null, condition: 'usable', remainingUses: 1,
        x: 320, y: 240, visible: true, depleted: false,
      },
      {
        id: 'map-1', itemType: 'map', action: null, condition: 'broken', remainingUses: 0,
        x: 420, y: 240, visible: true, depleted: true,
      },
      horizonAnchor,
    ];
    const phase = SurvivalPhase.forTest({
      session,
      world: {
        syncInventory: () => undefined,
        projectInteractionAnchors: () => anchors,
        play: () => Promise.resolve(),
        dispose: () => undefined,
      },
      ui,
    });
    phase.start();

    mount.querySelector<HTMLButtonElement>('[data-anchor-id="ductTape-1"]')!.click();
    expect(mount.querySelector('[data-item-targets]')).not.toBeNull();
    mount.querySelector<HTMLButtonElement>('[data-item-target-id="map-1"]')!.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(session.snapshot().inventory.map.instances[0]?.condition).toBe('usable');
    expect(session.snapshot().inventory.ductTape.instances[0]?.condition).toBe('consumed');
    phase.dispose();
  });

  it('moves focus to a visible usable anchor after Continue consumes the last can', async () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = new SurvivalUI(mount);
    const session = new SurvivalSession([can], { seed: 1, initial: { hunger: 80 } });
    let anchors: BoatInteractionAnchor[] = [canAnchor, horizonAnchor];
    const world = {
      syncInventory(current: SurvivalSnapshot) {
        anchors = current.food > 0 ? [canAnchor, horizonAnchor] : [horizonAnchor];
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
    mount.querySelector<HTMLButtonElement>('[data-continue]')!.click();

    expect(eat.isConnected && !eat.hidden).toBe(false);
    expect(document.activeElement).toBe(mount.querySelector('[data-anchor-id="horizon"]'));
    phase.dispose();
  });
});
