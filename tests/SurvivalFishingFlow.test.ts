// Importance: 10/10. Protects fishing workflow order, state, and lifecycle guards.
import { describe, expect, it, vi } from 'vitest';
import { FISHING_CATCHES } from '../src/survival/fishingCatalog';
import type { FishingCastPoint } from '../src/survival/FishingSession';
import {
  formatFishingResult,
  SurvivalFishingFlow,
  type FishingAudioPort,
  type FishingUiPort,
  type FishingWorldPort,
} from '../src/survival/SurvivalFishingFlow';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import type { FishingResultView, FishingUiState } from '../src/ui/SurvivalFishingView';
import type { ProjectedBoatBounds } from '../src/survival/BoatInteraction';
import { sequenceRandom } from './helpers/random';

interface Deferred {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
}

function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((settle) => { resolve = settle; });
  return { promise, resolve };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

interface FishingRigOptions {
  readonly energy?: number;
  readonly withBait?: boolean;
  readonly day?: number;
  readonly catchRoll?: number;
}

function createRig(options: FishingRigOptions = {}) {
  const calls: string[] = [];
  const realSession = new SurvivalSession(
    options.withBait ? [{ instanceId: 'baitTin-1', type: 'baitTin' }] : [],
    {
      seed: 1,
      initial: { day: options.day ?? 1, energy: options.energy ?? 3 },
      random: sequenceRandom([0, options.catchRoll ?? 0]),
    },
  );
  const session = {
    snapshot: vi.fn(() => realSession.snapshot()),
    beginFishing: vi.fn(() => {
      calls.push('beginFishing');
      return realSession.beginFishing();
    }),
    cancelFishing: vi.fn((attemptId: string) => {
      calls.push('cancelFishing');
      return realSession.cancelFishing(attemptId);
    }),
    finishFishing: vi.fn((...args: Parameters<SurvivalSession['finishFishing']>) => {
      calls.push('finishFishing');
      return realSession.finishFishing(...args);
    }),
  };
  const animations = {
    enter: [] as Deferred[],
    cast: [] as Deferred[],
    reel: [] as Deferred[],
    miss: [] as Deferred[],
    exit: [] as Deferred[],
  };
  const startAnimation = (kind: keyof typeof animations): Promise<void> => {
    const animation = deferred();
    animations[kind].push(animation);
    calls.push(`world:${kind}`);
    return animation.promise;
  };
  const castPoint = Object.freeze({ x: 4, z: -2 });
  const biteTarget: ProjectedBoatBounds = Object.freeze({
    x: 320, y: 180, width: 64, height: 48, depth: 2, visible: true,
  });
  const catchTarget: ProjectedBoatBounds = Object.freeze({
    x: 410, y: 290, width: 96, height: 54, depth: 1.8, visible: true,
  });
  const world: FishingWorldPort = {
    enterFishingView: vi.fn(() => startAnimation('enter')),
    castFishingAtScreenPoint: vi.fn((): FishingCastPoint | null => castPoint),
    centeredFishingCast: vi.fn(() => castPoint),
    playFishingCast: vi.fn(() => startAnimation('cast')),
    showFishingWaiting: vi.fn(() => calls.push('world:waiting')),
    showFishingBite: vi.fn(() => calls.push('world:bite')),
    projectFishingBite: vi.fn(() => biteTarget),
    playFishingReel: vi.fn(() => startAnimation('reel')),
    projectFishingCatch: vi.fn(() => catchTarget),
    playFishingMiss: vi.fn(() => startAnimation('miss')),
    exitFishingView: vi.fn(() => startAnimation('exit')),
    clearFishingPresentation: vi.fn(() => calls.push('world:clear')),
  };
  const ui: FishingUiPort = {
    setFishingState: vi.fn((state: FishingUiState) => {
      calls.push(`ui:${state.mode}:${state.message}`);
    }),
    showFishingResult: vi.fn((view: FishingResultView) => {
      calls.push(`ui:result:${view.title}`);
    }),
    hideFishingResult: vi.fn(() => calls.push('ui:hide-result')),
    updateFishingBiteTarget: vi.fn(() => calls.push('ui:bite-target')),
    setFishingViewExitVisible: vi.fn((visible: boolean) => {
      calls.push(`ui:exit:${visible}`);
    }),
    setFishingFade: vi.fn(async () => undefined),
    restoreCommandFocus: vi.fn(() => calls.push('ui:focus')),
    showFeedback: vi.fn(() => calls.push('ui:feedback')),
  };
  const audio: FishingAudioPort = {
    deny: vi.fn(() => calls.push('audio:deny')),
    fishingCast: vi.fn(() => calls.push('audio:cast')),
    fishingBite: vi.fn(() => calls.push('audio:bite')),
    fishingReel: vi.fn(() => calls.push('audio:reel')),
    fishingResult: vi.fn(() => calls.push('audio:result')),
  };
  let paused = false;
  let hidden = false;
  let lifecycleActive = true;
  let lifecycleGeneration = 0;
  const renderSnapshot = vi.fn(() => {
    const current = realSession.snapshot();
    calls.push(`render:${current.energy}:${current.food}:${current.bait}`);
    return current;
  });
  const setBusy = vi.fn((busy: boolean) => calls.push(`busy:${busy}`));
  const flow = new SurvivalFishingFlow({
    session,
    world,
    ui,
    audio,
    renderSnapshot,
    setBusy,
    isPaused: () => paused,
    isHidden: () => hidden,
    isLifecycleActive: () => lifecycleActive,
    captureLifecycleGeneration: () => lifecycleGeneration,
    advanceLifecycleGeneration: () => ++lifecycleGeneration,
    isLifecycleGenerationCurrent: (generation) => (
      lifecycleActive && generation === lifecycleGeneration
    ),
  });
  return {
    flow,
    session,
    realSession,
    world,
    ui,
    audio,
    calls,
    animations,
    castPoint,
    biteTarget,
    catchTarget,
    renderSnapshot,
    setBusy,
    setPaused: (value: boolean) => { paused = value; },
    setHidden: (value: boolean) => { hidden = value; },
    restart: () => { lifecycleActive = false; },
  };
}

