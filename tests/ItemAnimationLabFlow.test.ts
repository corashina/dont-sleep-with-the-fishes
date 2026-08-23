import { describe, expect, it, vi } from 'vitest';
import type { ItemInstance, ItemInstanceId } from '../src/game/ItemState';
import {
  ItemAnimationLabFlow,
  type ItemAnimationLabAudioPort,
  type ItemAnimationLabBundlePort,
  type ItemAnimationLabUiPort,
  type ItemAnimationLabWorldPort,
} from '../src/survival/ItemAnimationLabFlow';
import {
  CARLITOS_LAB_INSTANCE_ID,
  ITEM_ANIMATION_LAB_USES,
  REPAIR_TOOLBOX_LAB_INSTANCE_ID,
} from '../src/survival/ItemAnimationLab';
import { SurvivalSession } from '../src/survival/SurvivalSession';

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((settle) => { resolve = settle; });
  return { promise, resolve };
}

function createRig(savedItems: readonly ItemInstance[] = [
    { instanceId: 'anchor-1' as ItemInstanceId, type: 'anchor' },
    { instanceId: 'umbrella-1' as ItemInstanceId, type: 'umbrella' },
    { instanceId: 'map-1' as ItemInstanceId, type: 'map' },
    { instanceId: 'carlitos-1' as ItemInstanceId, type: 'carlitos' },
  ]) {
  const session = new SurvivalSession(savedItems, { seed: 23 });
  let lifecycleGeneration = 4;
  const world = {
    stageEvent: vi.fn(),
    playEventItemUse: vi.fn(async () => undefined),
    returnEventItemUse: vi.fn(async () => undefined),
    clearEvent: vi.fn(),
    cancelRepairToolboxAnimation: vi.fn(),
    playRepairToolboxAnimation: vi.fn(async (onAudioStart?: () => void) => {
      onAudioStart?.();
    }),
    setEventEligibleItems: vi.fn(),
    setEventSelectedItem: vi.fn(),
  } as unknown as ItemAnimationLabWorldPort;
  const ui = {
    beginEventPresentation: vi.fn(),
    clearEventPresentation: vi.fn(),
    showItemAnimationLab: vi.fn(),
    setEventSelection: vi.fn(),
    setEventUsing: vi.fn(),
  } as unknown as ItemAnimationLabUiPort;
  const audio = {
    clearEvent: vi.fn(),
    eventItem: vi.fn(),
    eventItemCue: vi.fn(),
    repairToolbox: vi.fn(),
  } as unknown as ItemAnimationLabAudioPort;
  const bundles: ItemAnimationLabBundlePort = {
    beginLoad: vi.fn(),
    activate: vi.fn(),
    cancelPendingActivation: vi.fn(),
    releaseActive: vi.fn(),
  };
  const setBusy = vi.fn();
  const setAutomaticWeather = vi.fn();
  const onInvariantError = vi.fn();
  const onFatalError = vi.fn();
  const flow = new ItemAnimationLabFlow({
    session,
    world,
    ui,
    audio,
    bundles,
    setBusy,
    setAutomaticWeather,
    captureLifecycleGeneration: () => lifecycleGeneration,
    isLifecycleGenerationCurrent: (generation) => generation === lifecycleGeneration,
    onInvariantError,
    onFatalError,
  });
  return {
    flow,
    session,
    world,
    ui,
    audio,
    bundles,
    setBusy,
    setAutomaticWeather,
    onInvariantError,
    onFatalError,
    restart: () => { lifecycleGeneration += 1; },
  };
}

