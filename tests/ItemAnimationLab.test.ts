// Importance: 4/5. Protects the non-ending item animation test scene.
import { describe, expect, it, vi } from 'vitest';
import {
  ITEM_IDS,
  type ItemInstance,
  type ItemInstanceId,
} from '../src/game/ItemState';
import {
  ITEM_ANIMATION_LAB_ID,
  ITEM_ANIMATION_LAB_USES,
} from '../src/survival/ItemAnimationLab';
import { SurvivalPhase } from '../src/survival/SurvivalPhase';
import { SurvivalSession } from '../src/survival/SurvivalSession';

function allItems(): readonly ItemInstance[] {
  return ITEM_IDS.map((type) => ({
    instanceId: `${type}-1` as ItemInstanceId,
    type,
  }));
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('Item Animation Lab', () => {
  it('defines one canonical route for every item', () => {
    expect(Object.keys(ITEM_ANIMATION_LAB_USES)).toEqual([...ITEM_IDS]);
    expect(ITEM_ANIMATION_LAB_USES.scubaSet).toEqual({
      eventId: 'flowers',
      choiceId: 'scubaSet',
    });
    expect(ITEM_ANIMATION_LAB_USES.captainWhiskers).toEqual({
      eventId: 'flowers',
      choiceId: 'captainWhiskers',
    });
  });

  it('replays items without resolving outcomes or changing inventory', async () => {
    const savedItems = allItems();
    const current = new SurvivalSession(savedItems, { seed: 19 }).snapshot();
    const itemUse = deferred();
    const playEventItemUse = vi.fn(() => itemUse.promise);
    const stageEvent = vi.fn();
    const clearEvent = vi.fn();
    const returnEventItemUse = vi.fn(() => Promise.resolve());
    const setEventSelection = vi.fn();
    const setEventEligibleItems = vi.fn();
    const resolveEvent = vi.fn();
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => current), resolveEvent },
      world: {
        stageEvent,
        clearEvent,
        playEventItemUse,
        returnEventItemUse,
        setEventEligibleItems,
        setEventSelectedItem: vi.fn(),
        syncInventory: vi.fn(),
        dispose: vi.fn(),
      },
      ui: {
        beginEventPresentation: vi.fn(),
        showItemAnimationLab: vi.fn(),
        setEventSelection,
        setEventUsing: vi.fn(),
        setBusy: vi.fn(),
        dispose: vi.fn(),
      },
    }, ITEM_ANIMATION_LAB_ID);

    phase.start();

    const first = current.inventory['cannedFood-1']!;
    const second = current.inventory['flashlight-1']!;
    const firstUse = ITEM_ANIMATION_LAB_USES[first.type];
    const secondUse = ITEM_ANIMATION_LAB_USES[second.type];
    phase.handleEventItem(firstUse.choiceId, first.instanceId);
    phase.handleEventItem(secondUse.choiceId, second.instanceId);

    expect(stageEvent).toHaveBeenCalledExactlyOnceWith(firstUse.eventId);
    expect(playEventItemUse).toHaveBeenCalledExactlyOnceWith(
      firstUse.eventId,
      firstUse.choiceId,
      first.instanceId,
    );
    expect(resolveEvent).not.toHaveBeenCalled();

    itemUse.resolve();
    await flushPromises();

    expect(returnEventItemUse).toHaveBeenCalledOnce();
    expect(clearEvent).toHaveBeenCalledOnce();
    expect(setEventSelection).toHaveBeenCalledTimes(2);
    expect(setEventEligibleItems).toHaveBeenLastCalledWith(
      new Set(ITEM_IDS.map((type) => `${type}-1`)),
    );
    expect(current.inventory[first.instanceId]).toBe(first);

    phase.handleEventItem(firstUse.choiceId, first.instanceId);
    expect(playEventItemUse).toHaveBeenCalledTimes(2);
    phase.dispose();
  });
});
