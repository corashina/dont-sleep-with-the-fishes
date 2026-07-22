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
  toolId: null,
  action: 'eat',
  remainingUses: 1,
  x: 320,
  y: 240,
  visible: true,
  depleted: false,
};

const bait: ItemInstance = { instanceId: 'baitTin-1', type: 'baitTin' };
const scuba: ItemInstance = { instanceId: 'scubaSet-1', type: 'scubaSet' };
const scubaAnchor: BoatInteractionAnchor = {
  id: scuba.instanceId, itemType: scuba.type, toolId: null, action: 'dive', remainingUses: null,
  x: 220, y: 220, visible: true, depleted: false,
};
const rodAnchor: BoatInteractionAnchor = {
  id: 'fishing-tools', itemType: null, toolId: 'fishingRod', action: 'fish', remainingUses: null,
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

  it('rearms rejected fishing input, then makes an accepted catch non-actionable until return', async () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = new SurvivalUI(mount);
    const session = new SurvivalSession([bait, scuba], {
      seed: 1,
      random: sequenceRandom([0, 0]),
    });
    const play = vi.fn(() => Promise.resolve());
    let finishEnter!: () => void;
    let finishCast!: () => void;
    let finishReel!: () => void;
    let finishExit!: () => void;
    const enter = new Promise<void>((resolve) => { finishEnter = resolve; });
    const cast = new Promise<void>((resolve) => { finishCast = resolve; });
    const reel = new Promise<void>((resolve) => { finishReel = resolve; });
    const exit = new Promise<void>((resolve) => { finishExit = resolve; });
    const settlementRejection = {
      accepted: false,
      code: 'fishing-result-mismatch',
      message: 'That result does not belong to the active fishing attempt.',
      deltas: {},
      cue: 'none' as const,
    };
    const finishFishing = vi.fn()
      .mockImplementationOnce(() => settlementRejection)
      .mockImplementation((attemptId, result) => session.finishFishing(attemptId, result));
    const world = {
      syncInventory: () => undefined,
      projectInteractionAnchors: () => [scubaAnchor, rodAnchor],
      enterFishingView: vi.fn(() => enter),
      centeredFishingCast: vi.fn(() => ({ x: 4, z: -2 })),
      playFishingCast: vi.fn(() => cast),
      showFishingWaiting: vi.fn(),
      showFishingBite: vi.fn(),
      projectFishingBite: vi.fn(() => ({
        x: 360, y: 220, width: 56, height: 48, depth: 2, visible: true,
      })),
      playFishingReel: vi.fn(() => reel),
      exitFishingView: vi.fn(() => exit),
      clearFishingPresentation: vi.fn(),
      play,
      dispose: () => undefined,
    };
    const phase = SurvivalPhase.forTest({
      session: {
        snapshot: () => session.snapshot(),
        availableReason: (action, option) => session.availableReason(action, option),
        perform: (action, option) => session.perform(action, option),
        beginFishing: () => session.beginFishing(),
        finishFishing,
        requestDayEvent: () => ({
          accepted: false,
          code: 'day-event-used',
          message: 'No daytime event remains.',
          deltas: {},
          cue: 'none',
        }),
      },
      world,
      ui,
    });
    phase.start();

    const fish = mount.querySelector<HTMLButtonElement>('[data-anchor-id="fishing-tools"]')!;
    fish.focus();
    fish.click();
    const fishingFocusState = ui as unknown as {
      readonly latestCommandOrigin: HTMLElement | null;
      readonly fishingReturnTarget: HTMLElement | null;
    };
    expect(fishingFocusState.latestCommandOrigin).toBe(fish);
    expect(fishingFocusState.fishingReturnTarget).toBe(fish);
    expect(session.snapshot()).toMatchObject({ energy: 2, actedToday: true });
    expect(mount.querySelector<HTMLButtonElement>('[data-anchor-id="scubaSet-1"]')!.disabled).toBe(true);
    expect(play).not.toHaveBeenCalled();
    expect(world.enterFishingView).toHaveBeenCalledOnce();
    expect(mount.querySelector('[data-fishing]')?.classList).toContain('is-visible');

    finishEnter();
    await flushPromises();
    expect(mount.querySelector('[data-fishing-instruction]')?.textContent).toBe('CLICK THE WATER TO CAST');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(world.centeredFishingCast).toHaveBeenCalledOnce();
    finishCast();
    await flushPromises();
    phase.update(3, 3);
    expect(document.activeElement).toBe(mount.querySelector('[data-fishing-bite]'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(finishFishing).toHaveBeenCalledOnce();
    expect(session.snapshot()).toMatchObject({ food: 0, bait: 1 });
    expect(world.playFishingReel).not.toHaveBeenCalled();
    expect(mount.querySelector('[data-fishing-instruction]')?.textContent).toBe('BITE - REEL NOW');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(finishFishing).toHaveBeenCalledTimes(2);
    expect(session.snapshot()).toMatchObject({ food: 1, bait: 0 });
    expect(world.playFishingReel).toHaveBeenCalledOnce();
    const instruction = mount.querySelector<HTMLElement>('[data-fishing-instruction]')!;
    const biteButton = mount.querySelector<HTMLButtonElement>('[data-fishing-bite]')!;
    const fishingLive = mount.querySelector<HTMLElement>('[data-fishing-live]')!;
    const committed = session.snapshot();
    expect(biteButton.hidden).toBe(true);
    expect(document.activeElement).toBe(instruction);
    expect(instruction.textContent).toBe('CAUGHT COD');
    expect(fishingLive.getAttribute('aria-live')).toBe('polite');
    biteButton.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(finishFishing).toHaveBeenCalledTimes(2);
    expect(session.snapshot()).toEqual(committed);
    finishReel();
    await flushPromises();
    expect(instruction.textContent).toBe('CAUGHT COD');
    expect(world.exitFishingView).toHaveBeenCalledOnce();
    expect(fishingFocusState.fishingReturnTarget).toBe(fish);
    expect(mount.querySelector<HTMLButtonElement>('[data-action="endDay"]')!.disabled).toBe(true);
    finishExit();
    await flushPromises();

    expect(mount.querySelector('[data-fishing]')?.classList).not.toContain('is-visible');
    expect(mount.querySelector<HTMLButtonElement>('[data-action="endDay"]')!.disabled).toBe(false);
    expect(document.activeElement).toBe(
      mount.querySelector('[data-anchor-id="fishing-tools"]'),
    );
    phase.dispose();
  });

  it('makes an automatic miss non-actionable before its deferred animation resolves', async () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const ui = new SurvivalUI(mount);
    const session = new SurvivalSession([bait], {
      seed: 1,
      random: sequenceRandom([0, 0]),
    });
    let finishEnter!: () => void;
    let finishCast!: () => void;
    let finishMiss!: () => void;
    let finishExit!: () => void;
    const enter = new Promise<void>((resolve) => { finishEnter = resolve; });
    const cast = new Promise<void>((resolve) => { finishCast = resolve; });
    const miss = new Promise<void>((resolve) => { finishMiss = resolve; });
    const exit = new Promise<void>((resolve) => { finishExit = resolve; });
    const finishFishing = vi.fn((attemptId, result) => session.finishFishing(attemptId, result));
    const world = {
      syncInventory: () => undefined,
      projectInteractionAnchors: () => [rodAnchor],
      enterFishingView: vi.fn(() => enter),
      centeredFishingCast: vi.fn(() => ({ x: 4, z: -2 })),
      playFishingCast: vi.fn(() => cast),
      showFishingWaiting: vi.fn(),
      showFishingBite: vi.fn(),
      projectFishingBite: vi.fn(() => ({
        x: 360, y: 220, width: 56, height: 48, depth: 2, visible: true,
      })),
      playFishingReel: vi.fn(() => Promise.resolve()),
      playFishingMiss: vi.fn(() => miss),
      exitFishingView: vi.fn(() => exit),
      clearFishingPresentation: vi.fn(),
      play: vi.fn(() => Promise.resolve()),
      dispose: () => undefined,
    };
    const phase = SurvivalPhase.forTest({
      session: {
        snapshot: () => session.snapshot(),
        availableReason: (action, option) => session.availableReason(action, option),
        perform: (action, option) => session.perform(action, option),
        beginFishing: () => session.beginFishing(),
        finishFishing,
        requestDayEvent: () => ({
          accepted: false,
          code: 'day-event-used',
          message: 'No daytime event remains.',
          deltas: {},
          cue: 'none',
        }),
      },
      world,
      ui,
    });
    phase.start();

    const fish = mount.querySelector<HTMLButtonElement>('[data-anchor-id="fishing-tools"]')!;
    fish.focus();
    fish.click();
    finishEnter();
    await flushPromises();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    finishCast();
    await flushPromises();
    phase.update(3, 3);

    const instruction = mount.querySelector<HTMLElement>('[data-fishing-instruction]')!;
    const biteButton = mount.querySelector<HTMLButtonElement>('[data-fishing-bite]')!;
    const fishingLive = mount.querySelector<HTMLElement>('[data-fishing-live]')!;
    expect(document.activeElement).toBe(biteButton);
    phase.update(4.5, 1.5);

    expect(finishFishing).toHaveBeenCalledOnce();
    expect(world.playFishingMiss).toHaveBeenCalledOnce();
    expect(session.snapshot()).toMatchObject({ food: 0, bait: 1 });
    expect(biteButton.hidden).toBe(true);
    expect(document.activeElement).toBe(instruction);
    expect(instruction.textContent).toBe('IT GOT AWAY');
    expect(fishingLive.getAttribute('aria-live')).toBe('polite');
    const committed = session.snapshot();
    biteButton.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(finishFishing).toHaveBeenCalledOnce();
    expect(world.playFishingReel).not.toHaveBeenCalled();
    expect(session.snapshot()).toEqual(committed);

    finishMiss();
    await flushPromises();
    expect(world.exitFishingView).toHaveBeenCalledOnce();
    finishExit();
    await flushPromises();
    expect(mount.querySelector('[data-fishing]')?.classList).not.toContain('is-visible');
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
      expect(event.dataset.eventId).toBe('night-calm-fallback');
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