describe('ItemAnimationLabFlow', () => {
  it('enters with usable routes, Carlitos, and repair tools', () => {
    const rig = createRig();
    const current = rig.session.snapshot();

    expect(rig.flow.eligibleItems(current)).toEqual(new Set([
      'anchor-1',
      'umbrella-1',
      'map-1',
      CARLITOS_LAB_INSTANCE_ID,
      REPAIR_TOOLBOX_LAB_INSTANCE_ID,
    ]));

    rig.flow.enter(current);

    expect(rig.ui.beginEventPresentation).toHaveBeenCalledOnce();
    expect(rig.ui.showItemAnimationLab).toHaveBeenCalledOnce();
    expect(rig.world.setEventSelectedItem).toHaveBeenCalledWith(null);
    expect(rig.world.setEventEligibleItems).toHaveBeenCalledWith(
      new Set([
        'anchor-1',
        'umbrella-1',
        'map-1',
        CARLITOS_LAB_INSTANCE_ID,
        REPAIR_TOOLBOX_LAB_INSTANCE_ID,
      ]),
    );
    expect(rig.setBusy).toHaveBeenLastCalledWith(false);
  });

  it('plays and restores an item without resolving a real event', async () => {
    const rig = createRig();
    const use = ITEM_ANIMATION_LAB_USES.anchor!;
    rig.flow.enter(rig.session.snapshot());

    await rig.flow.play('anchor-1' as ItemInstanceId);

    expect(rig.bundles.beginLoad).toHaveBeenCalledWith(use.eventId);
    expect(rig.bundles.activate).toHaveBeenCalledWith(use.eventId);
    expect(rig.world.stageEvent).toHaveBeenCalledWith(use.eventId);
    expect(rig.audio.eventItem).toHaveBeenCalledWith('anchor');
    expect(rig.world.playEventItemUse).toHaveBeenCalledOnce();
    expect(rig.world.returnEventItemUse).toHaveBeenCalledOnce();
    expect(rig.world.clearEvent).toHaveBeenCalledOnce();
    expect(rig.bundles.releaseActive).toHaveBeenCalledOnce();
    expect(rig.setAutomaticWeather).toHaveBeenNthCalledWith(1, use.eventId);
    expect(rig.setAutomaticWeather).toHaveBeenNthCalledWith(2, null);
    expect(rig.setBusy).toHaveBeenLastCalledWith(false);
  });

  it('plays repair tools with their audio callback', async () => {
    const rig = createRig();
    rig.flow.enter(rig.session.snapshot());

    await rig.flow.play(REPAIR_TOOLBOX_LAB_INSTANCE_ID);

    expect(rig.world.playRepairToolboxAnimation).toHaveBeenCalledOnce();
    expect(rig.audio.repairToolbox).toHaveBeenCalledOnce();
    expect(rig.world.stageEvent).not.toHaveBeenCalled();
    expect(rig.bundles.activate).not.toHaveBeenCalled();
    expect(rig.setBusy).toHaveBeenLastCalledWith(false);
  });

  it.each([
    ['fishingNet', 'fishingNet-1'],
    ['bucket', 'bucket-1'],
    ['medicalKit', 'medicalKit-1'],
    ['cannedFood', 'cannedFood-1'],
    ['baitTin', 'baitTin-1'],
    ['spyglass', 'spyglass-1'],
    ['swimRing', 'swimRing-1'],
    ['energyBar', 'energyBar-1'],
  ] as const)('starts the %s animation without an item handling sound', async (
    itemType,
    instanceId,
  ) => {
    const rig = createRig([{ instanceId, type: itemType }]);
    const use = ITEM_ANIMATION_LAB_USES[itemType]!;
    rig.flow.enter(rig.session.snapshot());

    await rig.flow.play(instanceId);

    expect(rig.audio.eventItem).not.toHaveBeenCalled();
    expect(rig.world.playEventItemUse).toHaveBeenCalledExactlyOnceWith(
      use.eventId,
      use.choiceId,
      instanceId,
    );
  });

  it('starts umbrella audio before its item animation', async () => {
    const rig = createRig([{ instanceId: 'umbrella-1', type: 'umbrella' }]);
    rig.flow.enter(rig.session.snapshot());

    await rig.flow.play('umbrella-1');

    expect(rig.audio.eventItem).toHaveBeenCalledExactlyOnceWith('umbrella');
  });

  it('makes stale item work inert after a restart', async () => {
    const rig = createRig();
    const animation = deferred();
    vi.mocked(rig.world.playEventItemUse).mockReturnValueOnce(animation.promise);
    rig.flow.enter(rig.session.snapshot());

    const play = rig.flow.play('anchor-1' as ItemInstanceId);
    const busyCalls = rig.setBusy.mock.calls.length;
    await Promise.resolve();
    rig.restart();
    animation.resolve();
    await play;

    expect(rig.world.returnEventItemUse).not.toHaveBeenCalled();
    expect(rig.world.clearEvent).not.toHaveBeenCalled();
    expect(rig.bundles.releaseActive).not.toHaveBeenCalled();
    expect(rig.setBusy).toHaveBeenCalledTimes(busyCalls);
  });

  it('makes an older local operation inert after lab entry resets', async () => {
    const rig = createRig();
    const animation = deferred();
    vi.mocked(rig.world.playEventItemUse).mockReturnValueOnce(animation.promise);
    rig.flow.enter(rig.session.snapshot());

    const play = rig.flow.play('anchor-1' as ItemInstanceId);
    await Promise.resolve();
    rig.flow.enter(rig.session.snapshot());
    animation.resolve();
    await play;

    expect(rig.world.returnEventItemUse).not.toHaveBeenCalled();
    expect(rig.world.clearEvent).not.toHaveBeenCalled();
    expect(rig.bundles.releaseActive).not.toHaveBeenCalled();
  });

  it('guards a late keyed audio cue with both generations', async () => {
    const rig = createRig();
    const animation = deferred();
    let cue: ((cueIndex: number) => void) | undefined;
    vi.mocked(rig.world.playEventItemUse).mockImplementationOnce((
      _eventId,
      _choiceId,
      _instanceId,
      onAction,
    ) => {
      cue = onAction;
      return animation.promise;
    });
    rig.flow.enter(rig.session.snapshot());

    const play = rig.flow.play('anchor-1' as ItemInstanceId);
    await Promise.resolve();
    rig.restart();
    cue?.(0);
    animation.resolve();
    await play;

    expect(rig.audio.eventItemCue).not.toHaveBeenCalled();
  });

  it('keeps an activation error primary while all cleanup continues', async () => {
    const rig = createRig();
    const primary = new Error('activation failed');
    vi.mocked(rig.bundles.activate).mockRejectedValueOnce(primary);
    vi.mocked(rig.world.clearEvent).mockImplementationOnce(() => {
      throw new Error('cleanup failed');
    });
    rig.flow.enter(rig.session.snapshot());

    await rig.flow.play('anchor-1' as ItemInstanceId);

    expect(rig.onFatalError).toHaveBeenCalledExactlyOnceWith(primary);
    expect(rig.bundles.releaseActive).toHaveBeenCalledOnce();
    expect(rig.setAutomaticWeather).toHaveBeenLastCalledWith(null);
    expect(rig.setBusy).toHaveBeenLastCalledWith(false);
  });

  it('cleans active external state before pending item work becomes inert', async () => {
    const rig = createRig();
    const animation = deferred();
    vi.mocked(rig.world.playEventItemUse).mockReturnValueOnce(animation.promise);
    rig.flow.enter(rig.session.snapshot());

    const play = rig.flow.play('anchor-1' as ItemInstanceId);
    rig.flow.dispose();

    expect(rig.audio.clearEvent).toHaveBeenCalledOnce();
    expect(rig.world.setEventSelectedItem).toHaveBeenLastCalledWith(null);
    expect(rig.world.setEventEligibleItems).toHaveBeenLastCalledWith(null);
    expect(rig.world.clearEvent).toHaveBeenCalledOnce();
    expect(rig.bundles.cancelPendingActivation).toHaveBeenCalledOnce();
    expect(rig.bundles.releaseActive).toHaveBeenCalledOnce();
    expect(rig.ui.clearEventPresentation).toHaveBeenCalledOnce();
    expect(rig.setAutomaticWeather).toHaveBeenLastCalledWith(null);
    expect(rig.setBusy).toHaveBeenLastCalledWith(false);

    rig.flow.dispose();
    expect(rig.audio.clearEvent).toHaveBeenCalledOnce();
    expect(rig.bundles.cancelPendingActivation).toHaveBeenCalledOnce();
    expect(rig.bundles.releaseActive).toHaveBeenCalledOnce();

    animation.resolve();
    await play;

    expect(rig.world.returnEventItemUse).not.toHaveBeenCalled();
    expect(rig.world.clearEvent).toHaveBeenCalledOnce();
  });

  it('continues disposal cleanup and reports only its first failure', async () => {
    const rig = createRig();
    const animation = deferred();
    const first = new Error('repair cancellation failed');
    vi.mocked(rig.world.playEventItemUse).mockReturnValueOnce(animation.promise);
    vi.mocked(rig.world.cancelRepairToolboxAnimation).mockImplementationOnce(() => {
      throw first;
    });
    vi.mocked(rig.audio.clearEvent).mockImplementationOnce(() => {
      throw new Error('audio cleanup failed');
    });
    vi.mocked(rig.world.clearEvent).mockImplementationOnce(() => {
      throw new Error('presentation cleanup failed');
    });
    vi.mocked(rig.bundles.releaseActive).mockImplementationOnce(() => {
      throw new Error('bundle cleanup failed');
    });
    rig.flow.enter(rig.session.snapshot());
    const play = rig.flow.play('anchor-1' as ItemInstanceId);

    rig.flow.dispose();

    expect(rig.onFatalError).toHaveBeenCalledExactlyOnceWith(first);
    expect(rig.world.setEventSelectedItem).toHaveBeenLastCalledWith(null);
    expect(rig.world.setEventEligibleItems).toHaveBeenLastCalledWith(null);
    expect(rig.ui.clearEventPresentation).toHaveBeenCalledOnce();
    expect(rig.setAutomaticWeather).toHaveBeenLastCalledWith(null);
    expect(rig.setBusy).toHaveBeenLastCalledWith(false);

    rig.flow.dispose();
    expect(rig.onFatalError).toHaveBeenCalledOnce();

    animation.resolve();
    await play;
  });

  it('cancels pending activation before releasing its active bundle', async () => {
    const rig = createRig();
    const activation = deferred();
    const cleanupOrder: string[] = [];
    vi.mocked(rig.bundles.activate).mockReturnValueOnce(activation.promise);
    vi.mocked(rig.bundles.cancelPendingActivation).mockImplementationOnce(() => {
      cleanupOrder.push('cancel-pending');
    });
    vi.mocked(rig.bundles.releaseActive).mockImplementationOnce(() => {
      cleanupOrder.push('release-active');
    });
    rig.flow.enter(rig.session.snapshot());

    const play = rig.flow.play('anchor-1' as ItemInstanceId);
    rig.flow.dispose();

    expect(cleanupOrder).toEqual(['cancel-pending', 'release-active']);
    activation.resolve();
    await play;
    expect(rig.world.stageEvent).not.toHaveBeenCalled();
  });

  it('cancels pending repair animation before late completion becomes inert', async () => {
    const rig = createRig();
    const animation = deferred();
    vi.mocked(rig.world.playRepairToolboxAnimation).mockReturnValueOnce(animation.promise);
    vi.mocked(rig.world.cancelRepairToolboxAnimation).mockImplementationOnce(() => {
      animation.resolve();
    });
    rig.flow.enter(rig.session.snapshot());

    const play = rig.flow.play(REPAIR_TOOLBOX_LAB_INSTANCE_ID);
    rig.flow.dispose();

    expect(rig.world.cancelRepairToolboxAnimation).toHaveBeenCalledOnce();
    expect(rig.world.setEventSelectedItem).toHaveBeenLastCalledWith(null);
    expect(rig.world.setEventEligibleItems).toHaveBeenLastCalledWith(null);
    await play;
    expect(rig.world.setEventEligibleItems).toHaveBeenLastCalledWith(null);
    expect(rig.setBusy).toHaveBeenLastCalledWith(false);
  });
});