async function enter(rig: ReturnType<typeof createRig>): Promise<void> {
  const pending = rig.flow.begin();
  expect(rig.animations.enter).toHaveLength(1);
  rig.animations.enter[0]!.resolve();
  await pending;
}

async function cast(rig: ReturnType<typeof createRig>): Promise<void> {
  expect(rig.flow.cast(640, 360, 1280, 720)).toBe(true);
  expect(rig.animations.cast).toHaveLength(1);
  rig.animations.cast[0]!.resolve();
  await flushPromises();
}

describe('formatFishingResult', () => {
  it.each([
    ['bait', 'BAIT', 'BAIT +1'],
    ['wetDuctTape', 'WET DUCT TAPE', 'DUCT TAPE RECOVERED'],
    ['brokenCompass', 'BROKEN COMPASS', 'BROKEN — REPAIR WITH DUCT TAPE'],
    ['tornFishingNet', 'TORN FISHING NET', 'BROKEN — REPAIR WITH DUCT TAPE'],
    ['energyBar', 'ENERGY BAR', 'ENERGY BAR RECOVERED'],
  ] as const)('formats the %s utility result', (catchId, title, detail) => {
    expect(formatFishingResult({
      kind: 'catch',
      catch: FISHING_CATCHES.find(({ id }) => id === catchId)!,
    }, {
      accepted: true,
      code: 'utility-caught',
      message: 'Recovered utility.',
      deltas: catchId === 'bait' ? { bait: 1 } : {},
      cue: 'none',
    })).toMatchObject({ caption: 'UTILITY SALVAGE', title, detail });
  });

  it.each([
    ['cod', {}, { caption: 'SMALL CATCH', title: 'COD', detail: '+1 FOOD' }],
    ['tuna', { bait: -1 }, { caption: 'LARGE CATCH', title: 'TUNA', detail: '+2 FOOD - 1 BAIT USED' }],
    ['plasticBottle', {}, { caption: 'DRIFTING JUNK', title: 'PLASTIC BOTTLE', detail: 'NO FOOD' }],
  ] as const)('formats the %s catch', (catchId, deltas, expected) => {
    expect(formatFishingResult({
      kind: 'catch',
      catch: FISHING_CATCHES.find(({ id }) => id === catchId)!,
    }, {
      accepted: true,
      code: 'fishing-settled',
      message: 'Fishing settled.',
      deltas,
      cue: 'none',
    })).toMatchObject(expected);
  });
});

