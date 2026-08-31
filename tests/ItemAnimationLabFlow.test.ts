import { describe, expect, it, vi } from 'vitest';
import { ITEM_DEFINITIONS, ITEM_IDS, type ItemId, type ItemInstanceId } from '../src/game/ItemState';
import {
  FISHING_ROD_LAB_CHOICE_ID,
  FISHING_ROD_LAB_INSTANCE_ID,
  ITEM_ANIMATION_LAB_USES,
} from '../src/survival/ItemAnimationLab';
import { ItemAnimationLabFlow } from '../src/survival/ItemAnimationLabFlow';
import { SurvivalSession } from '../src/survival/SurvivalSession';

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = (): void => undefined;
  const promise = new Promise<void>((settle) => { resolve = settle; });
  return { promise, resolve };
}

function conditionLab(type: ItemId = 'bucket', condition: 'usable' | 'broken' | 'lost' = 'usable') {
  const instanceId = `${type}-1` as ItemInstanceId;
  const session = new SurvivalSession([{ instanceId, type }], {
    seed: 19,
    initialConditions: { [instanceId]: condition },
  });
  const world = {
    stageEvent: vi.fn(),
    revealEvent: vi.fn(() => Promise.resolve()),
    playEventItemUse: vi.fn(() => Promise.resolve()),
    returnEventItemUse: vi.fn(() => Promise.resolve()),
    clearEvent: vi.fn(),
    cancelRepairToolboxAnimation: vi.fn(),
    playRepairToolboxAnimation: vi.fn(() => Promise.resolve()),
    setEventEligibleItems: vi.fn(),
    setEventSelectedItem: vi.fn(),
    setItemAnimationLabCameraLook: vi.fn(),
  };
  const ui = {
    beginEventPresentation: vi.fn(),
    clearEventPresentation: vi.fn(),
    showItemAnimationLab: vi.fn(),
    showItemAnimationLabChoices: vi.fn(),
    hideItemAnimationLabChoices: vi.fn(),
    setEventSelection: vi.fn(),
    setEventUsing: vi.fn(),
  };
  const renderSnapshot = vi.fn(() => session.snapshot());
  const lifecycleCurrent = vi.fn(() => true);
  const flow = new ItemAnimationLabFlow({
    session,
    world,
    ui,
    renderSnapshot,
    audio: {
      clearEvent: vi.fn(), clearRadioSignal: vi.fn(), eventItem: vi.fn(),
      eventItemCue: vi.fn(), repairToolbox: vi.fn(),
    },
    bundles: {
      beginLoad: vi.fn(), activate: vi.fn(),
      cancelPendingActivation: vi.fn(), releaseActive: vi.fn(),
    },
    setBusy: vi.fn(),
    playFishing: vi.fn(),
    setAutomaticWeather: vi.fn(),
    captureLifecycleGeneration: () => 1,
    isLifecycleGenerationCurrent: lifecycleCurrent,
    onInvariantError: vi.fn(),
    onFatalError: vi.fn(),
  });
  flow.enter(session.snapshot());
  return { flow, session, instanceId, world, ui, renderSnapshot, lifecycleCurrent };
}

