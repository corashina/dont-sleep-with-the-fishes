// Importance: 8/10 (scaled from 4/5). Protects the non-ending item animation test scene.
import { describe, expect, it, vi } from 'vitest';
import {
  ITEM_IDS,
  type ItemInstance,
  type ItemInstanceId,
} from '../src/game/ItemState';
import {
  CARLITOS_LAB_CHOICE_ID,
  CARLITOS_LAB_INSTANCE_ID,
  ITEM_ANIMATION_LAB_ID,
  ITEM_ANIMATION_LAB_INITIAL_CHEST,
  ITEM_ANIMATION_LAB_INITIAL_RESOURCES,
  ITEM_ANIMATION_LAB_USES,
  REPAIR_TOOLBOX_LAB_CHOICE_ID,
  REPAIR_TOOLBOX_LAB_INSTANCE_ID,
} from '../src/survival/ItemAnimationLab';
import { SurvivalPhase } from '../src/survival/SurvivalPhase';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import type { SurvivalUI } from '../src/ui/SurvivalUI';

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
  const animatedItemIds = ITEM_IDS.filter((itemId) => (
    itemId !== 'scubaSet' && itemId !== 'bottledPaper' && itemId !== 'carlitos'
  ));

  it('defines one canonical route for every event-use item', () => {
    expect(Object.keys(ITEM_ANIMATION_LAB_USES)).toEqual(animatedItemIds);
    expect(ITEM_ANIMATION_LAB_USES.scubaSet).toBeUndefined();
    expect(ITEM_ANIMATION_LAB_USES.bottledPaper).toBeUndefined();
    expect(ITEM_ANIMATION_LAB_USES.carlitos).toBeUndefined();
  });

  it('starts with three food and bait supplies without duplicate actions', () => {
    const current = new SurvivalSession(allItems(), {
      seed: 19,
      initial: ITEM_ANIMATION_LAB_INITIAL_RESOURCES,
    }).snapshot();

    expect(current.food).toBe(3);
    expect(current.bait).toBe(3);
    expect(Object.values(current.inventory).filter((item) => (
      item?.type === 'cannedFood'
    ))).toHaveLength(1);
    expect(Object.values(current.inventory).filter((item) => (
      item?.type === 'baitTin'
    ))).toHaveLength(1);
  });

  it('starts with one chest and enough energy to test opening it', () => {
    const session = new SurvivalSession(allItems(), {
      seed: 19,
      initial: ITEM_ANIMATION_LAB_INITIAL_RESOURCES,
      initialChest: ITEM_ANIMATION_LAB_INITIAL_CHEST,
    });

    expect(session.snapshot()).toMatchObject({
      energy: 3,
      chest: ITEM_ANIMATION_LAB_INITIAL_CHEST,
    });
    expect(session.perform('openChest')).toMatchObject({
      accepted: true,
      code: 'chest-opened',
    });
    expect(session.snapshot()).toMatchObject({
      energy: 0,
      chest: { state: 'none', acquiredDay: null },
    });
  });

  it('keeps the rear camera control available in the lab', () => {
    const current = new SurvivalSession(allItems(), { seed: 19 }).snapshot();
    const setRearCameraView = vi.fn();
    const setCameraTurnState = vi.fn();
    const ui: Partial<SurvivalUI> = {
      beginEventPresentation: vi.fn(),
      showItemAnimationLab: vi.fn(),
      setEventSelection: vi.fn(),
      setBusy: vi.fn(),
      setCameraTurnState,
      dispose: vi.fn(),
    };
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => current) },
      world: {
        setRearCameraView,
        setEventSelectedItem: vi.fn(),
        setEventEligibleItems: vi.fn(),
        dispose: vi.fn(),
      },
      ui,
    }, ITEM_ANIMATION_LAB_ID);

    phase.start();
    expect(setCameraTurnState).toHaveBeenLastCalledWith(true, false);

    ui.onCameraTurn?.();
    expect(setRearCameraView).toHaveBeenLastCalledWith(true);
    expect(setCameraTurnState).toHaveBeenLastCalledWith(true, true);
    phase.dispose();
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

    const initialEligibility = setEventSelection.mock.calls[0]![0] as Map<
      ItemInstanceId,
      string
    >;
    expect(initialEligibility.get(CARLITOS_LAB_INSTANCE_ID))
      .toBe(CARLITOS_LAB_CHOICE_ID);

    const first = current.inventory['cannedFood-1']!;
    const second = current.inventory['flashlight-1']!;
    const firstUse = ITEM_ANIMATION_LAB_USES[first.type]!;
    const secondUse = ITEM_ANIMATION_LAB_USES[second.type]!;
    phase.handleEventItem(firstUse.choiceId, first.instanceId);
    phase.handleEventItem(secondUse.choiceId, second.instanceId);

    expect(stageEvent).toHaveBeenCalledExactlyOnceWith(firstUse.eventId);
    expect(playEventItemUse).toHaveBeenCalledExactlyOnceWith(
      firstUse.eventId,
      firstUse.choiceId,
      first.instanceId,
    );
    expect(resolveEvent).not.toHaveBeenCalled();
    expect(setEventEligibleItems).toHaveBeenLastCalledWith(new Set());

    itemUse.resolve();
    await flushPromises();

    expect(returnEventItemUse).toHaveBeenCalledOnce();
    expect(clearEvent).toHaveBeenCalledOnce();
    expect(setEventSelection).toHaveBeenCalledTimes(2);
    expect(setEventEligibleItems).toHaveBeenLastCalledWith(
      new Set([
        ...animatedItemIds.map((type) => `${type}-1`),
        CARLITOS_LAB_INSTANCE_ID,
        REPAIR_TOOLBOX_LAB_INSTANCE_ID,
      ]),
    );
    expect(setEventEligibleItems).toHaveBeenCalledTimes(3);
    expect(current.inventory[first.instanceId]).toBe(first);

    phase.handleEventItem(firstUse.choiceId, first.instanceId);
    expect(playEventItemUse).toHaveBeenCalledTimes(2);
    phase.dispose();
  });

  it('replays the fixed repair toolbox without resolving an event', async () => {
    const current = new SurvivalSession(allItems(), { seed: 19 }).snapshot();
    const toolboxUse = deferred();
    const playRepairToolboxAnimation = vi.fn(() => toolboxUse.promise);
    const stageEvent = vi.fn();
    const resolveEvent = vi.fn();
    const setEventUsing = vi.fn();
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => current), resolveEvent },
      world: {
        stageEvent,
        playRepairToolboxAnimation,
        setEventEligibleItems: vi.fn(),
        setEventSelectedItem: vi.fn(),
        syncInventory: vi.fn(),
        dispose: vi.fn(),
      },
      ui: {
        beginEventPresentation: vi.fn(),
        showItemAnimationLab: vi.fn(),
        setEventSelection: vi.fn(),
        setEventUsing,
        setBusy: vi.fn(),
        dispose: vi.fn(),
      },
    }, ITEM_ANIMATION_LAB_ID);

    phase.start();
    phase.handleEventItem(
      REPAIR_TOOLBOX_LAB_CHOICE_ID,
      REPAIR_TOOLBOX_LAB_INSTANCE_ID,
    );

    expect(playRepairToolboxAnimation).toHaveBeenCalledOnce();
    expect(setEventUsing).toHaveBeenCalledWith(REPAIR_TOOLBOX_LAB_INSTANCE_ID);
    expect(stageEvent).not.toHaveBeenCalled();
    expect(resolveEvent).not.toHaveBeenCalled();

    toolboxUse.resolve();
    await flushPromises();
    phase.dispose();
  });
});