describe('SurvivalFishingFlow', () => {
  it('rejects a start without entering the view or setting busy', async () => {
    const rig = createRig({ energy: 0 });

    await rig.flow.begin();

    expect(rig.audio.deny).toHaveBeenCalledOnce();
    expect(rig.ui.showFeedback).toHaveBeenCalledOnce();
    expect(rig.world.enterFishingView).not.toHaveBeenCalled();
    expect(rig.setBusy).not.toHaveBeenCalled();
    expect(rig.flow.hasActiveAttempt()).toBe(false);
  });

  it('runs cast, bite, reel, result, continue, and ready exit in order', async () => {
    const rig = createRig();
    rig.flow.resize(1280, 720);

    const pendingEntry = rig.flow.begin();
    expect(rig.calls.indexOf('busy:true')).toBeLessThan(rig.calls.indexOf('render:1:0:0'));
    expect(rig.calls.indexOf('render:1:0:0')).toBeLessThan(rig.calls.indexOf('world:enter'));
    rig.animations.enter[0]!.resolve();
    await pendingEntry;
    expect(rig.ui.setFishingState).toHaveBeenLastCalledWith({
      mode: 'aiming', message: 'CLICK THE WATER TO CAST', biteTarget: null,
    });

    await cast(rig);
    expect(rig.audio.fishingCast).toHaveBeenCalledOnce();
    expect(rig.world.castFishingAtScreenPoint).toHaveBeenCalledWith(640, 360, 1280, 720);
    expect(rig.world.showFishingWaiting).toHaveBeenCalledWith(rig.castPoint);
    expect(rig.ui.setFishingState).toHaveBeenLastCalledWith({
      mode: 'waiting', message: 'WAIT FOR A BITE', biteTarget: null,
    });

    rig.flow.update(3);
    expect(rig.audio.fishingBite).toHaveBeenCalledOnce();
    expect(rig.world.showFishingBite).toHaveBeenCalledWith(rig.castPoint);
    expect(rig.ui.setFishingState).toHaveBeenLastCalledWith({
      mode: 'bite', message: 'BITE - REEL NOW', biteTarget: rig.biteTarget,
    });

    rig.calls.length = 0;
    expect(rig.flow.reel()).toBe(true);
    expect(rig.flow.reel()).toBe(false);
    expect(rig.session.finishFishing).toHaveBeenCalledOnce();
    expect(rig.calls.indexOf('audio:reel')).toBeLessThan(rig.calls.indexOf('finishFishing'));
    expect(rig.calls.indexOf('finishFishing')).toBeLessThan(rig.calls.indexOf('render:1:1:0'));
    expect(rig.calls.indexOf('render:1:1:0')).toBeLessThan(rig.calls.indexOf('world:reel'));
    expect(rig.ui.showFishingResult).not.toHaveBeenCalled();

    rig.animations.reel[0]!.resolve();
    await flushPromises();
    expect(rig.ui.showFishingResult).toHaveBeenCalledWith({
      caption: 'SMALL CATCH', title: 'COD', detail: '+1 FOOD', catchTarget: rig.catchTarget,
    });
    expect(rig.world.projectFishingCatch).toHaveBeenCalledWith(1280, 720);

    rig.flow.continueResult();
    rig.flow.continueResult();
    expect(rig.ui.hideFishingResult).toHaveBeenCalledOnce();
    expect(rig.world.clearFishingPresentation).toHaveBeenCalledOnce();
    expect(rig.setBusy).toHaveBeenLastCalledWith(false);
    expect(rig.ui.setFishingState).toHaveBeenLastCalledWith({
      mode: 'ready', message: '', biteTarget: null,
    });
    expect(rig.flow.hasActiveAttempt()).toBe(false);

    rig.flow.exitReadyView();
    rig.flow.exitReadyView();
    expect(rig.world.exitFishingView).toHaveBeenCalledOnce();
    rig.animations.exit[0]!.resolve();
    await flushPromises();
    expect(rig.setBusy).toHaveBeenLastCalledWith(false);
    expect(rig.ui.restoreCommandFocus).toHaveBeenCalledOnce();
    expect(rig.flow.hasActiveAttempt()).toBe(false);
  });

  it('uses the centered cast for keyboard input', async () => {
    const rig = createRig();
    await enter(rig);

    expect(rig.flow.cast(null, null, 800, 600)).toBe(true);

    expect(rig.world.centeredFishingCast).toHaveBeenCalledOnce();
    expect(rig.world.castFishingAtScreenPoint).not.toHaveBeenCalled();
    expect(rig.world.playFishingCast).toHaveBeenCalledWith(rig.castPoint);
  });

  it('rejects an outside-water point and gates a duplicate accepted cast', async () => {
    const rig = createRig();
    await enter(rig);
    vi.mocked(rig.world.castFishingAtScreenPoint)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(rig.castPoint);

    expect(rig.flow.cast(12, 18, 800, 600)).toBe(false);
    expect(rig.flow.cast(240, 180, 800, 600)).toBe(true);
    expect(rig.flow.cast(240, 180, 800, 600)).toBe(false);

    expect(rig.world.playFishingCast).toHaveBeenCalledOnce();
    expect(rig.session.beginFishing.mock.results[0]!.value.attempt.snapshot().state)
      .toBe('casting');
  });

  it('cancels from aiming and restores the committed snapshot before returning', async () => {
    const rig = createRig();
    await enter(rig);

    rig.flow.exitReadyView();
    rig.flow.exitReadyView();

    expect(rig.session.cancelFishing).toHaveBeenCalledOnce();
    expect(rig.realSession.snapshot()).toMatchObject({ energy: 3, actedToday: false });
    expect(rig.renderSnapshot).toHaveBeenLastCalledWith();
    expect(rig.world.exitFishingView).toHaveBeenCalledOnce();
    rig.animations.exit[0]!.resolve();
    await flushPromises();
    expect(rig.ui.restoreCommandFocus).toHaveBeenCalledOnce();
  });

  it('does not advance or accept direct input while paused or hidden', async () => {
    const rig = createRig();
    await enter(rig);
    rig.setPaused(true);
    expect(rig.flow.cast(null, null, 800, 600)).toBe(false);
    rig.setPaused(false);
    rig.setHidden(true);
    expect(rig.flow.cast(null, null, 800, 600)).toBe(false);
    rig.setHidden(false);
    await cast(rig);
    const attempt = rig.session.beginFishing.mock.results[0]!.value.attempt;

    rig.setPaused(true);
    rig.flow.update(3);
    rig.setPaused(false);
    rig.setHidden(true);
    rig.flow.update(3);
    expect(attempt.snapshot().waitingSeconds).toBe(0);
    rig.setHidden(false);
    rig.flow.update(3);
    rig.setPaused(true);
    expect(rig.flow.reel()).toBe(false);
    rig.setPaused(false);
    rig.setHidden(true);
    expect(rig.flow.reel()).toBe(false);
    rig.setHidden(false);
    expect(rig.flow.reel()).toBe(true);
  });

  it('reprojects the bite target on resize without advancing the attempt', async () => {
    const rig = createRig();
    await enter(rig);
    await cast(rig);
    rig.flow.update(3);
    const attempt = rig.session.beginFishing.mock.results[0]!.value.attempt;
    const beforeResize = attempt.snapshot();
    const resizedTarget = { ...rig.biteTarget, x: 520, y: 210 };
    vi.mocked(rig.world.projectFishingBite).mockReturnValueOnce(resizedTarget);

    rig.flow.resize(1920, 1080);

    expect(attempt.snapshot()).toEqual(beforeResize);
    expect(rig.world.showFishingBite).toHaveBeenCalledOnce();
    expect(rig.world.projectFishingBite).toHaveBeenLastCalledWith(1920, 1080);
    expect(rig.ui.updateFishingBiteTarget).toHaveBeenLastCalledWith(resizedTarget);
  });

  it('uses the live attempt view and only reprojects on active bite frames', async () => {
    const rig = createRig();
    await enter(rig);
    await cast(rig);
    const attempt = rig.session.beginFishing.mock.results[0]!.value.attempt;
    const attemptSnapshot = vi.spyOn(attempt, 'snapshot');
    attemptSnapshot.mockClear();

    rig.flow.update(2.99);
    expect(attempt.view().state).toBe('waiting');
    rig.flow.update(0.01);
    expect(attempt.view().state).toBe('bite');
    expect(attemptSnapshot).not.toHaveBeenCalled();
    vi.mocked(rig.ui.updateFishingBiteTarget).mockClear();

    rig.flow.update(0.1);
    rig.flow.update(0.1);

    expect(attemptSnapshot).not.toHaveBeenCalled();
    expect(rig.ui.updateFishingBiteTarget).toHaveBeenCalledTimes(2);
  });

  it('commits one miss and ignores late reels', async () => {
    const rig = createRig({ withBait: true });
    await enter(rig);
    await cast(rig);
    rig.flow.update(3);

    rig.flow.update(1.5);
    expect(rig.flow.reel()).toBe(false);
    rig.flow.update(0.5);

    expect(rig.session.finishFishing).toHaveBeenCalledOnce();
    expect(rig.world.playFishingMiss).toHaveBeenCalledOnce();
    expect(rig.realSession.snapshot()).toMatchObject({ food: 0, bait: 1 });
    rig.animations.miss[0]!.resolve();
    await flushPromises();
    expect(rig.ui.showFishingResult).toHaveBeenCalledWith({
      caption: 'EMPTY HOOK', title: 'IT GOT AWAY', detail: 'NO CATCH', catchTarget: null,
    });
  });

  it('restores the bite state after a rejected settlement and permits retry', async () => {
    const rig = createRig();
    await enter(rig);
    await cast(rig);
    rig.flow.update(3);
    const rejection = {
      accepted: false,
      code: 'fishing-result-mismatch',
      message: 'That result does not belong to this attempt.',
      deltas: {},
      cue: 'none' as const,
    };
    rig.session.finishFishing.mockImplementationOnce(() => rejection);

    expect(rig.flow.reel()).toBe(false);

    expect(rig.audio.deny).toHaveBeenCalledOnce();
    expect(rig.ui.showFeedback).toHaveBeenCalledWith(rejection);
    expect(rig.ui.setFishingState).toHaveBeenLastCalledWith({
      mode: 'bite', message: 'BITE - REEL NOW', biteTarget: rig.biteTarget,
    });
    expect(rig.flow.reel()).toBe(true);
  });

  it('continues normally after visibility settlement resolves a view animation', async () => {
    const rig = createRig();
    const pendingEntry = rig.flow.begin();

    rig.flow.settleForVisibilityChange();
    rig.animations.enter[0]!.resolve();
    await pendingEntry;

    expect(rig.ui.setFishingState).toHaveBeenLastCalledWith({
      mode: 'aiming', message: 'CLICK THE WATER TO CAST', biteTarget: null,
    });
  });

  it('blocks stale cast completion after disposal and cleans UI once', async () => {
    const rig = createRig();
    await enter(rig);
    expect(rig.flow.cast(null, null, 800, 600)).toBe(true);
    const attempt = rig.session.beginFishing.mock.results[0]!.value.attempt;
    const stateCalls = vi.mocked(rig.ui.setFishingState).mock.calls.length;

    rig.flow.dispose();
    rig.flow.dispose();
    rig.animations.cast[0]!.resolve();
    await flushPromises();

    expect(attempt.snapshot().state).toBe('casting');
    expect(rig.world.showFishingWaiting).not.toHaveBeenCalled();
    expect(rig.ui.hideFishingResult).toHaveBeenCalledOnce();
    expect(rig.ui.setFishingViewExitVisible).toHaveBeenLastCalledWith(false);
    expect(vi.mocked(rig.ui.setFishingState).mock.calls).toHaveLength(stateCalls);
    expect(rig.flow.cast(null, null, 800, 600)).toBe(false);
    expect(rig.flow.reel()).toBe(false);
  });

  it.each([
    ['the result cleanup', true, false],
    ['the exit cleanup', false, true],
    ['both UI cleanups', true, true],
  ] as const)('commits disposal and continues after %s fails', (
    _label,
    failResult,
    failExit,
  ) => {
    const rig = createRig();
    const resultFailure = { kind: 'result-cleanup-failure' };
    const exitFailure = { kind: 'exit-cleanup-failure' };
    if (failResult) {
      vi.mocked(rig.ui.hideFishingResult).mockImplementation(() => { throw resultFailure; });
    }
    if (failExit) {
      vi.mocked(rig.ui.setFishingViewExitVisible).mockImplementation(() => {
        throw exitFailure;
      });
    }

    let thrown: unknown;
    try {
      rig.flow.dispose();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBe(failResult ? resultFailure : exitFailure);
    expect(rig.ui.hideFishingResult).toHaveBeenCalledOnce();
    expect(rig.ui.setFishingViewExitVisible).toHaveBeenCalledExactlyOnceWith(false);
    expect(() => rig.flow.dispose()).not.toThrow();
    expect(rig.ui.hideFishingResult).toHaveBeenCalledOnce();
    expect(rig.ui.setFishingViewExitVisible).toHaveBeenCalledOnce();
    expect(rig.flow.hasActiveAttempt()).toBe(false);
    expect(rig.flow.cast(null, null, 800, 600)).toBe(false);
    expect(rig.flow.reel()).toBe(false);
  });

  it('blocks result and focus mutations after restart invalidates lifecycle', async () => {
    const rig = createRig();
    await enter(rig);
    await cast(rig);
    rig.flow.update(3);
    expect(rig.flow.reel()).toBe(true);
    rig.restart();
    const stateCalls = vi.mocked(rig.ui.setFishingState).mock.calls.length;

    rig.animations.reel[0]!.resolve();
    await flushPromises();
    rig.flow.continueResult();
    rig.flow.exitReadyView();

    expect(rig.ui.showFishingResult).not.toHaveBeenCalled();
    expect(rig.world.exitFishingView).not.toHaveBeenCalled();
    expect(rig.ui.restoreCommandFocus).not.toHaveBeenCalled();
    expect(vi.mocked(rig.ui.setFishingState).mock.calls).toHaveLength(stateCalls);
  });
});