describe('Item Animation Lab conditions', () => {
  it('breaks Flashlight, blocks each animation, and fixes it without resources', async () => {
    const { flow, session, instanceId, ui, world, renderSnapshot } = conditionLab('flashlight');
    const before = session.snapshot();
    await flow.play(instanceId);
    flow.choose('break');
    expect(session.snapshot().inventory[instanceId]?.condition).toBe('broken');
    expect(renderSnapshot).toHaveReturnedWith(session.snapshot());
    expect(flow.eligibleItems(session.snapshot()).has(instanceId)).toBe(true);
    for (const use of ITEM_ANIMATION_LAB_USES.flashlight!) {
      expect(ui.showItemAnimationLabChoices).toHaveBeenLastCalledWith(expect.arrayContaining([
        { id: use.id, label: use.label, unavailableReason: 'Item is broken.' },
      ]));
      flow.choose(use.id);
    }
    expect(world.playEventItemUse).not.toHaveBeenCalled();
    await flow.play(instanceId);
    flow.choose('fix');
    expect(session.snapshot()).toEqual(before);
    expect(renderSnapshot).toHaveBeenCalledTimes(2);
    flow.choose(ITEM_ANIMATION_LAB_USES.flashlight![0]!.id);
    expect(world.playEventItemUse).toHaveBeenCalledOnce();
  });

  it('breaks and fixes the selected item without using resources', async () => {
    const { flow, session, instanceId, ui, world, renderSnapshot } = conditionLab();
    const before = session.snapshot();
    await flow.play(instanceId);
    expect(ui.showItemAnimationLabChoices).toHaveBeenLastCalledWith(expect.arrayContaining([
      { id: 'break', label: 'Break', unavailableReason: null },
      { id: 'fix', label: 'Fix', unavailableReason: 'Item is not broken.' },
    ]));

    flow.choose('break');

    expect(session.snapshot().inventory[instanceId]?.condition).toBe('broken');
    expect(renderSnapshot).toHaveReturnedWith(session.snapshot());
    expect(flow.eligibleItems(session.snapshot()).has(instanceId)).toBe(true);
    expect(ui.showItemAnimationLabChoices).toHaveBeenLastCalledWith(expect.arrayContaining([
      { id: 'bucket-scoop', label: 'Scoop from water', unavailableReason: 'Item is broken.' },
      { id: 'break', label: 'Break', unavailableReason: 'Item is already broken.' },
      { id: 'fix', label: 'Fix', unavailableReason: null },
    ]));
    flow.choose('bucket-scoop');
    flow.choose('break');
    expect(world.playEventItemUse).not.toHaveBeenCalled();
    expect(renderSnapshot).toHaveBeenCalledTimes(1);

    await flow.play(instanceId);
    flow.choose('fix');

    expect(session.snapshot().inventory[instanceId]?.condition).toBe('usable');
    expect(session.snapshot()).toEqual(before);
    expect(renderSnapshot).toHaveBeenCalledTimes(2);
    flow.choose('fix');
    expect(renderSnapshot).toHaveBeenCalledTimes(2);
    flow.choose('bucket-scoop');
    expect(world.playEventItemUse).toHaveBeenCalledOnce();
  });

  it.each(ITEM_IDS.filter((id) => ITEM_DEFINITIONS[id].breakable))(
    'offers condition controls for %s, even without multiple animations', async (type) => {
      const { flow, instanceId, ui, world } = conditionLab(type);
      await flow.play(instanceId);
      expect(ui.showItemAnimationLabChoices).toHaveBeenLastCalledWith(expect.arrayContaining([
        { id: 'break', label: 'Break', unavailableReason: null },
      ]));
      expect(world.playEventItemUse).not.toHaveBeenCalled();
    },
  );

  it('lets an initially broken item open the popup and be fixed', async () => {
    const { flow, session, instanceId, ui } = conditionLab('bucket', 'broken');
    await flow.play(instanceId);
    expect(ui.showItemAnimationLabChoices).toHaveBeenCalledOnce();
    flow.choose('fix');
    expect(session.snapshot().inventory[instanceId]?.condition).toBe('usable');
  });

  it('does not offer condition controls for unbreakable items', async () => {
    const { flow, session, instanceId, ui, renderSnapshot } = conditionLab('radio');
    const before = session.snapshot();
    await flow.play(instanceId);
    expect(ui.showItemAnimationLabChoices.mock.lastCall?.[0]).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'break' })]),
    );
    flow.choose('break');
    flow.choose('fix');
    expect(session.snapshot()).toBe(before);
    expect(renderSnapshot).not.toHaveBeenCalled();
  });

  it('does not restore missing or lost items', async () => {
    const { flow, session, instanceId, ui } = conditionLab('bucket', 'lost');
    const before = session.snapshot();
    await flow.play(instanceId);
    flow.choose('fix');
    expect(ui.showItemAnimationLabChoices).not.toHaveBeenCalled();
    expect(session.setItemConditionForLab(instanceId, 'usable')).toBe(false);
    expect(session.setItemConditionForLab('bucket-missing' as ItemInstanceId, 'broken')).toBe(false);
    expect(session.snapshot()).toBe(before);
  });

  it('changes only the selected instance', () => {
    const session = new SurvivalSession([
      { instanceId: 'bucket-1', type: 'bucket' },
      { instanceId: 'bucket-2', type: 'bucket' },
    ], { seed: 19 });
    expect(session.setItemConditionForLab('bucket-2', 'broken')).toBe(true);
    expect(session.snapshot().inventory['bucket-1']?.condition).toBe('usable');
    expect(session.snapshot().inventory['bucket-2']?.condition).toBe('broken');
  });

  it('does not change items during fishing', () => {
    const { session, instanceId } = conditionLab();
    expect(session.beginFishing().accepted).toBe(true);
    const before = session.snapshot();
    expect(session.setItemConditionForLab(instanceId, 'broken')).toBe(false);
    expect(session.snapshot()).toBe(before);
  });

  it('rejects direct condition changes for unbreakable items', () => {
    const { session, instanceId } = conditionLab('radio');
    const before = session.snapshot();
    expect(session.setItemConditionForLab(instanceId, 'broken')).toBe(false);
    expect(session.setItemConditionForLab(instanceId, 'usable')).toBe(false);
    expect(session.snapshot()).toBe(before);
  });

  it.each(['disposed', 'stale', 'animating'] as const)(
    'ignores condition choices while %s', async (state) => {
      const { flow, session, instanceId, lifecycleCurrent, world } = conditionLab();
      await flow.play(instanceId);
      if (state === 'disposed') flow.dispose();
      if (state === 'stale') lifecycleCurrent.mockReturnValue(false);
      if (state === 'animating') {
        world.playEventItemUse.mockReturnValue(deferred().promise);
        flow.choose('bucket-scoop');
      }
      flow.choose('break');
      expect(session.snapshot().inventory[instanceId]?.condition).toBe('usable');
    },
  );
});

