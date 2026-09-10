// Importance: 10/10. Protects fishing workflow order, state, and lifecycle guards.
import { describe,expect,it,vi } from 'vitest';
import type { FishingCastPoint } from '../src/survival/FishingSession';
import {
  SurvivalFishingFlow,
  type FishingAudioPort,
  type FishingUiPort,
  type FishingWorldPort,
} from '../src/survival/SurvivalFishingFlow';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import type { FishingResultView,FishingUiState } from '../src/ui/SurvivalFishingView';
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
  readonly withNet?: boolean;
  readonly energy?: number;
  readonly withBait?: boolean;
  readonly day?: number;
  readonly catchRoll?: number;
}

function createRig(options: FishingRigOptions = {}) {
  const calls: string[] = [];
  const realSession = new SurvivalSession(
    [
      ...(options.withBait ? [{ instanceId: 'baitTin-1' as const, type: 'baitTin' as const }] : []),
      ...(options.withNet ? [{ instanceId: 'fishingNet-1' as const, type: 'fishingNet' as const }] : []),
    ],
    {
      seed: 1,
      initial: { day: options.day ?? 1, energy: options.energy ?? 3 },
      random: sequenceRandom([0, options.catchRoll ?? 0]),
    },
  );
  const session = {
    availableReason: realSession.availableReason.bind(realSession),
    snapshot: vi.fn(() => realSession.snapshot()),
    beginFishing: vi.fn((gear: import('../src/survival/fishingCatalog').FishingGear = 'rod') => {
      calls.push('beginFishing');
      return realSession.beginFishing(gear);
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
    net: [] as Deferred[],
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
  const world: FishingWorldPort = {
    enterFishingView: vi.fn(() => startAnimation('enter')),
    castFishingAtScreenPoint: vi.fn((): FishingCastPoint | null => castPoint),
    centeredFishingCast: vi.fn(() => castPoint),
    playFishingCast: vi.fn(() => startAnimation('cast')),
    showFishingWaiting: vi.fn(() => calls.push('world:waiting')),
    showFishingBite: vi.fn(() => calls.push('world:bite')),
    projectFishingBite: vi.fn(() => biteTarget),
    playFishingReel: vi.fn(() => startAnimation('reel')),
    playFishingNetHaul: vi.fn(() => startAnimation('net')),
    playFishingMiss: vi.fn(() => startAnimation('miss')),
    exitFishingView: vi.fn(() => startAnimation('exit')),
    clearFishingPresentation: vi.fn(() => calls.push('world:clear')),
  };
  const ui: FishingUiPort = {
    setFishingState: vi.fn((state: FishingUiState) => {
      calls.push(`ui:${state.mode}:${state.message}`);
    }),
    showFishingResult: vi.fn((view: FishingResultView) => {
      calls.push(`ui:result:${view.items.length}`);
    }),
    hideFishingResult: vi.fn(() => calls.push('ui:hide-result')),
    updateFishingBiteTarget: vi.fn(() => calls.push('ui:bite-target')),
    setFishingViewExitVisible: vi.fn((visible: boolean) => {
      calls.push(`ui:exit:${visible}`);
    }),
    setFishingFade: vi.fn(async () => undefined),
    restoreCommandFocus: vi.fn(() => calls.push('ui:focus')),
  };
  const audio: FishingAudioPort = {
    deny: vi.fn(() => calls.push('audio:deny')),
    fishingCast: vi.fn(() => calls.push('audio:cast')),
    fishingBite: vi.fn(() => calls.push('audio:bite')),
    fishingReel: vi.fn(() => calls.push('audio:reel')),
    fishingNet: vi.fn(() => calls.push('audio:net')),
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

describe('SurvivalFishingFlow', () => {
  it('hauls one net catch automatically and returns aboard after the result', async () => {
    const rig = createRig({ withNet: true, withBait: true });
    const before = rig.realSession.snapshot();
    const entry = rig.flow.begin('net');
    expect(rig.realSession.snapshot().energy).toBe(3);
    rig.animations.enter[0]!.resolve();
    await entry;
    expect(rig.world.enterFishingView).toHaveBeenCalledWith('net');
    expect(rig.flow.cast(640, 360, 1280, 720)).toBe(true);
    expect(rig.realSession.snapshot()).toMatchObject({ energy: 1, food: before.food + 1, bait: before.bait });
    expect(rig.animations.net).toHaveLength(1);
    expect(rig.world.playFishingNetHaul).toHaveBeenCalledExactlyOnceWith('cod', rig.castPoint);
    expect(rig.animations.cast).toHaveLength(0);
    expect(rig.ui.showFishingResult).not.toHaveBeenCalled();
    expect(rig.flow.cast(640, 360, 1280, 720)).toBe(false);
    rig.animations.net[0]!.resolve();
    await flushPromises();
    expect(rig.ui.showFishingResult).toHaveBeenCalledWith(expect.objectContaining({
      items: [{ itemId: 'cannedFood', quantity: 1, condition: 'usable' }],
      message: '',
    }));
    expect(rig.audio.fishingBite).not.toHaveBeenCalled();
    expect(rig.audio.fishingCast).not.toHaveBeenCalled();
    expect(rig.audio.fishingReel).not.toHaveBeenCalled();
    expect(rig.audio.fishingNet).toHaveBeenCalledOnce();
    rig.flow.continueResult();
    expect(rig.animations.exit).toHaveLength(1);
    rig.animations.exit[0]!.resolve();
    await flushPromises();
    expect(rig.setBusy).toHaveBeenLastCalledWith(false);
  });

  it('rejects an invalid cast without spending Energy and still accepts the next cast', async () => {
    const rig = createRig();
    await enter(rig);
    vi.mocked(rig.world.castFishingAtScreenPoint).mockReturnValueOnce({ x: Number.NaN, z: -6.4 });
    const before = rig.realSession.snapshot();
    expect(rig.flow.cast(640, 360, 1280, 720)).toBe(false);
    expect(rig.realSession.snapshot()).toEqual(before);
    expect(rig.session.beginFishing).not.toHaveBeenCalled();
    expect(rig.flow.cast(640, 360, 1280, 720)).toBe(true);
    expect(rig.realSession.snapshot().energy).toBe(2);
  });

  it('runs cast, bite, reel, result, continue, and ready exit in order', async () => {
    const rig = createRig();
    rig.flow.resize(1280, 720);

    const pendingEntry = rig.flow.begin();
    expect(rig.calls.indexOf('busy:true')).toBeLessThan(rig.calls.indexOf('render:3:0:0'));
    expect(rig.calls.indexOf('render:3:0:0')).toBeLessThan(rig.calls.indexOf('world:enter'));
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
    expect(rig.calls.indexOf('finishFishing')).toBeLessThan(rig.calls.indexOf('render:2:1:0'));
    expect(rig.calls.indexOf('render:2:1:0')).toBeLessThan(rig.calls.indexOf('world:reel'));
    expect(rig.ui.showFishingResult).not.toHaveBeenCalled();

    rig.animations.reel[0]!.resolve();
    await flushPromises();
    expect(rig.ui.showFishingResult).toHaveBeenCalledWith({
      items: [{ itemId: 'cannedFood', quantity: 1, condition: 'usable' }], message: '',
    });

    rig.flow.continueResult();
    rig.flow.continueResult();
    expect(rig.ui.hideFishingResult).toHaveBeenCalledOnce();
    expect(rig.world.clearFishingPresentation).toHaveBeenCalledOnce();
    expect(rig.setBusy).toHaveBeenLastCalledWith(true);
    expect(rig.ui.setFishingState).toHaveBeenLastCalledWith({
      mode: 'aiming', message: 'CLICK THE WATER TO CAST', biteTarget: null,
    });
    expect(rig.flow.isFishing()).toBe(true);

    rig.flow.exitView();
    rig.flow.exitView();
    expect(rig.world.exitFishingView).toHaveBeenCalledOnce();
    rig.animations.exit[0]!.resolve();
    await flushPromises();
    expect(rig.setBusy).toHaveBeenLastCalledWith(false);
    expect(rig.ui.restoreCommandFocus).toHaveBeenCalledOnce();
    expect(rig.flow.isFishing()).toBe(false);
  });

  it('starts a new attempt after Continue and settles each catch only once', async () => {
    const rig = createRig();
    await enter(rig);

    for (let count = 1; count <= 2; count++) {
      await rig.flow.begin();
      expect(rig.session.beginFishing).toHaveBeenCalledTimes(count - 1);
      expect(rig.realSession.snapshot().energy).toBe(4 - count);
      expect(rig.ui.setFishingState).toHaveBeenLastCalledWith({
        mode: 'aiming', message: 'CLICK THE WATER TO CAST', biteTarget: null,
      });
      expect(rig.flow.cast(null, null, 800, 600)).toBe(true);
      expect(rig.flow.cast(null, null, 800, 600)).toBe(false);
      expect(rig.session.beginFishing).toHaveBeenCalledTimes(count);
      expect(rig.realSession.snapshot().energy).toBe(3 - count);
      rig.animations.cast.at(-1)!.resolve();
      await flushPromises();
      rig.flow.update(3);
      expect(rig.flow.reel()).toBe(true);
      expect(rig.flow.reel()).toBe(false);
      rig.animations.reel.at(-1)!.resolve();
      await flushPromises();
      rig.flow.continueResult();
      rig.flow.continueResult();
      expect(rig.ui.setFishingState).toHaveBeenLastCalledWith({
        mode: 'aiming', message: 'CLICK THE WATER TO CAST', biteTarget: null,
      });
      expect(rig.flow.isFishing()).toBe(true);
      expect(rig.session.finishFishing).toHaveBeenCalledTimes(count);
      expect(rig.realSession.snapshot().food).toBe(count);
    }

    expect(rig.world.exitFishingView).not.toHaveBeenCalled();
    expect(rig.world.enterFishingView).toHaveBeenCalledOnce();
    rig.realSession.perform('endDay');
    expect(rig.realSession.snapshot().journalEntries[0]?.actions).toHaveLength(2);
  });

  it('blocks further fishing after returning without Energy', async () => {
    const rig = createRig({ energy: 1 });
    await enter(rig);
    await cast(rig);
    rig.flow.update(3);
    expect(rig.flow.reel()).toBe(true);
    rig.animations.reel[0]!.resolve();
    await flushPromises();
    rig.flow.continueResult();
    rig.animations.exit[0]!.resolve();
    await flushPromises();
    const beforeRetry = rig.realSession.snapshot();

    await rig.flow.begin();

    expect(rig.session.beginFishing).toHaveBeenCalledOnce();
    expect(rig.audio.deny).toHaveBeenCalledOnce();
    expect(rig.realSession.snapshot()).toEqual(beforeRetry);
    expect(rig.world.enterFishingView).toHaveBeenCalledOnce();
    expect(rig.flow.isFishing()).toBe(false);
    expect(rig.setBusy).toHaveBeenLastCalledWith(false);
    expect(rig.ui.setFishingState).toHaveBeenLastCalledWith({
      mode: 'hidden', message: '', biteTarget: null,
    });
    rig.flow.exitView();
    expect(rig.world.exitFishingView).toHaveBeenCalledOnce();
    expect(rig.ui.restoreCommandFocus).toHaveBeenCalledOnce();
  });

  it('falls back to a centered cast when the exact water projection fails', async () => {
    const rig = createRig();
    await enter(rig);
    vi.mocked(rig.world.castFishingAtScreenPoint)
      .mockReturnValueOnce(null);

    expect(rig.flow.cast(12, 18, 800, 600)).toBe(true);
    expect(rig.flow.cast(240, 180, 800, 600)).toBe(false);

    expect(rig.world.centeredFishingCast).toHaveBeenCalledOnce();
    expect(rig.world.playFishingCast).toHaveBeenCalledOnce();
    expect(rig.session.beginFishing.mock.results[0]!.value.attempt.snapshot().state)
      .toBe('casting');
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
    rig.flow.exitView();

    expect(rig.ui.showFishingResult).not.toHaveBeenCalled();
    expect(rig.world.exitFishingView).not.toHaveBeenCalled();
    expect(rig.ui.restoreCommandFocus).not.toHaveBeenCalled();
    expect(vi.mocked(rig.ui.setFishingState).mock.calls).toHaveLength(stateCalls);
  });
});
