// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ItemId, ItemInstanceId } from '../src/game/ItemState';
import type { DivePlayOptions } from '../src/survival/DivePresentation';
import { SurvivalPhase } from '../src/survival/SurvivalPhase';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { SurvivalUI } from '../src/ui/SurvivalUI';

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  document.body.innerHTML = '';
});

function lab(type: 'fishingNet' | 'scubaSet', broken = false) {
  const instanceId = `${type}-1` as ItemInstanceId;
  const use = type === 'fishingNet' ? 'net-fishing' : 'scuba-dive';
  const mount = document.createElement('main');
  document.body.append(mount);
  const ui = new SurvivalUI(mount);
  // Skip cover timers; test the cover sequence through the real UI API.
  const cover = vi.spyOn(ui, 'setSleepCovered').mockResolvedValue();
  const profile = vi.spyOn(ui, 'setSleepCoverProfile').mockResolvedValue();
  vi.spyOn(ui, 'holdDiveCovered').mockResolvedValue();
  const session = new SurvivalSession([{ instanceId, type }], {
    seed: 19, initial: { energy: 0 },
    initialConditions: { [instanceId]: broken ? 'broken' as const : 'usable' as const },
  });
  const world = {
    projectInteractionAnchors: () => [{
      id: instanceId, itemType: type as ItemId, toolId: null,
      action: type === 'fishingNet' ? 'netFish' as const : 'dive' as const,
      remainingUses: null, backingInstanceId: instanceId,
      x: 90, y: 180, visible: true, depleted: false,
    }],
    enterFishingView: vi.fn(async (): Promise<void> => undefined),
    centeredFishingCast: () => ({ x: 0, z: -6.4 }),
    playFishingNetHaul: vi.fn(async () => undefined),
    exitFishingView: vi.fn(async () => undefined),
    clearFishingPresentation: vi.fn(),
    playDive: vi.fn(async (_id: ItemInstanceId, options: DivePlayOptions) => { options.onWaterImpact(); }),
    clearDivePresentation: vi.fn(),
    setEventSelectedItem: vi.fn(),
    setEventEligibleItems: vi.fn(),
  };
  const onInvariantError = vi.fn();
  const phase = SurvivalPhase.forTest({ session, ui, world, onInvariantError }, 'item-animation-lab');
  cleanups.push(() => phase.dispose());
  phase.start();
  const click = (selector: string) => {
    const button = mount.querySelector<HTMLButtonElement>(selector)!;
    expect(button).not.toBeNull();
    button.click();
  };
  const open = () => click(`[data-anchor-id="${instanceId}"]`);
  const play = () => click(`[data-event-choice="${use}"]`);
  return { mount, ui, session, world, phase, cover, profile, onInvariantError, open, play, click, use, instanceId };
}

describe('lab water actions', () => {
  it.each(['fishingNet', 'scubaSet'] as const)('repeats %s from its real menu at zero energy', async (type) => {
    const rig = lab(type);
    const before = rig.session.snapshot();
    for (let run = 1; run <= 2; run += 1) {
      rig.open();
      rig.play();
      await vi.waitFor(() => expect(rig.world.setEventSelectedItem).toHaveBeenLastCalledWith(null));
      if (type === 'fishingNet') {
        expect(rig.world.enterFishingView).toHaveBeenCalledWith('net');
        expect(rig.world.playFishingNetHaul).toHaveBeenCalledTimes(run);
        expect(rig.world.playFishingNetHaul).toHaveBeenLastCalledWith([
          expect.objectContaining({ id: 'cod' }), expect.objectContaining({ id: 'salmon' }),
        ], { x: 0, z: -6.4 });
        expect(rig.world.exitFishingView).toHaveBeenCalledTimes(run);
      } else {
        expect(rig.world.playDive).toHaveBeenCalledTimes(run);
        expect(rig.world.playDive).toHaveBeenLastCalledWith(rig.instanceId, expect.objectContaining({ onWaterImpact: expect.any(Function) }));
        expect(rig.cover).toHaveBeenCalledWith(true);
        expect(rig.cover).toHaveBeenLastCalledWith(false);
        expect(rig.profile).toHaveBeenLastCalledWith('solid');
      }
      expect(rig.session.snapshot()).toEqual(before);
      expect(rig.onInvariantError).not.toHaveBeenCalled();
    }
  });

  it.each(['fishingNet', 'scubaSet'] as const)('disables broken %s and allows its preview after Fix', async (type) => {
    const rig = lab(type, true);
    rig.open();
    expect(rig.mount.querySelector(`[data-event-choice="${rig.use}"]`)?.getAttribute('aria-disabled')).toBe('true');
    rig.play();
    expect(rig.world.enterFishingView).not.toHaveBeenCalled();
    expect(rig.world.playDive).not.toHaveBeenCalled();
    rig.click('[data-event-choice="fix"]');
    rig.play();
    await vi.waitFor(() => expect(rig.world.setEventSelectedItem).toHaveBeenLastCalledWith(null));
    const animation = type === 'fishingNet' ? rig.world.playFishingNetHaul : rig.world.playDive;
    expect(animation).toHaveBeenCalledOnce();
  });

  it.each(['fishingNet', 'scubaSet'] as const)('cleans up a failed %s preview and permits another try', async (type) => {
    const rig = lab(type);
    const animation = type === 'fishingNet' ? rig.world.playFishingNetHaul : rig.world.playDive;
    animation.mockRejectedValueOnce(new Error('Preview failed'));
    rig.open();
    rig.play();
    await vi.waitFor(() => expect(rig.onInvariantError).toHaveBeenCalledOnce());
    const clear = type === 'fishingNet' ? rig.world.clearFishingPresentation : rig.world.clearDivePresentation;
    expect(clear).toHaveBeenCalled();
    rig.open();
    rig.play();
    await vi.waitFor(() => expect(animation).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(rig.world.setEventSelectedItem).toHaveBeenLastCalledWith(null));
  });

  it.each(['fishingNet', 'scubaSet'] as const)('ignores late completion after disposing the %s preview', async (type) => {
    const rig = lab(type);
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    if (type === 'fishingNet') rig.world.enterFishingView.mockReturnValueOnce(pending);
    else rig.world.playDive.mockReturnValueOnce(pending);
    rig.open();
    rig.play();
    rig.phase.dispose();
    rig.cover.mockClear();
    rig.world.setEventSelectedItem.mockClear();
    finish();
    await pending;
    await Promise.resolve();
    await Promise.resolve();
    expect(rig.world.playFishingNetHaul).not.toHaveBeenCalled();
    expect(rig.cover).not.toHaveBeenCalled();
    expect(rig.world.setEventSelectedItem).not.toHaveBeenCalled();
  });
});
