import { describe,expect,it,vi } from 'vitest';
import { type ItemId,type ItemInstanceId } from '../src/game/ItemState';
import { ItemAnimationLabFlow } from '../src/survival/ItemAnimationLabFlow';
import { SurvivalSession } from '../src/survival/SurvivalSession';

function waterWorld() {
  return {
    enterFishingView: vi.fn(async () => undefined),
    centeredFishingCast: vi.fn(() => ({ x: 0, z: -6.4 })),
    playFishingNetHaul: vi.fn(async () => undefined),
    exitFishingView: vi.fn(async () => undefined),
    clearFishingPresentation: vi.fn(),
    playDive: vi.fn(async (_id: ItemInstanceId, options: { onWaterImpact: () => void }) => { options.onWaterImpact(); }),
    clearDivePresentation: vi.fn(),
  };
}

function waterUi() {
  return {
    setSleepCoverProfile: vi.fn(async () => undefined),
    setSleepCovered: vi.fn(async () => undefined),
    holdDiveCovered: vi.fn(async () => undefined),
  };
}

function waterAudio() {
  return { fishingNet: vi.fn(), fishingNetSplash: vi.fn(), beginDive: vi.fn(), finishDive: vi.fn(), cancelDive: vi.fn() };
}

function conditionLab(type: ItemId = 'bucket', condition: 'usable' | 'broken' | 'lost' = 'usable') {
  const instanceId = `${type}-1` as ItemInstanceId;
  const session = new SurvivalSession([{ instanceId, type }], {
    seed: 19,
    initialConditions: { [instanceId]: condition },
  });
  const world = {
    ...waterWorld(),
    stageEvent: vi.fn(),
    revealEvent: vi.fn(() => Promise.resolve()),
    playEventItemUse: vi.fn(() => Promise.resolve()),
    returnEventItemUse: vi.fn(() => Promise.resolve()),
    clearEvent: vi.fn(),
    cancelRepairToolboxAnimation: vi.fn(),
    playRepairToolboxAnimation: vi.fn(() => Promise.resolve()),
    playCarlitosAction: vi.fn(() => Promise.resolve()),
    setEventEligibleItems: vi.fn(),
    setEventSelectedItem: vi.fn(),
    setItemAnimationLabCameraLook: vi.fn(),
  };
  const ui = {
    ...waterUi(),
    beginEventPresentation: vi.fn(),
    clearEventPresentation: vi.fn(),
    showItemAnimationLab: vi.fn(),
    showItemAnimationLabChoices: vi.fn(),
    hideItemAnimationLabChoices: vi.fn(),
    openRepairOptions: vi.fn(),
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
      ...waterAudio(),
      clearEvent: vi.fn(), clearRadioSignal: vi.fn(), eventItem: vi.fn(),
      eventItemCue: vi.fn(), repairToolbox: vi.fn(), meowCarlitos: vi.fn(),
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

describe('Item Animation Lab quantities', () => {
  it.each([
    ['cannedFood', 'food', 'bait'],
    ['baitTin', 'bait', 'food'],
  ] as const)('changes %s quantity and keeps animations available', async (type, resource, otherResource) => {
    const { flow, session, instanceId, ui, world, renderSnapshot } = conditionLab(type);
    const before = session.snapshot();
    await flow.play(instanceId);
    flow.choose('quantity-less');
    expect(session.snapshot()).toBe(before);
    expect(ui.showItemAnimationLabChoices.mock.lastCall![0]).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'quantity-less', unavailableReason: 'Keep at least one item.' }),
    ]));

    flow.choose('quantity-more');
    flow.choose('quantity-more');
    expect(session.snapshot()[resource]).toBe(3);
    expect(session.snapshot()[otherResource]).toBe(before[otherResource]);
    expect(session.snapshot().inventory).toEqual(before.inventory);
    expect(renderSnapshot).toHaveBeenCalledTimes(2);
    expect(world.playEventItemUse).not.toHaveBeenCalled();
    expect(ui.showItemAnimationLabChoices.mock.lastCall![0]).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'quantity-less', label: 'Quantity − (3 → 2)', unavailableReason: null }),
    ]));

    flow.choose('quantity-less');
    expect(session.snapshot()[resource]).toBe(2);
    flow.choose('throw-target');
    expect(world.playEventItemUse).toHaveBeenCalledWith(
      type === 'cannedFood' ? 'death-stare' : 'swarm-of-sharks', resource, instanceId,
    );
    flow.choose('quantity-more');
    expect(session.snapshot()[resource]).toBe(2);
  });
});

describe('Item Animation Lab conditions', () => {

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
});
