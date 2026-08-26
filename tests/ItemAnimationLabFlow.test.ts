import { describe, expect, it, vi } from 'vitest';
import type { ItemInstanceId } from '../src/game/ItemState';
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
      session: { snapshot: () => snapshot },
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