describe('ItemAnimationLabFlow', () => {
  it('offers signal reception and trade handover for the Radio', () => {
    expect(ITEM_ANIMATION_LAB_USES.radio?.map(({ id }) => id)).toEqual([
      'radio-signal-receive',
      'trade-handover',
    ]);
  });

  it('offers both trade handovers for the Swim Ring', () => {
    expect(ITEM_ANIMATION_LAB_USES.swimRing?.map(({ id, eventId }) => ({
      id,
      eventId,
    }))).toEqual([
      { id: 'throw-target', eventId: 'tornado' },
      { id: 'trade-handover', eventId: 'night-trader' },
      { id: 'handyman-handover', eventId: 'handyman' },
    ]);
  });

  it('does not offer cover supplies for the Map', () => {
    expect(ITEM_ANIMATION_LAB_USES.map?.map(({ id }) => id))
      .not.toContain('cover-supplies');
  });

  it('does not offer cover supplies for the Umbrella', () => {
    expect(ITEM_ANIMATION_LAB_USES.umbrella?.map(({ id }) => id))
      .not.toContain('cover-supplies');
  });

  it('does not offer Lift bucket', () => {
    expect(ITEM_ANIMATION_LAB_USES.bucket?.map(({ id }) => id))
      .not.toContain('base');
  });

  it('reveals the Handyman before a trade handover', async () => {
    const instanceId = 'radio-1' as ItemInstanceId;
    const snapshot = new SurvivalSession([{ instanceId, type: 'radio' }], {
      seed: 19,
    }).snapshot();
    const reveal = deferred();
    const returned = deferred();
    const stageEvent = vi.fn();
    const revealEvent = vi.fn(() => reveal.promise);
    const playEventItemUse = vi.fn(() => Promise.resolve());
    const clearRadioSignal = vi.fn();
    const playFishing = vi.fn(() => Promise.resolve());
    const flow = new ItemAnimationLabFlow({
      session: { snapshot: () => snapshot, setItemConditionForLab: vi.fn(() => false) },
      renderSnapshot: () => snapshot,
      world: {
        stageEvent,
        revealEvent,
        playEventItemUse,
        returnEventItemUse: vi.fn(() => returned.promise),
        clearEvent: vi.fn(),
        cancelRepairToolboxAnimation: vi.fn(),
        playRepairToolboxAnimation: vi.fn(() => Promise.resolve()),
        setEventEligibleItems: vi.fn(),
        setEventSelectedItem: vi.fn(),
        setItemAnimationLabCameraLook: vi.fn(),
      },
      ui: {
        beginEventPresentation: vi.fn(),
        clearEventPresentation: vi.fn(),
        showItemAnimationLab: vi.fn(),
        showItemAnimationLabChoices: vi.fn(),
        hideItemAnimationLabChoices: vi.fn(),
        setEventSelection: vi.fn(),
        setEventUsing: vi.fn(),
      },
      audio: {
        clearEvent: vi.fn(),
        clearRadioSignal,
        eventItem: vi.fn(),
        eventItemCue: vi.fn(),
        repairToolbox: vi.fn(),
      },
      bundles: {
        beginLoad: vi.fn(),
        activate: vi.fn(),
        cancelPendingActivation: vi.fn(),
        releaseActive: vi.fn(),
      },
      setBusy: vi.fn(),
      playFishing,
      setAutomaticWeather: vi.fn(),
      captureLifecycleGeneration: () => 1,
      isLifecycleGenerationCurrent: () => true,
      onInvariantError: vi.fn(),
      onFatalError: vi.fn(),
    });

    flow.enter(snapshot);
    await flow.play(FISHING_ROD_LAB_INSTANCE_ID, FISHING_ROD_LAB_CHOICE_ID);
    expect(playFishing).toHaveBeenCalledOnce();

    await flow.play(instanceId, ITEM_ANIMATION_LAB_USES.radio![0]!.id);
    flow.choose('trade-handover');

    expect(stageEvent).toHaveBeenCalledExactlyOnceWith('handyman');
    expect(revealEvent).toHaveBeenCalledExactlyOnceWith('handyman');
    expect(playEventItemUse).not.toHaveBeenCalled();

    reveal.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(playEventItemUse).toHaveBeenCalledExactlyOnceWith(
      'handyman',
      'radio',
      instanceId,
      expect.any(Function),
      true,
    );
    expect(clearRadioSignal).toHaveBeenCalledOnce();

    returned.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(clearRadioSignal).toHaveBeenCalledTimes(2);
  });
});
