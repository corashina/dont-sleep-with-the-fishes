import { PerspectiveCamera, Scene } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ItemInstance, ItemInstanceId } from '../src/game/ItemState';
import type { SceneRenderer } from '../src/rendering/SceneRenderer';
import type { ProjectedBoatBounds } from '../src/survival/BoatInteraction';
import { SURVIVAL_EVENTS } from '../src/survival/events';
import type { FishingCastPoint } from '../src/survival/FishingSession';
import type { JournalEntry, JournalNightRecord } from '../src/survival/journal';
import { SurvivalPhase } from '../src/survival/SurvivalPhase';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import type { SurvivalInventorySnapshot, SurvivalItemState, SurvivalSnapshot } from '../src/survival/survivalTypes';
import type { FishingResultView, FishingUiState, SurvivalUI } from '../src/ui/SurvivalUI';
import { sequenceRandom } from './helpers/random';

function inventory(
  overrides: Partial<Record<ItemInstanceId, SurvivalItemState>> = {},
): SurvivalInventorySnapshot {
  return overrides;
}

function snapshot(overrides: Partial<SurvivalSnapshot> = {}): SurvivalSnapshot {
  return {
    state: 'day', day: 1, health: 100, hunger: 20, energy: 3, hull: 100,
    food: 0, bait: 0, recoveredFood: 0, recoveredBait: 0, repairMaterial: 0,
    rescueProgress: 0, weather: 'calm', actedToday: false,
    journalEntries: [], inventory: inventory(), savedItems: [], pendingEventId: null,
    lastOutcome: null, seed: 8, ...overrides,
  };
}

function completedEntry(
  day: number,
  nighttime: JournalNightRecord = {
    kind: 'event',
    event: {
      phase: 'night', eventId: `night-${day}`, title: 'Quiet Night',
      prompt: 'The night passed without incident.', attemptedChoiceId: null,
      attemptedItemId: null,
      resolution: 'endure', outcomeCode: 'event-resolved',
      outcomeMessage: 'The night remained quiet.',
      inventoryMutations: [],
    },
  },
): JournalEntry {
  return { day, weather: 'calm', actions: [], daytime: null, nighttime };
}

function accepted(overrides: Record<string, unknown> = {}) {
  return {
    accepted: true, code: 'fish-caught', message: 'Caught one.',
    deltas: { energy: -2, food: 1 }, cue: 'fish' as const, ...overrides,
  };
}

function deferred() {
  let complete!: () => void;
  let settled = false;
  const promise = new Promise<void>((done) => { complete = done; });
  const resolve = () => {
    if (settled) return;
    settled = true;
    complete();
  };
  return { promise, resolve, isSettled: () => settled };
}

type Deferred = ReturnType<typeof deferred>;

interface FishingRigOptions {
  readonly reducedMotion?: boolean;
  readonly withBait?: boolean;
  readonly day?: number;
  readonly catchRoll?: number;
  readonly onRestart?: () => void;
}

function createFishingRig(options: FishingRigOptions = {}) {
  const calls: string[] = [];
  const savedItems: readonly ItemInstance[] = options.withBait
    ? [{ instanceId: 'baitTin-1', type: 'baitTin' as const }]
    : [];
  const realSession = new SurvivalSession(savedItems, {
    seed: 1,
    initial: { day: options.day ?? 1 },
    random: sequenceRandom([0, options.catchRoll ?? 0]),
  });
  const beginFishing = vi.fn(() => {
    calls.push('beginFishing');
    return realSession.beginFishing();
  });
  const finishFishing = vi.fn((...args: Parameters<SurvivalSession['finishFishing']>) => {
    calls.push('finishFishing');
    return realSession.finishFishing(...args);
  });
  const requestDayEvent = vi.fn(() => {
    calls.push('requestDayEvent');
    return {
      accepted: false,
      code: 'day-event-used',
      message: 'No daytime event remains.',
      deltas: {},
      cue: 'none' as const,
    };
  });
  const session = {
    snapshot: vi.fn(() => realSession.snapshot()),
    availableReason: vi.fn(realSession.availableReason.bind(realSession)),
    perform: vi.fn(realSession.perform.bind(realSession)),
    beginFishing,
    finishFishing,
    requestDayEvent,
    resolveEvent: vi.fn(realSession.resolveEvent.bind(realSession)),
    beginDawn: vi.fn(realSession.beginDawn.bind(realSession)),
  };

  const animations = {
    enter: [] as Deferred[],
    cast: [] as Deferred[],
    reel: [] as Deferred[],
    miss: [] as Deferred[],
    exit: [] as Deferred[],
    fade: [] as Deferred[],
  };
  const startAnimation = (kind: keyof Omit<typeof animations, 'fade'>): Promise<void> => {
    const handle = deferred();
    animations[kind].push(handle);
    calls.push(kind === 'exit' ? 'exitFishingView' : `play:${kind}`);
    return handle.promise;
  };
  const castPoint = Object.freeze({ x: 4, z: -2 });
  const biteTarget: ProjectedBoatBounds = Object.freeze({
    x: 320, y: 180, width: 64, height: 48, depth: 2, visible: true,
  });
  const world = {
    scene: new Scene(),
    update: vi.fn(),
    syncInventory: vi.fn(),
    projectInteractionAnchors: vi.fn(() => []),
    setWeather: vi.fn(),
    setPhase: vi.fn(),
    setHighlightedItem: vi.fn(),
    enterFishingView: vi.fn(() => startAnimation('enter')),
    castFishingAtScreenPoint: vi.fn((): FishingCastPoint | null => castPoint),
    centeredFishingCast: vi.fn(() => castPoint),
    playFishingCast: vi.fn((point: FishingCastPoint) => {
      calls.push(`cast:${point.x},${point.z}`);
      return startAnimation('cast');
    }),
    showFishingWaiting: vi.fn((point: FishingCastPoint) => {
      calls.push(`waiting:${point.x},${point.z}`);
    }),
    showFishingBite: vi.fn((point: FishingCastPoint) => {
      calls.push(`bite:${point.x},${point.z}`);
    }),
    projectFishingBite: vi.fn(() => biteTarget),
    playFishingReel: vi.fn((catchId: string) => {
      calls.push(`playFishingReel:${catchId}`);
      return startAnimation('reel');
    }),
    playFishingMiss: vi.fn(() => {
      calls.push('playFishingMiss');
      return startAnimation('miss');
    }),
    exitFishingView: vi.fn(() => startAnimation('exit')),
    clearFishingPresentation: vi.fn(() => calls.push('clearFishingPresentation')),
    play: vi.fn(async (cue: string) => { calls.push(`generic:${cue}`); }),
    dispose: vi.fn(() => {
      for (const kind of ['enter', 'cast', 'reel', 'miss', 'exit'] as const) {
        for (const handle of animations[kind]) handle.resolve();
      }
    }),
  };
  const updateFishingBiteTarget = vi.fn((target: ProjectedBoatBounds | null) => {
    calls.push(`ui:bite-target:${target?.x ?? 'hidden'}`);
  });
  const ui: Partial<SurvivalUI> = {
    render: vi.fn((current: SurvivalSnapshot) => {
      calls.push(`render:${current.energy}:${current.food}:${current.bait}`);
    }),
    setJournalUnread: vi.fn(),
    setAnchors: vi.fn(),
    setBusy: vi.fn((busy: boolean) => calls.push(busy ? 'lock' : 'unlock')),
    setFishingState: vi.fn((state: FishingUiState) => {
      calls.push(`ui:${state.mode}:${state.message}`);
    }),
    updateFishingBiteTarget,
    setFishingFade: vi.fn((covered: boolean) => {
      calls.push(covered ? 'fade:cover' : 'fade:uncover');
      const handle = deferred();
      animations.fade.push(handle);
      return handle.promise;
    }),
    showFeedback: vi.fn(),
    showFishingResult: vi.fn((view: FishingResultView) => {
      calls.push(`result:${view.title}:${view.detail}`);
    }),
    hideFishingResult: vi.fn(() => calls.push('hideFishingResult')),
    restoreCommandFocus: vi.fn(() => calls.push('restoreCommandFocus')),
    dispose: vi.fn(() => {
      for (const handle of animations.fade) handle.resolve();
    }),
  };
  const phase = SurvivalPhase.forTest({
    session,
    world,
    ui,
    reducedMotion: options.reducedMotion,
    onRestart: options.onRestart,
  });
  return {
    phase,
    session,
    realSession,
    world,
    ui,
    calls,
    animations,
    castPoint,
    biteTarget,
    updateFishingBiteTarget,
  };
}

type FishingRig = ReturnType<typeof createFishingRig>;

function fishingCastCallback(rig: FishingRig) {
  const callback = rig.ui.onFishingCast;
  if (callback === null || callback === undefined) throw new Error('Fishing cast callback was not wired.');
  return callback;
}

function fishingReelCallback(rig: FishingRig) {
  const callback = rig.ui.onFishingReel;
  if (callback === null || callback === undefined) throw new Error('Fishing reel callback was not wired.');
  return callback;
}

async function settleFishingEntry(rig: FishingRig): Promise<void> {
  if (rig.animations.fade.length > 0) {
    rig.animations.fade.at(-1)!.resolve();
    await flushPromises();
  }
  expect(rig.animations.enter).toHaveLength(1);
  rig.animations.enter.at(-1)!.resolve();
  await flushPromises();
  const latestFade = rig.animations.fade.at(-1);
  if (latestFade !== undefined && rig.calls.at(-1) === 'fade:uncover') {
    latestFade.resolve();
    await flushPromises();
  }
}

async function completeFishingCast(rig: FishingRig): Promise<void> {
  rig.animations.cast.at(-1)!.resolve();
  await flushPromises();
}

async function settleFishingReturn(
  rig: FishingRig,
  resultAnimation: 'reel' | 'miss',
): Promise<void> {
  const fadeCount = rig.animations.fade.length;
  rig.animations[resultAnimation].at(-1)!.resolve();
  await flushPromises();
  rig.ui.onFishingResultContinue?.();
  rig.ui.onFishingResultContinue?.();
  if (rig.animations.fade.length > fadeCount) {
    rig.animations.fade[fadeCount]!.resolve();
    await flushPromises();
  }
  expect(rig.animations.exit).toHaveLength(1);
  rig.animations.exit[0]!.resolve();
  await flushPromises();
  if (rig.animations.fade.length > fadeCount + 1) {
    rig.animations.fade[fadeCount + 1]!.resolve();
    await flushPromises();
  }
}

type FishingTeardownStage =
  | 'enter-cover'
  | 'entering'
  | 'enter-uncover'
  | 'aiming'
  | 'casting'
  | 'waiting'
  | 'bite'
  | 'reeling'
  | 'missing'
  | 'result'
  | 'exit-cover'
  | 'returning'
  | 'exit-uncover';

async function reachFishingTeardownStage(
  rig: FishingRig,
  stage: FishingTeardownStage,
): Promise<void> {
  if (stage === 'enter-cover' || stage === 'entering') return;
  if (stage === 'enter-uncover') {
    rig.animations.fade[0]!.resolve();
    await flushPromises();
    rig.animations.enter[0]!.resolve();
    await flushPromises();
    return;
  }

  await settleFishingEntry(rig);
  if (stage === 'aiming') return;
  expect(fishingCastCallback(rig)(null)).toBe(true);
  if (stage === 'casting') return;
  await completeFishingCast(rig);
  if (stage === 'waiting') return;
  rig.phase.update(3, 3);
  if (stage === 'bite') return;
  if (stage === 'missing') {
    rig.phase.update(4.5, 1.5);
    return;
  }

  fishingReelCallback(rig)();
  if (stage === 'reeling') return;
  rig.animations.reel.at(-1)!.resolve();
  await flushPromises();
  if (stage === 'result') return;
  rig.ui.onFishingResultContinue?.();
  if (stage === 'exit-cover' || stage === 'returning') return;
  rig.animations.fade.at(-1)!.resolve();
  await flushPromises();
  rig.animations.exit.at(-1)!.resolve();
  await flushPromises();
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => vi.unstubAllGlobals());

describe('SurvivalPhase orchestration', () => {
  it('renders survival through sceneRenderer with night and squall state', () => {
    const scene = new Scene();
    const render = vi.fn();
    const sceneRenderer: SceneRenderer = { render, resize: vi.fn(), dispose: vi.fn() };
    const current = snapshot({ state: 'nightEvent', weather: 'squall' });
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => current) },
      world: { scene, update: vi.fn(), dispose: vi.fn() },
      ui: { render: vi.fn(), setJournalUnread: vi.fn(), dispose: vi.fn() },
      sceneRenderer,
    });

    phase.start();
    phase.update(7, 0.016);
    phase.render();

    expect(render).toHaveBeenLastCalledWith(
      scene,
      expect.any(PerspectiveCamera),
      {
        kind: 'survival',
        elapsedSeconds: 7,
        phase: 'night',
        weather: 'squall',
        reducedMotion: false,
      },
    );
  });

  it('synchronizes inventory and projected anchors after renders, updates, and resize', () => {
    const current = snapshot();
    const syncInventory = vi.fn();
    const anchors = [{
      id: 'can', itemType: 'cannedFood' as const, toolId: null, action: 'eat' as const,
      remainingUses: 1, x: 400, y: 80, visible: true, depleted: false,
    }];
    const projectInteractionAnchors = vi.fn(() => anchors);
    const setAnchors = vi.fn();
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => current) },
      world: { syncInventory, projectInteractionAnchors, update: vi.fn(), dispose: vi.fn() },
      ui: { render: vi.fn(), setAnchors, setJournalUnread: vi.fn(), dispose: vi.fn() },
    });

    phase.start();
    phase.resize(800, 600);
    phase.update(1, 0.016);

    expect(syncInventory).toHaveBeenCalledWith(current);
    expect(projectInteractionAnchors).toHaveBeenLastCalledWith(800, 600);
    expect(setAnchors).toHaveBeenLastCalledWith(anchors);
  });

  it('renders and unlocks an accepted daytime action after its cue', async () => {
    const cue = deferred();
    const perform = vi.fn(() => accepted());
    const showFeedback = vi.fn();
    const setBusy = vi.fn();
    const render = vi.fn();
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => snapshot()), perform },
      world: { play: vi.fn(() => cue.promise), dispose: vi.fn() },
      ui: { render, showFeedback, setBusy, restoreCommandFocus: vi.fn(), setJournalUnread: vi.fn(), dispose: vi.fn() },
    });

    phase.handleAction('dive');
    phase.handleAction('dive');
    expect(perform).toHaveBeenCalledOnce();
    expect(setBusy).toHaveBeenCalledWith(true);

    cue.resolve();
    await flushPromises();
    expect(render).toHaveBeenCalled();
    expect(showFeedback).toHaveBeenCalledWith(expect.objectContaining({ message: 'Caught one.' }));
    expect(setBusy).toHaveBeenLastCalledWith(false);

    phase.handleAction('dive');
    expect(perform).toHaveBeenCalledTimes(2);
  });

  it('shows rejected feedback without playing or locking', () => {
    const rejected = { ...accepted(), accepted: false, code: 'blocked', cue: 'none' as const };
    const play = vi.fn();
    const showFeedback = vi.fn();
    const setBusy = vi.fn();
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => snapshot()), perform: vi.fn(() => rejected) },
      world: { play, dispose: vi.fn() },
      ui: { showFeedback, setBusy, dispose: vi.fn() },
    });
    phase.handleAction('dive');
    expect(showFeedback).toHaveBeenCalledWith(rejected);
    expect(play).not.toHaveBeenCalled();
    expect(setBusy).not.toHaveBeenCalled();
  });

  it('rejects a fishing start without moving the camera or locking ordinary commands', () => {
    const rejection = {
      accepted: false,
      code: 'not-enough-energy',
      message: 'Fishing requires one energy.',
      deltas: {},
      cue: 'none' as const,
    };
    const beginFishing = vi.fn(() => ({ accepted: false as const, outcome: rejection }));
    const perform = vi.fn(() => ({ ...accepted(), accepted: false }));
    const enterFishingView = vi.fn();
    const setBusy = vi.fn();
    const showFeedback = vi.fn();
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => snapshot({ energy: 0 })), beginFishing, perform },
      world: { enterFishingView, play: vi.fn(), dispose: vi.fn() },
      ui: { setBusy, showFeedback, dispose: vi.fn() },
    });

    phase.handleAction('fish');

    expect(beginFishing).toHaveBeenCalledOnce();
    expect(showFeedback).toHaveBeenCalledWith(rejection);
    expect(enterFishingView).not.toHaveBeenCalled();
    expect(setBusy).not.toHaveBeenCalled();
    phase.handleAction('dive');
    expect(perform).toHaveBeenCalledOnce();
  });

  it('renders the committed energy and locks commands before entering aiming', async () => {
    const rig = createFishingRig();
    rig.phase.start();
    rig.calls.length = 0;

    rig.phase.handleAction('fish');

    expect(rig.session.beginFishing).toHaveBeenCalledOnce();
    expect(rig.session.perform).not.toHaveBeenCalled();
    expect(rig.realSession.snapshot()).toMatchObject({ energy: 2, actedToday: true });
    expect(rig.calls.indexOf('lock')).toBeLessThan(rig.calls.indexOf('play:enter'));
    expect(rig.calls.indexOf('render:2:0:0')).toBeLessThan(rig.calls.indexOf('play:enter'));
    expect(rig.calls.some((call) => call.startsWith('ui:aiming:'))).toBe(false);
    rig.phase.handleAction('dive');
    rig.phase.handleAction('repair');
    rig.phase.handleAction('endDay');
    rig.phase.handleEventItem('unused-choice', 'baitTin-1');
    rig.phase.handleEndure();
    rig.phase.handleJournalOpen();
    expect(rig.session.perform).not.toHaveBeenCalled();
    expect(rig.session.resolveEvent).not.toHaveBeenCalled();
    expect(rig.ui.showJournal).toBeUndefined();
    rig.world.setHighlightedItem.mockClear();
    rig.ui.onAnchorHighlight?.('baitTin-1');
    expect(rig.world.setHighlightedItem).toHaveBeenCalledWith('baitTin-1');

    await settleFishingEntry(rig);

    expect(rig.ui.setFishingState).toHaveBeenLastCalledWith({
      mode: 'aiming',
      message: 'CLICK THE WATER TO CAST',
      biteTarget: null,
    });
  });

  it('ignores an outside-water mouse point, accepts the retry, and gates duplicate casts', async () => {
    const rig = createFishingRig();
    rig.phase.start();
    rig.phase.handleAction('fish');
    await settleFishingEntry(rig);
    const cast = fishingCastCallback(rig);
    rig.world.castFishingAtScreenPoint
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(rig.castPoint);

    expect(cast({ x: 12, y: 18 })).toBe(false);
    expect(rig.session.beginFishing.mock.results[0]!.value.attempt.snapshot().state).toBe('aiming');
    expect(rig.world.playFishingCast).not.toHaveBeenCalled();

    expect(cast({ x: 240, y: 180 })).toBe(true);
    expect(cast({ x: 240, y: 180 })).toBe(false);
    expect(rig.world.castFishingAtScreenPoint).toHaveBeenCalledWith(240, 180, 1, 1);
    expect(rig.world.playFishingCast).toHaveBeenCalledOnce();
    expect(rig.world.playFishingCast).toHaveBeenCalledWith(rig.castPoint);
    await completeFishingCast(rig);

    const attempt = rig.session.beginFishing.mock.results[0]!.value.attempt;
    expect(attempt.snapshot()).toMatchObject({ state: 'waiting', castPoint: rig.castPoint });
    expect(rig.world.showFishingWaiting).toHaveBeenCalledOnce();
    expect(rig.world.showFishingWaiting).toHaveBeenCalledWith(rig.castPoint);
    expect(rig.ui.setFishingState).toHaveBeenLastCalledWith({
      mode: 'waiting',
      message: 'WAIT FOR A BITE',
      biteTarget: null,
    });
  });

  it('uses the centered world cast for keyboard input', async () => {
    const rig = createFishingRig();
    rig.phase.start();
    rig.phase.handleAction('fish');
    await settleFishingEntry(rig);

    expect(fishingCastCallback(rig)(null)).toBe(true);

    expect(rig.world.centeredFishingCast).toHaveBeenCalledOnce();
    expect(rig.world.castFishingAtScreenPoint).not.toHaveBeenCalled();
    expect(rig.world.playFishingCast).toHaveBeenCalledWith(rig.castPoint);
  });

  it('advances fishing time only while started, visible, and unpaused', async () => {
    const listeners = new Map<string, EventListener>();
    const fakeDocument = {
      hidden: false,
      addEventListener: vi.fn((type: string, listener: EventListener) => listeners.set(type, listener)),
      removeEventListener: vi.fn((type: string) => listeners.delete(type)),
    };
    vi.stubGlobal('document', fakeDocument);
    const rig = createFishingRig();
    rig.phase.start();
    rig.phase.handleAction('fish');
    await settleFishingEntry(rig);
    expect(fishingCastCallback(rig)(null)).toBe(true);
    await completeFishingCast(rig);
    const attempt = rig.session.beginFishing.mock.results[0]!.value.attempt;

    rig.phase.setPaused(true);
    rig.phase.update(1, 1);
    expect(attempt.snapshot().waitingSeconds).toBe(0);
    rig.phase.setPaused(false);
    fakeDocument.hidden = true;
    rig.phase.update(2, 1);
    expect(attempt.snapshot().waitingSeconds).toBe(0);
    fakeDocument.hidden = false;
    rig.phase.update(3, 1.25);
    expect(attempt.snapshot().waitingSeconds).toBe(1.25);
    rig.phase.update(4.75, 1.75);
    expect(attempt.snapshot()).toMatchObject({ state: 'bite', biteSeconds: 0 });
    rig.phase.setPaused(true);
    rig.phase.update(6.25, 1.5);
    expect(attempt.snapshot()).toMatchObject({ state: 'bite', biteSeconds: 0 });
    rig.phase.setPaused(false);
    fakeDocument.hidden = true;
    rig.phase.update(7.75, 1.5);
    expect(attempt.snapshot()).toMatchObject({ state: 'bite', biteSeconds: 0 });
    fakeDocument.hidden = false;
    rig.phase.update(9.24, 1.49);
    expect(attempt.snapshot()).toMatchObject({ state: 'bite', biteSeconds: 1.49 });
    rig.phase.dispose();
    rig.phase.update(4, 1);
    expect(attempt.snapshot()).toMatchObject({ state: 'bite', biteSeconds: 1.49 });
  });

  it('rejects direct cast and reel callbacks while paused or hidden', async () => {
    const fakeDocument = {
      hidden: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('document', fakeDocument);
    const rig = createFishingRig();
    rig.phase.start();
    rig.phase.handleAction('fish');
    await settleFishingEntry(rig);
    const cast = fishingCastCallback(rig);
    const attempt = rig.session.beginFishing.mock.results[0]!.value.attempt;

    rig.phase.setPaused(true);
    expect(cast(null)).toBe(false);
    expect(attempt.snapshot().state).toBe('aiming');
    rig.phase.setPaused(false);
    fakeDocument.hidden = true;
    expect(cast(null)).toBe(false);
    expect(attempt.snapshot().state).toBe('aiming');
    fakeDocument.hidden = false;
    expect(cast(null)).toBe(true);
    await completeFishingCast(rig);
    rig.phase.update(3, 3);

    const reel = fishingReelCallback(rig);
    rig.phase.setPaused(true);
    expect(reel()).toBe(false);
    expect(attempt.snapshot().state).toBe('bite');
    expect(rig.session.finishFishing).not.toHaveBeenCalled();
    rig.phase.setPaused(false);
    fakeDocument.hidden = true;
    expect(reel()).toBe(false);
    expect(attempt.snapshot().state).toBe('bite');
    expect(rig.session.finishFishing).not.toHaveBeenCalled();
    fakeDocument.hidden = false;
    expect(reel()).toBe(true);
    expect(rig.session.finishFishing).toHaveBeenCalledOnce();
  });

  it('shows one bite at the stored cast point and resize only reprojects its target', async () => {
    const rig = createFishingRig();
    rig.phase.start();
    rig.phase.resize(800, 600);
    rig.phase.handleAction('fish');
    await settleFishingEntry(rig);
    expect(fishingCastCallback(rig)({ x: 240, y: 180 })).toBe(true);
    await completeFishingCast(rig);
    const attempt = rig.session.beginFishing.mock.results[0]!.value.attempt;

    rig.phase.update(3, 3);

    expect(attempt.snapshot().state).toBe('bite');
    expect(rig.world.showFishingBite).toHaveBeenCalledOnce();
    expect(rig.world.showFishingBite).toHaveBeenCalledWith(rig.castPoint);
    expect(rig.world.projectFishingBite).toHaveBeenLastCalledWith(800, 600);
    expect(rig.ui.setFishingState).toHaveBeenLastCalledWith({
      mode: 'bite',
      message: 'BITE - REEL NOW',
      biteTarget: rig.biteTarget,
    });
    const beforeResize = attempt.snapshot();
    const resizedTarget = { ...rig.biteTarget, x: 520, y: 210 };
    rig.world.projectFishingBite.mockReturnValueOnce(resizedTarget);

    rig.phase.resize(1280, 720);

    expect(attempt.snapshot()).toEqual(beforeResize);
    expect(rig.world.showFishingBite).toHaveBeenCalledOnce();
    expect(rig.world.projectFishingBite).toHaveBeenLastCalledWith(1280, 720);
    expect(rig.updateFishingBiteTarget).toHaveBeenLastCalledWith(resizedTarget);
  });

  it('reads the live attempt view and only updates bite position on active frames', async () => {
    const rig = createFishingRig();
    rig.phase.start();
    rig.phase.handleAction('fish');
    await settleFishingEntry(rig);
    expect(fishingCastCallback(rig)(null)).toBe(true);
    await completeFishingCast(rig);
    const attempt = rig.session.beginFishing.mock.results[0]!.value.attempt;
    const attemptSnapshot = vi.spyOn(attempt, 'snapshot');
    attemptSnapshot.mockClear();
    const stateCallsBeforeBite = vi.mocked(rig.ui.setFishingState!).mock.calls.length;

    rig.phase.update(3, 3);

    expect(attemptSnapshot).not.toHaveBeenCalled();
    expect(vi.mocked(rig.ui.setFishingState!).mock.calls).toHaveLength(stateCallsBeforeBite + 1);
    const stateCallsAtBite = vi.mocked(rig.ui.setFishingState!).mock.calls.length;
    rig.updateFishingBiteTarget.mockClear();

    rig.phase.update(3.1, 0.1);
    rig.phase.update(3.2, 0.1);

    expect(attemptSnapshot).not.toHaveBeenCalled();
    expect(vi.mocked(rig.ui.setFishingState!).mock.calls).toHaveLength(stateCallsAtBite);
    expect(rig.updateFishingBiteTarget).toHaveBeenCalledTimes(2);
    expect(rig.updateFishingBiteTarget).toHaveBeenLastCalledWith(rig.biteTarget);
  });

  it('shows a landed cod result after reeling and waits for one acknowledgement before return', async () => {
    const rig = createFishingRig();
    rig.phase.start();
    rig.phase.handleAction('fish');
    await settleFishingEntry(rig);
    expect(fishingCastCallback(rig)(null)).toBe(true);
    await completeFishingCast(rig);
    rig.phase.update(3, 3);
    rig.calls.length = 0;

    const reel = fishingReelCallback(rig);
    expect(reel()).toBe(true);
    expect(reel()).toBe(false);
    rig.phase.update(3.1, 0.1);

    expect(rig.session.finishFishing).toHaveBeenCalledOnce();
    expect(rig.world.playFishingReel).toHaveBeenCalledOnce();
    expect(rig.realSession.snapshot()).toMatchObject({ food: 1, bait: 0 });
    expect(rig.session.requestDayEvent).not.toHaveBeenCalled();
    const finishIndex = rig.calls.indexOf('finishFishing');
    const renderIndex = rig.calls.indexOf('render:2:1:0');
    const presentationIndex = rig.calls.indexOf('playFishingReel:cod');
    expect(finishIndex).toBeLessThan(renderIndex);
    expect(renderIndex).toBeLessThan(presentationIndex);
    expect(rig.calls).not.toContain('result:COD:+1 FOOD');
    expect(rig.world.exitFishingView).not.toHaveBeenCalled();

    rig.animations.reel.at(-1)!.resolve();
    await flushPromises();
    expect(rig.calls).toContain('result:COD:+1 FOOD');
    expect(rig.ui.setFishingState).toHaveBeenLastCalledWith({
      mode: 'result', message: '', biteTarget: null,
    });
    expect(rig.world.exitFishingView).not.toHaveBeenCalled();
    expect(rig.session.requestDayEvent).not.toHaveBeenCalled();
    rig.ui.onFishingResultContinue?.();
    rig.ui.onFishingResultContinue?.();
    expect(rig.ui.hideFishingResult).toHaveBeenCalledOnce();
    expect(rig.world.exitFishingView).toHaveBeenCalledOnce();
    rig.animations.exit.at(-1)!.resolve();
    await flushPromises();

    const exitIndex = rig.calls.indexOf('exitFishingView');
    const unlockIndex = rig.calls.indexOf('unlock');
    expect(presentationIndex).toBeLessThan(exitIndex);
    expect(rig.calls.indexOf('playFishingReel:cod'))
      .toBeLessThan(rig.calls.indexOf('result:COD:+1 FOOD'));
    expect(rig.calls.indexOf('result:COD:+1 FOOD'))
      .toBeLessThan(rig.calls.indexOf('exitFishingView'));
    expect(exitIndex).toBeLessThan(unlockIndex);
    expect(rig.world.clearFishingPresentation).toHaveBeenCalledOnce();
    expect(rig.ui.setFishingState).toHaveBeenLastCalledWith({
      mode: 'hidden', message: '', biteTarget: null,
    });
    expect(rig.session.requestDayEvent).not.toHaveBeenCalled();
    expect(rig.world.play).not.toHaveBeenCalled();

    rig.realSession.perform('endDay');
    expect(rig.realSession.snapshot().journalEntries[0]?.actions).toHaveLength(1);
  });

  it.each([
    {
      label: 'baited tuna', options: { withBait: true, day: 3, catchRoll: 0.19 },
      resultAnimation: 'reel' as const, expected: 'result:TUNA:+2 FOOD - 1 BAIT USED',
    },
    {
      label: 'plastic bottle', options: { catchRoll: 0.999999 },
      resultAnimation: 'reel' as const, expected: 'result:PLASTIC BOTTLE:NO FOOD',
    },
    {
      label: 'miss', options: {},
      resultAnimation: 'miss' as const, expected: 'result:IT GOT AWAY:NO CATCH',
    },
  ])('formats $label and gates duplicate Continue calls', async ({
    options, resultAnimation, expected,
  }) => {
    const rig = createFishingRig(options);
    rig.phase.start();
    rig.phase.handleAction('fish');
    await settleFishingEntry(rig);
    expect(fishingCastCallback(rig)(null)).toBe(true);
    await completeFishingCast(rig);
    rig.phase.update(3, 3);
    rig.calls.length = 0;

    if (resultAnimation === 'miss') rig.phase.update(4.5, 1.5);
    else expect(fishingReelCallback(rig)()).toBe(true);

    expect(rig.calls).not.toContain(expected);
    rig.animations[resultAnimation].at(-1)!.resolve();
    await flushPromises();
    expect(rig.calls).toContain(expected);
    expect(rig.world.exitFishingView).not.toHaveBeenCalled();
    expect(rig.session.requestDayEvent).not.toHaveBeenCalled();

    rig.ui.onFishingResultContinue?.();
    rig.ui.onFishingResultContinue?.();
    expect(rig.world.exitFishingView).toHaveBeenCalledOnce();
    expect(rig.ui.hideFishingResult).toHaveBeenCalledOnce();
    rig.animations.exit.at(-1)!.resolve();
    await flushPromises();
    expect(rig.session.requestDayEvent).not.toHaveBeenCalled();
  });

  it('commits an expired bite before one miss presentation and ignores late reels', async () => {
    const rig = createFishingRig({ withBait: true });
    rig.phase.start();
    rig.phase.handleAction('fish');
    await settleFishingEntry(rig);
    expect(fishingCastCallback(rig)(null)).toBe(true);
    await completeFishingCast(rig);
    rig.phase.update(3, 3);
    rig.calls.length = 0;

    rig.phase.update(4.5, 1.5);
    fishingReelCallback(rig)();
    rig.phase.update(5, 0.5);

    expect(rig.session.finishFishing).toHaveBeenCalledOnce();
    expect(rig.realSession.snapshot()).toMatchObject({ food: 0, bait: 1 });
    expect(rig.world.playFishingMiss).toHaveBeenCalledOnce();
    expect(rig.calls.indexOf('finishFishing')).toBeLessThan(rig.calls.indexOf('playFishingMiss'));
    expect(rig.calls).not.toContain('result:IT GOT AWAY:NO CATCH');
    rig.animations.miss.at(-1)!.resolve();
    await flushPromises();
    expect(rig.calls).toContain('result:IT GOT AWAY:NO CATCH');
    expect(rig.ui.setFishingState).toHaveBeenLastCalledWith({
      mode: 'result', message: '', biteTarget: null,
    });
    expect(rig.world.exitFishingView).not.toHaveBeenCalled();
    expect(rig.session.requestDayEvent).not.toHaveBeenCalled();
  });

  it('restores bite presentation and retries a rejected terminal settlement', async () => {
    const rig = createFishingRig();
    const rejection = {
      accepted: false,
      code: 'fishing-result-mismatch',
      message: 'That result does not belong to the active fishing attempt.',
      deltas: {},
      cue: 'none' as const,
    };
    rig.session.finishFishing.mockImplementationOnce(() => {
      rig.calls.push('finishFishing');
      return rejection;
    });
    rig.phase.start();
    rig.phase.handleAction('fish');
    await settleFishingEntry(rig);
    expect(fishingCastCallback(rig)(null)).toBe(true);
    await completeFishingCast(rig);
    rig.phase.update(3, 3);

    const reel = fishingReelCallback(rig);
    expect(reel()).toBe(false);
    expect(rig.ui.showFeedback).toHaveBeenCalledWith(rejection);
    expect(rig.ui.setFishingState).toHaveBeenLastCalledWith({
      mode: 'bite', message: 'BITE - REEL NOW', biteTarget: rig.biteTarget,
    });
    expect(rig.world.playFishingReel).not.toHaveBeenCalled();

    expect(reel()).toBe(true);
    expect(rig.session.finishFishing).toHaveBeenCalledTimes(2);
    expect(rig.world.playFishingReel).toHaveBeenCalledOnce();
    expect(rig.realSession.snapshot().food).toBe(1);
  });

  it.each([false, true])(
    'keeps gameplay timing and results identical with reduced motion %s',
    async (reducedMotion) => {
      const rig = createFishingRig({ reducedMotion });
      rig.phase.start();
      rig.phase.handleAction('fish');
      await settleFishingEntry(rig);
      expect(fishingCastCallback(rig)(null)).toBe(true);
      await completeFishingCast(rig);
      const attempt = rig.session.beginFishing.mock.results[0]!.value.attempt;

      rig.phase.update(2.99, 2.99);
      expect(attempt.snapshot().state).toBe('waiting');
      rig.phase.update(3, 0.01);
      expect(attempt.snapshot().state).toBe('bite');
      expect(attempt.snapshot().biteSeconds).toBeCloseTo(0, 12);
      fishingReelCallback(rig)();
      expect(rig.realSession.snapshot()).toMatchObject({ food: 1, energy: 2 });
      await settleFishingReturn(rig, 'reel');

      expect(rig.session.requestDayEvent).not.toHaveBeenCalled();
      expect(rig.world.play).not.toHaveBeenCalled();
      expect(rig.animations.fade).toHaveLength(reducedMotion ? 4 : 0);
    },
  );

  it.each(([
    ['enter-cover', true],
    ['entering', false],
    ['enter-uncover', true],
    ['aiming', false],
    ['casting', false],
    ['waiting', false],
    ['bite', false],
    ['reeling', false],
    ['missing', false],
    ['result', false],
    ['exit-cover', true],
    ['returning', false],
    ['exit-uncover', true],
  ] as const).flatMap(([stage, reducedMotion]) => (
    (['dispose', 'restart'] as const).map((teardown) => [stage, reducedMotion, teardown] as const)
  )))(
    '%s (reduced motion %s) settles safely through %s without later callbacks',
    async (state, reducedMotion, teardown) => {
    let rig!: FishingRig;
    const onRestart = vi.fn(() => rig.phase.dispose());
    rig = createFishingRig({ reducedMotion, onRestart });
    rig.phase.start();
    rig.phase.handleAction('fish');
    await reachFishingTeardownStage(rig, state);
    const attempt = rig.session.beginFishing.mock.results[0]!.value.attempt;
    const beforeTeardown = attempt.snapshot();
    const sessionBeforeTeardown = rig.realSession.snapshot();
    const fishingUiCalls = vi.mocked(rig.ui.setFishingState!).mock.calls.length;
    const eventCalls = rig.session.requestDayEvent.mock.calls.length;
    const finishCalls = rig.session.finishFishing.mock.calls.length;
    const exitCalls = rig.world.exitFishingView.mock.calls.length;
    const continueResult = rig.ui.onFishingResultContinue;
    const pendingHandles = Object.values(rig.animations)
      .flat()
      .filter((handle) => !handle.isSettled());

    if (teardown === 'restart') rig.phase.requestRestart();
    else rig.phase.dispose();
    rig.phase.dispose();
    await flushPromises();
    continueResult?.();
    await flushPromises();
    rig.phase.update(20, 20);

    expect(onRestart).toHaveBeenCalledTimes(teardown === 'restart' ? 1 : 0);
    expect(rig.world.dispose).toHaveBeenCalledOnce();
    expect(rig.ui.dispose).toHaveBeenCalledOnce();
    expect(rig.ui.hideFishingResult).toHaveBeenCalled();
    expect(rig.ui.onFishingResultContinue).toBeNull();
    expect(pendingHandles.every((handle) => handle.isSettled())).toBe(true);
    expect(vi.mocked(rig.ui.setFishingState!).mock.calls).toHaveLength(fishingUiCalls);
    expect(rig.session.requestDayEvent).toHaveBeenCalledTimes(eventCalls);
    expect(rig.session.finishFishing).toHaveBeenCalledTimes(finishCalls);
    expect(rig.world.exitFishingView).toHaveBeenCalledTimes(exitCalls);
    expect(attempt.snapshot()).toEqual(beforeTeardown);
    expect(rig.realSession.snapshot()).toEqual(sessionBeforeTeardown);
    },
  );

  it('does not start the camera return after restart changes the lifecycle generation', async () => {
    const rig = createFishingRig({ onRestart: vi.fn() });
    rig.phase.start();
    rig.phase.handleAction('fish');
    await reachFishingTeardownStage(rig, 'result');
    const continueResult = rig.ui.onFishingResultContinue;

    rig.phase.requestRestart();
    continueResult?.();
    await flushPromises();

    expect(rig.world.exitFishingView).not.toHaveBeenCalled();
    rig.phase.dispose();
  });

  it('covers a scheduled day event and unlocks choices only after the reveal', async () => {
    const event = SURVIVAL_EVENTS.find(({ phase }) => phase === 'day')!;
    let current = snapshot();
    const calls: string[] = [];
    const cover = deferred();
    const uncover = deferred();
    const setEventSelection = vi.fn(() => { calls.push('selection'); });
    const requestDayEvent = vi.fn(() => {
      current = snapshot({ state: 'dayEvent', pendingEventId: event.id, actedToday: true });
      return accepted({ code: 'event-opened', cue: event.cue, deltas: {} });
    });
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => current), perform: vi.fn(() => accepted()), requestDayEvent },
      world: {
        play: vi.fn(async (cue) => { calls.push(cue); }),
        stageEvent: vi.fn(() => { calls.push('stage'); }),
        revealEvent: vi.fn(async () => { calls.push('reveal-tableau'); }),
        dispose: vi.fn(),
      },
      ui: {
        render: vi.fn(), showFeedback: vi.fn(), setBusy: vi.fn(), setJournalUnread: vi.fn(),
        beginEventPresentation: vi.fn(() => { calls.push('begin-event'); }),
        setSleepCovered: vi.fn((covered) => {
          calls.push(covered ? 'cover' : 'uncover');
          return covered ? cover.promise : uncover.promise;
        }),
        showEventReveal: vi.fn(async () => { calls.push('event'); }), dispose: vi.fn(),
        setEventSelection,
      },
    });

    phase.handleAction('dive');
    await flushPromises();

    expect(requestDayEvent).toHaveBeenCalledOnce();
    expect(calls).toEqual(['fish', 'begin-event', 'cover']);
    expect(setEventSelection).not.toHaveBeenCalled();

    cover.resolve();
    await flushPromises();
    expect(calls).toEqual([
      'fish', 'begin-event', 'cover', 'stage', 'event', 'reveal-tableau', 'uncover',
    ]);
    expect(setEventSelection).not.toHaveBeenCalled();

    uncover.resolve();
    await flushPromises();
    expect(calls).toEqual([
      'fish', 'begin-event', 'cover', 'stage', 'event',
      'reveal-tableau', 'uncover', 'selection',
    ]);
  });

  it('opens Drifting Loot after a resource-neutral day action and pays its successful cost', async () => {
    const session = new SurvivalSession(
      [{ instanceId: 'cannedFood-1', type: 'cannedFood' }],
      {
        seed: 202,
        random: sequenceRandom([0.999999, 0]),
        initial: { day: 3, hunger: 35, energy: 3 },
      },
    );
    const setEventSelection = vi.fn();
    const ui: Partial<SurvivalUI> = {
      render: vi.fn(),
      setJournalUnread: vi.fn(),
      setBusy: vi.fn(),
      beginEventPresentation: vi.fn(),
      setSleepCovered: vi.fn(() => Promise.resolve()),
      showEventReveal: vi.fn(() => Promise.resolve()),
      setEventSelection,
      playEventChoiceBeat: vi.fn(() => Promise.resolve()),
      showFeedback: vi.fn(),
      clearEventPresentation: vi.fn(),
      restoreCommandFocus: vi.fn(),
      dispose: vi.fn(),
    };
    const phase = SurvivalPhase.forTest({
      session,
      world: {
        play: vi.fn(() => Promise.resolve()),
        stageEvent: vi.fn(),
        revealEvent: vi.fn(() => Promise.resolve()),
        reactToEventOutcome: vi.fn(() => Promise.resolve()),
        clearEvent: vi.fn(),
        dispose: vi.fn(),
      },
      ui,
    });
    phase.start();

    phase.handleAction('eat');
    await flushPromises();
    await flushPromises();

    expect(session.snapshot()).toMatchObject({
      state: 'dayEvent',
      pendingEventId: 'drifting-loot',
      energy: 3,
    });
    expect(setEventSelection).toHaveBeenCalled();
    ui.onEventChoice?.('retrieve');
    await flushPromises();
    expect(session.snapshot()).toMatchObject({
      state: 'day',
      pendingEventId: null,
      energy: 0,
      food: 2,
    });
  });

  it('stages a committed night event under cover before revealing choices', async () => {
    const event = SURVIVAL_EVENTS.find(({ phase }) => phase === 'night')!;
    let current = snapshot();
    const calls: string[] = [];
    const cover = deferred();
    const tableauReveal = deferred();
    const uncover = deferred();
    const perform = vi.fn(() => {
      current = snapshot({ state: 'nightEvent', pendingEventId: event.id });
      return accepted({ code: 'event-opened', cue: 'nightfall', deltas: {} });
    });
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => current), perform },
      world: {
        play: vi.fn(async (cue) => { calls.push(cue); }),
        stageEvent: vi.fn(() => { calls.push('stage'); }),
        revealEvent: vi.fn(() => {
          calls.push('reveal-tableau');
          return tableauReveal.promise;
        }),
        dispose: vi.fn(),
      },
      ui: {
        beginEventPresentation: vi.fn(() => { calls.push('begin-event'); }),
        setSleepCovered: vi.fn((covered) => {
          calls.push(covered ? 'cover' : 'uncover');
          return covered ? cover.promise : uncover.promise;
        }),
        setBusy: vi.fn(), render: vi.fn(), showEventReveal: vi.fn(async () => { calls.push('caption'); }),
        setEventSelection: vi.fn(() => { calls.push('selection'); }),
        setJournalUnread: vi.fn(), dispose: vi.fn(),
      },
    });
    phase.handleAction('endDay');
    await flushPromises();
    expect(calls).toEqual(['begin-event', 'nightfall', 'cover']);

    cover.resolve();
    await flushPromises();
    expect(calls).toEqual([
      'begin-event', 'nightfall', 'cover', 'stage', 'caption', 'reveal-tableau', 'uncover',
    ]);

    tableauReveal.resolve();
    await flushPromises();
    expect(calls).not.toContain('selection');

    uncover.resolve();
    await flushPromises();
    expect(calls.at(-1)).toBe('selection');
  });

  it('keeps reveal ordering when reduced motion settles each transition immediately', async () => {
    const event = SURVIVAL_EVENTS.find(({ phase }) => phase === 'night')!;
    let current = snapshot();
    const calls: string[] = [];
    const phase = SurvivalPhase.forTest({
      reducedMotion: true,
      session: {
        snapshot: vi.fn(() => current),
        perform: vi.fn(() => {
          current = snapshot({ state: 'nightEvent', pendingEventId: event.id });
          return accepted({ code: 'event-opened', cue: 'nightfall', deltas: {} });
        }),
      },
      world: {
        play: vi.fn(async (cue) => { calls.push(cue); }),
        stageEvent: vi.fn(() => { calls.push('stage'); }),
        revealEvent: vi.fn(async () => { calls.push('reveal-tableau'); }),
        dispose: vi.fn(),
      },
      ui: {
        beginEventPresentation: vi.fn(() => { calls.push('begin-event'); }),
        setSleepCovered: vi.fn(async (covered) => { calls.push(covered ? 'cover' : 'uncover'); }),
        showEventReveal: vi.fn(async () => { calls.push('caption'); }),
        setEventSelection: vi.fn(() => { calls.push('selection'); }),
        setBusy: vi.fn(), render: vi.fn(), setJournalUnread: vi.fn(), dispose: vi.fn(),
      },
    });

    phase.handleAction('endDay');
    await flushPromises();

    expect(calls).toEqual([
      'begin-event', 'nightfall', 'cover', 'stage', 'caption',
      'reveal-tableau', 'uncover', 'selection',
    ]);
  });

  it('restores contextual choices when session resolution rejects the choice', async () => {
    const event = SURVIVAL_EVENTS.find(({ id }) => id === 'drifting-loot')!;
    const current = snapshot({
      state: 'dayEvent',
      pendingEventId: event.id,
      energy: 3,
    });
    const rejected = { ...accepted(), accepted: false, code: 'requirements-unmet' };
    const resolveEvent = vi.fn(() => rejected);
    const setEventSelection = vi.fn();
    const setBusy = vi.fn();
    const showFeedback = vi.fn();
    const ui: Partial<SurvivalUI> = {
      beginEventPresentation: vi.fn(),
      setSleepCovered: vi.fn(() => Promise.resolve()),
      showEventReveal: vi.fn(() => Promise.resolve()),
      setEventSelection,
      setBusy,
      showFeedback,
      dispose: vi.fn(),
    };
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => current), resolveEvent },
      world: { revealEvent: vi.fn(() => Promise.resolve()), dispose: vi.fn() },
      ui,
    });
    phase.start();
    await flushPromises();

    ui.onEventChoice?.('retrieve');
    await flushPromises();

    expect(resolveEvent).toHaveBeenCalledWith({ kind: 'choice', choiceId: 'retrieve' });
    expect(showFeedback).toHaveBeenCalledWith(rejected);
    expect(setEventSelection).toHaveBeenCalledTimes(2);
    expect(setEventSelection.mock.calls[1]![1]).toEqual([
      { id: 'retrieve', label: 'Retrieve It', unavailableReason: null },
      { id: 'sleep', label: 'Let It Drift', unavailableReason: null },
    ]);
    expect(setBusy).toHaveBeenLastCalledWith(false);
  });

  it('finishes the contextual press beat before resolving and reacting', async () => {
    const event = SURVIVAL_EVENTS.find(({ id }) => id === 'drifting-loot')!;
    let current = snapshot({
      state: 'dayEvent',
      pendingEventId: event.id,
      energy: 3,
    });
    const calls: string[] = [];
    const beat = deferred();
    const resolveEvent = vi.fn(() => {
      calls.push('resolve');
      current = snapshot({ state: 'day', pendingEventId: null, energy: 0 });
      return accepted({ code: 'event-resolved', cue: 'none', deltas: { energy: -3 } });
    });
    const ui: Partial<SurvivalUI> = {
      beginEventPresentation: vi.fn(),
      setSleepCovered: vi.fn(() => Promise.resolve()),
      showEventReveal: vi.fn(() => Promise.resolve()),
      setEventSelection: vi.fn(),
      playEventChoiceBeat: vi.fn(() => {
        calls.push('press');
        return beat.promise;
      }),
      setBusy: vi.fn(),
      showFeedback: vi.fn(),
      render: vi.fn(),
      setJournalUnread: vi.fn(),
      clearEventPresentation: vi.fn(),
      restoreCommandFocus: vi.fn(),
      dispose: vi.fn(),
    };
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => current), resolveEvent },
      world: {
        revealEvent: vi.fn(() => Promise.resolve()),
        reactToEventOutcome: vi.fn(() => {
          calls.push('react');
          return Promise.resolve();
        }),
        play: vi.fn(() => Promise.resolve()),
        clearEvent: vi.fn(),
        dispose: vi.fn(),
      },
      ui,
    });
    phase.start();
    await flushPromises();

    ui.onEventChoice?.('retrieve');
    await flushPromises();
    expect(calls).toEqual(['press']);
    expect(resolveEvent).not.toHaveBeenCalled();

    beat.resolve();
    await flushPromises();
    expect(calls.slice(0, 3)).toEqual(['press', 'resolve', 'react']);
  });

  it('does not resolve after disposal cancels a pending contextual press beat', async () => {
    const event = SURVIVAL_EVENTS.find(({ id }) => id === 'drifting-loot')!;
    const beat = deferred();
    const resolveEvent = vi.fn();
    const ui: Partial<SurvivalUI> = {
      beginEventPresentation: vi.fn(),
      setSleepCovered: vi.fn(() => Promise.resolve()),
      showEventReveal: vi.fn(() => Promise.resolve()),
      setEventSelection: vi.fn(),
      playEventChoiceBeat: vi.fn(() => beat.promise),
      setBusy: vi.fn(),
      clearEventPresentation: vi.fn(),
      dispose: vi.fn(),
    };
    const phase = SurvivalPhase.forTest({
      session: {
        snapshot: vi.fn(() => snapshot({
          state: 'dayEvent',
          pendingEventId: event.id,
          energy: 3,
        })),
        resolveEvent,
      },
      world: { revealEvent: vi.fn(() => Promise.resolve()), dispose: vi.fn() },
      ui,
    });
    phase.start();
    await flushPromises();
    ui.onEventChoice?.('retrieve');
    await flushPromises();

    phase.dispose();
    beat.resolve();
    await flushPromises();

    expect(resolveEvent).not.toHaveBeenCalled();
  });

  it('explains unmet resource requirements in contextual choice view models', async () => {
    const event = SURVIVAL_EVENTS.find(({ id }) => id === 'drifting-loot')!;
    const setEventSelection = vi.fn();
    const phase = SurvivalPhase.forTest({
      session: {
        snapshot: vi.fn(() => snapshot({
          state: 'dayEvent',
          pendingEventId: event.id,
          energy: 2,
        })),
      },
      world: { revealEvent: vi.fn(() => Promise.resolve()), dispose: vi.fn() },
      ui: {
        beginEventPresentation: vi.fn(),
        setSleepCovered: vi.fn(() => Promise.resolve()),
        showEventReveal: vi.fn(() => Promise.resolve()),
        setEventSelection,
        setBusy: vi.fn(),
        dispose: vi.fn(),
      },
    });

    phase.start();
    await flushPromises();

    expect(setEventSelection.mock.calls[0]![1]).toEqual([
      {
        id: 'retrieve',
        label: 'Retrieve It',
        unavailableReason: 'Requires 3 energy; you have 2.',
      },
      { id: 'sleep', label: 'Let It Drift', unavailableReason: null },
    ]);
  });

  it('holds a resolved night event, then advances and renders only while covered', async () => {
    const event = SURVIVAL_EVENTS.find(({ id }) => id === 'drifting-bottle')!;
    let current = snapshot({ state: 'nightEvent', pendingEventId: event.id });
    const calls: string[] = [];
    const outcomeCue = deferred();
    const tableauReaction = deferred();
    const outcomeHold = deferred();
    const cover = deferred();
    const uncover = deferred();
    let trackExit = false;
    const setBusy = vi.fn();
    const ui: Partial<SurvivalUI> = {
      beginEventPresentation: vi.fn(),
      setSleepCovered: vi.fn((covered) => {
        if (!trackExit) return Promise.resolve();
        calls.push(covered ? 'cover' : 'uncover');
        return covered ? cover.promise : uncover.promise;
      }),
      showEventReveal: vi.fn(() => Promise.resolve()),
      setEventSelection: vi.fn(),
      setBusy,
      showFeedback: vi.fn(() => { calls.push('feedback'); }),
      holdEventOutcome: vi.fn(() => {
        calls.push('hold');
        return outcomeHold.promise;
      }),
      render: vi.fn((rendered) => {
        if (trackExit) calls.push(`render:${rendered.state}`);
      }),
      setJournalUnread: vi.fn(),
      restoreCommandFocus: vi.fn(),
      dispose: vi.fn(),
    };
    const outcome = accepted({ code: 'event-resolved', cue: 'impact' });
    const phase = SurvivalPhase.forTest({
      session: {
        snapshot: vi.fn(() => current),
        resolveEvent: vi.fn(() => {
          calls.push('resolve');
          current = snapshot({ state: 'nightEvent', pendingEventId: null });
          return outcome;
        }),
        beginDawn: vi.fn(() => {
          calls.push('dawn');
          current = snapshot({ state: 'day', day: 2 });
          return accepted({ code: 'dawn', cue: 'dawn' });
        }),
      },
      world: {
        revealEvent: vi.fn(() => Promise.resolve()),
        reactToEventOutcome: vi.fn((eventId) => {
          calls.push('react');
          expect(eventId).toBe(event.id);
          return tableauReaction.promise;
        }),
        clearEvent: vi.fn(() => { calls.push('clear'); }),
        syncInventory: vi.fn((synced) => {
          if (trackExit) calls.push(`inventory:${synced.state}`);
        }),
        play: vi.fn((cue) => {
          calls.push(cue === 'impact' ? 'cue' : 'dawn-cue');
          return cue === 'impact' ? outcomeCue.promise : Promise.resolve();
        }),
        dispose: vi.fn(),
      },
      ui,
    });
    phase.start();
    await flushPromises();
    calls.length = 0;
    setBusy.mockClear();
    trackExit = true;

    ui.onEventChoice?.('retrieve');
    await flushPromises();

    expect(calls).toEqual(['resolve', 'cue', 'react']);
    outcomeCue.resolve();
    await flushPromises();
    expect(calls).toEqual(['resolve', 'cue', 'react']);

    tableauReaction.resolve();
    await flushPromises();
    expect(calls).toEqual(['resolve', 'cue', 'react', 'feedback', 'hold']);

    outcomeHold.resolve();
    await flushPromises();
    expect(calls.at(-1)).toBe('cover');
    expect(calls).not.toContain('clear');
    expect(calls).not.toContain('dawn');

    cover.resolve();
    await flushPromises();
    expect(calls).toEqual([
      'resolve', 'cue', 'react', 'feedback', 'hold', 'cover',
      'clear', 'dawn', 'dawn-cue', 'render:day', 'inventory:day', 'uncover',
    ]);
    for (const mutation of ['clear', 'dawn', 'render:day', 'inventory:day']) {
      expect(calls.indexOf(mutation)).toBeGreaterThan(calls.indexOf('cover'));
      expect(calls.indexOf(mutation)).toBeLessThan(calls.indexOf('uncover'));
    }
    expect(setBusy).not.toHaveBeenLastCalledWith(false);

    uncover.resolve();
    await flushPromises();
    expect(setBusy).toHaveBeenLastCalledWith(false);
  });

  it('renders a resolved day event under black without beginning dawn', async () => {
    const event = SURVIVAL_EVENTS.find(({ phase }) => phase === 'day')!;
    let current = snapshot({ state: 'dayEvent', pendingEventId: event.id });
    const calls: string[] = [];
    const outcomeHold = deferred();
    const cover = deferred();
    const uncover = deferred();
    let trackExit = false;
    const beginDawn = vi.fn();
    const phase = SurvivalPhase.forTest({
      session: {
        snapshot: vi.fn(() => current),
        resolveEvent: vi.fn(() => {
          current = snapshot({ state: 'day', pendingEventId: null });
          return accepted({ code: 'event-resolved', cue: 'impact' });
        }),
        beginDawn,
      },
      world: {
        revealEvent: vi.fn(() => Promise.resolve()),
        play: vi.fn(() => Promise.resolve()),
        reactToEventOutcome: vi.fn(() => Promise.resolve()),
        clearEvent: vi.fn(() => { calls.push('clear'); }),
        syncInventory: vi.fn((synced) => {
          if (trackExit) calls.push(`inventory:${synced.state}`);
        }),
        dispose: vi.fn(),
      },
      ui: {
        beginEventPresentation: vi.fn(),
        setSleepCovered: vi.fn((covered) => {
          if (!trackExit) return Promise.resolve();
          calls.push(covered ? 'cover' : 'uncover');
          return covered ? cover.promise : uncover.promise;
        }),
        showEventReveal: vi.fn(() => Promise.resolve()),
        setEventSelection: vi.fn(),
        setBusy: vi.fn(),
        showFeedback: vi.fn(() => { calls.push('feedback'); }),
        holdEventOutcome: vi.fn(() => {
          calls.push('hold');
          return outcomeHold.promise;
        }),
        render: vi.fn((rendered) => {
          if (trackExit) calls.push(`render:${rendered.state}`);
        }),
        setJournalUnread: vi.fn(),
        restoreCommandFocus: vi.fn(),
        dispose: vi.fn(),
      },
    });
    phase.start();
    await flushPromises();
    calls.length = 0;
    trackExit = true;

    phase.handleEndure();
    await flushPromises();
    expect(calls).toEqual(['feedback', 'hold']);

    outcomeHold.resolve();
    await flushPromises();
    expect(calls).toEqual(['feedback', 'hold', 'cover']);

    cover.resolve();
    await flushPromises();
    expect(calls).toEqual([
      'feedback', 'hold', 'cover', 'clear', 'render:day', 'inventory:day', 'uncover',
    ]);
    expect(beginDawn).not.toHaveBeenCalled();
    expect(calls.indexOf('render:day')).toBeGreaterThan(calls.indexOf('cover'));
    expect(calls.indexOf('render:day')).toBeLessThan(calls.indexOf('uncover'));

    uncover.resolve();
    await flushPromises();
  });

  it.each([
    ['dispose', 'hold'],
    ['restart', 'hold'],
    ['dispose', 'cover'],
    ['restart', 'cover'],
  ] as const)(
    'does not continue a resolved event after %s supersedes its pending %s',
    async (teardown, pendingStep) => {
      const event = SURVIVAL_EVENTS.find(({ id }) => id === 'drifting-bottle')!;
      let current = snapshot({ state: 'nightEvent', pendingEventId: event.id });
      const outcomeHold = deferred();
      const cover = deferred();
      let trackExit = false;
      const clearEvent = vi.fn();
      const beginDawn = vi.fn(() => {
        current = snapshot({ state: 'day', day: 2 });
        return accepted({ code: 'dawn', cue: 'dawn' });
      });
      const render = vi.fn();
      const holdEventOutcome = vi.fn(() => outcomeHold.promise);
      const setSleepCovered = vi.fn((covered: boolean) => (
        trackExit && covered ? cover.promise : Promise.resolve()
      ));
      const onRestart = vi.fn();
      const phase = SurvivalPhase.forTest({
        session: {
          snapshot: vi.fn(() => current),
          resolveEvent: vi.fn(() => {
            current = snapshot({ state: 'nightEvent', pendingEventId: null });
            return accepted({ code: 'event-resolved', cue: 'impact' });
          }),
          beginDawn,
        },
        world: {
          revealEvent: vi.fn(() => Promise.resolve()),
          play: vi.fn(() => Promise.resolve()),
          reactToEventOutcome: vi.fn(() => Promise.resolve()),
          clearEvent,
          dispose: vi.fn(),
        },
        ui: {
          beginEventPresentation: vi.fn(),
          setSleepCovered,
          showEventReveal: vi.fn(() => Promise.resolve()),
          setEventSelection: vi.fn(),
          setBusy: vi.fn(),
          showFeedback: vi.fn(),
          holdEventOutcome,
          render,
          setJournalUnread: vi.fn(),
          restoreCommandFocus: vi.fn(),
          clearEventPresentation: vi.fn(),
          dispose: vi.fn(),
        },
        onRestart,
      });
      phase.start();
      await flushPromises();
      trackExit = true;

      phase.handleEndure();
      await flushPromises();
      expect(holdEventOutcome).toHaveBeenCalledOnce();

      if (pendingStep === 'cover') {
        outcomeHold.resolve();
        await flushPromises();
        expect(setSleepCovered).toHaveBeenLastCalledWith(true);
      }

      if (teardown === 'dispose') phase.dispose();
      else phase.requestRestart();
      clearEvent.mockClear();
      render.mockClear();
      setSleepCovered.mockClear();
      beginDawn.mockClear();

      if (pendingStep === 'hold') outcomeHold.resolve();
      else cover.resolve();
      await flushPromises();

      expect(clearEvent).not.toHaveBeenCalled();
      expect(beginDawn).not.toHaveBeenCalled();
      expect(render).not.toHaveBeenCalled();
      expect(setSleepCovered).not.toHaveBeenCalledWith(false);
      expect(onRestart).toHaveBeenCalledTimes(teardown === 'restart' ? 1 : 0);
    },
  );

  it('does not render stale dawn state when restart supersedes its pending cue', async () => {
    const event = SURVIVAL_EVENTS.find(({ id }) => id === 'drifting-bottle')!;
    let current = snapshot({ state: 'nightEvent', pendingEventId: event.id });
    const dawnCue = deferred();
    const render = vi.fn();
    const onRestart = vi.fn();
    const ui: Partial<SurvivalUI> = {
      beginEventPresentation: vi.fn(),
      setSleepCovered: vi.fn(() => Promise.resolve()),
      showEventReveal: vi.fn(() => Promise.resolve()),
      setEventSelection: vi.fn(),
      setBusy: vi.fn(),
      showFeedback: vi.fn(),
      render,
      setJournalUnread: vi.fn(),
      restoreCommandFocus: vi.fn(),
      clearEventPresentation: vi.fn(),
      dispose: vi.fn(),
    };
    const phase = SurvivalPhase.forTest({
      session: {
        snapshot: vi.fn(() => current),
        resolveEvent: vi.fn(() => {
          current = snapshot({ state: 'nightEvent', pendingEventId: null });
          return accepted({ code: 'event-resolved', cue: 'impact' });
        }),
        beginDawn: vi.fn(() => {
          current = snapshot({ state: 'day', day: 2 });
          return accepted({ code: 'dawn', cue: 'dawn' });
        }),
      },
      world: {
        revealEvent: vi.fn(() => Promise.resolve()),
        reactToEventOutcome: vi.fn(() => Promise.resolve()),
        play: vi.fn((cue) => cue === 'dawn' ? dawnCue.promise : Promise.resolve()),
        clearEvent: vi.fn(),
        dispose: vi.fn(),
      },
      ui,
      onRestart,
    });
    phase.start();
    await flushPromises();

    ui.onEventChoice?.('retrieve');
    await flushPromises();
    const rendersBeforeRestart = render.mock.calls.length;

    phase.requestRestart();
    dawnCue.resolve();
    await flushPromises();

    expect(onRestart).toHaveBeenCalledOnce();
    expect(render).toHaveBeenCalledTimes(rendersBeforeRestart);
  });

  it('integrates Swim Ring bottle recovery through reveal, inventory sync, reaction, and dawn', async () => {
    const calls: string[] = [];
    const session = new SurvivalSession(
      [{ instanceId: 'swimRing-1', type: 'swimRing' }],
      {
        seed: 201,
        random: sequenceRandom([0, 0]),
        initial: { day: 2 },
        initialEventId: 'drifting-bottle',
      },
    );
    const syncInventory = vi.fn((current: SurvivalSnapshot) => {
      const bottledPaper = current.inventory['bottledPaper-1']?.condition ?? 'absent';
      calls.push(`inventory:${current.state}:${bottledPaper}`);
    });
    const setEventSelection = vi.fn((
      _eligible: ReadonlyMap<ItemInstanceId, string>,
    ) => {
      calls.push('selection');
    });
    const phase = SurvivalPhase.forTest({
      session,
      world: {
        syncInventory,
        play: vi.fn(async (cue) => { calls.push(`cue:${cue}`); }),
        stageEvent: vi.fn(() => { calls.push('stage:drifting-bottle'); }),
        revealEvent: vi.fn(async () => { calls.push('reveal:drifting-bottle'); }),
        playEventItemUse: vi.fn(async () => { calls.push('use:swimRing-1'); }),
        reactToEventOutcome: vi.fn(async () => { calls.push('react:drifting-bottle'); }),
        clearEvent: vi.fn(() => { calls.push('clear:drifting-bottle'); }),
        dispose: vi.fn(),
      },
      ui: {
        render: vi.fn(),
        setJournalUnread: vi.fn(),
        setBusy: vi.fn(),
        beginEventPresentation: vi.fn(() => { calls.push('begin-event'); }),
        setSleepCovered: vi.fn(async (covered) => {
          calls.push(covered ? 'cover' : 'uncover');
        }),
        showEventReveal: vi.fn(async () => { calls.push('caption:drifting-bottle'); }),
        setEventSelection,
        setEventUsing: vi.fn(),
        showFeedback: vi.fn(() => { calls.push('feedback'); }),
        holdEventOutcome: vi.fn(() => {
          calls.push('hold');
          return Promise.resolve();
        }),
        clearEventPresentation: vi.fn(),
        restoreCommandFocus: vi.fn(),
        dispose: vi.fn(),
      },
    });

    phase.start();
    await flushPromises();

    expect([...setEventSelection.mock.calls[0]![0]]).toEqual([
      ['swimRing-1', 'swimRing'],
    ]);
    phase.handleEventItem('swimRing', 'swimRing-1');
    await flushPromises();
    await flushPromises();

    expect(session.snapshot()).toMatchObject({
      state: 'day',
      day: 3,
      inventory: {
        'swimRing-1': { condition: 'usable' },
        'bottledPaper-1': { condition: 'usable' },
      },
    });
    expect(calls).toContain('caption:drifting-bottle');
    expect(calls).toContain('inventory:day:usable');
    expect(calls.indexOf('cover')).toBeLessThan(calls.indexOf('stage:drifting-bottle'));
    expect(calls.indexOf('reveal:drifting-bottle')).toBeLessThan(calls.indexOf('selection'));
    expect(calls.indexOf('use:swimRing-1')).toBeLessThan(calls.indexOf('react:drifting-bottle'));
    expect(calls.indexOf('react:drifting-bottle')).toBeLessThan(calls.indexOf('feedback'));
    expect(calls.indexOf('feedback')).toBeLessThan(calls.indexOf('hold'));
    expect(calls.indexOf('hold')).toBeLessThan(calls.lastIndexOf('cover'));
    expect(calls.lastIndexOf('cover')).toBeLessThan(calls.indexOf('clear:drifting-bottle'));
    expect(calls.indexOf('clear:drifting-bottle')).toBeLessThan(calls.indexOf('cue:dawn'));
    expect(calls.indexOf('inventory:day:usable')).toBeLessThan(calls.lastIndexOf('uncover'));
  });

  it('keeps the Other People rescue tableau visible until phase disposal', async () => {
    const session = new SurvivalSession(
      [{ instanceId: 'flareGun-1', type: 'flareGun' }],
      {
        seed: 202,
        random: sequenceRandom([0]),
        initial: { day: 15, rescueProgress: 15 },
        initialEventId: 'other-people',
      },
    );
    let rescueTableauVisible = false;
    const clearEvent = vi.fn(() => {
      rescueTableauVisible = false;
    });
    const showEnding = vi.fn();
    const holdEventOutcome = vi.fn(() => Promise.resolve());
    const setSleepCovered = vi.fn(() => Promise.resolve());
    const world = {
      syncInventory: vi.fn(),
      play: vi.fn(() => Promise.resolve()),
      stageEvent: vi.fn((eventId: string) => {
        rescueTableauVisible = eventId === 'other-people';
      }),
      revealEvent: vi.fn(() => Promise.resolve()),
      playEventItemUse: vi.fn(() => Promise.resolve()),
      reactToEventOutcome: vi.fn(() => Promise.resolve()),
      clearEvent,
      dispose: vi.fn(),
    };
    const phase = SurvivalPhase.forTest({
      session,
      world,
      ui: {
        beginEventPresentation: vi.fn(),
        setSleepCovered,
        showEventReveal: vi.fn(() => Promise.resolve()),
        setEventSelection: vi.fn(),
        setEventUsing: vi.fn(),
        setBusy: vi.fn(),
        showFeedback: vi.fn(),
        holdEventOutcome,
        render: vi.fn(),
        setJournalUnread: vi.fn(),
        showEnding,
        clearEventPresentation: vi.fn(),
        dispose: vi.fn(),
      },
    });
    phase.start();
    await flushPromises();
    holdEventOutcome.mockClear();
    setSleepCovered.mockClear();

    phase.handleEventItem('flareGun', 'flareGun-1');
    await flushPromises();

    expect(session.snapshot()).toMatchObject({
      state: 'rescued',
      inventory: { 'flareGun-1': { condition: 'consumed' } },
    });
    expect(showEnding).toHaveBeenCalledOnce();
    expect(rescueTableauVisible).toBe(true);
    expect(clearEvent).not.toHaveBeenCalled();
    expect(holdEventOutcome).not.toHaveBeenCalled();
    expect(setSleepCovered).not.toHaveBeenCalledWith(true);

    phase.dispose();

    expect(clearEvent).toHaveBeenCalledOnce();
    expect(rescueTableauVisible).toBe(false);
    expect(world.dispose).toHaveBeenCalledOnce();
  });

  it('clears a staged tableau when disposed during its reveal', async () => {
    const event = SURVIVAL_EVENTS.find(({ phase }) => phase === 'night')!;
    const reveal = deferred();
    const setEventSelection = vi.fn();
    const clearEvent = vi.fn();
    const phase = SurvivalPhase.forTest({
      session: {
        snapshot: vi.fn(() => snapshot({ state: 'nightEvent', pendingEventId: event.id })),
      },
      world: {
        stageEvent: vi.fn(),
        revealEvent: vi.fn(() => reveal.promise),
        clearEvent,
        dispose: vi.fn(),
      },
      ui: {
        beginEventPresentation: vi.fn(),
        setSleepCovered: vi.fn(() => Promise.resolve()),
        showEventReveal: vi.fn(() => Promise.resolve()),
        setEventSelection,
        clearEventPresentation: vi.fn(),
        dispose: vi.fn(),
      },
    });
    phase.start();
    await flushPromises();

    phase.dispose();
    reveal.resolve();
    await flushPromises();

    expect(clearEvent).toHaveBeenCalledOnce();
    expect(setEventSelection).not.toHaveBeenCalled();
  });

  it('holds a quiet night under cover and begins dawn without a journal modal', async () => {
    const calls: string[] = [];
    let current = snapshot({ state: 'nightEvent', journalEntries: [completedEntry(1, { kind: 'quiet' })] });
    const beginDawn = vi.fn(() => {
      calls.push('begin-dawn');
      current = snapshot({ day: 2, state: 'day', journalEntries: current.journalEntries });
      return accepted({ code: 'dawn', cue: 'dawn', deltas: {} });
    });
    const showJournal = vi.fn();
    const phase = SurvivalPhase.forTest({
      session: {
        snapshot: vi.fn(() => current),
        perform: vi.fn(() => accepted({ code: 'quiet-night', cue: 'nightfall', deltas: {} })),
        beginDawn,
      },
      world: { play: vi.fn((cue) => { calls.push(cue); return Promise.resolve(); }), dispose: vi.fn() },
      ui: {
        setSleepCovered: vi.fn((covered) => {
          calls.push(covered ? 'cover' : 'uncover');
          return Promise.resolve();
        }),
        holdSleep: vi.fn(() => { calls.push('hold'); return Promise.resolve(); }),
        setBusy: vi.fn(), render: vi.fn(), setJournalUnread: vi.fn(), showJournal,
        restoreCommandFocus: vi.fn(), dispose: vi.fn(),
      },
    });
    phase.handleAction('endDay');
    await flushPromises();
    expect(beginDawn).toHaveBeenCalledOnce();
    expect(showJournal).not.toHaveBeenCalled();
    expect(calls).toEqual(['nightfall', 'cover', 'hold', 'begin-dawn', 'dawn', 'uncover']);
  });

  it.each(['dispose', 'restart'] as const)(
    'does not stage an event after %s supersedes its pending cover',
    async (teardown) => {
      const event = SURVIVAL_EVENTS.find(({ phase }) => phase === 'day')!;
      const cover = deferred();
      const showEventReveal = vi.fn(() => Promise.resolve());
      const setEventSelection = vi.fn();
      const onRestart = vi.fn();
      const phase = SurvivalPhase.forTest({
        session: {
          snapshot: vi.fn(() => snapshot({ state: 'dayEvent', pendingEventId: event.id })),
        },
        world: { dispose: vi.fn() },
        ui: {
          beginEventPresentation: vi.fn(),
          setSleepCovered: vi.fn(() => cover.promise),
          showEventReveal,
          setEventSelection,
          clearEventPresentation: vi.fn(),
          dispose: vi.fn(),
        },
        onRestart,
      });

      phase.start();
      await flushPromises();
      if (teardown === 'dispose') phase.dispose();
      else phase.requestRestart();
      cover.resolve();
      await flushPromises();

      expect(showEventReveal).not.toHaveBeenCalled();
      expect(setEventSelection).not.toHaveBeenCalled();
      expect(onRestart).toHaveBeenCalledTimes(teardown === 'restart' ? 1 : 0);
    },
  );

  it('selects the best hull repair resource and passes only repair options', () => {
    let current = snapshot({ bait: 1, repairMaterial: 1 });
    const perform = vi.fn(() => ({ ...accepted(), accepted: false }));
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => current), perform },
      world: { dispose: vi.fn() },
      ui: { showFeedback: vi.fn(), dispose: vi.fn() },
    });

    phase.handleAction('repair');
    current = snapshot({
      inventory: inventory({
        'ductTape-1': { instanceId: 'ductTape-1', type: 'ductTape', condition: 'usable' },
      }),
    });
    phase.handleAction('repair');

    expect(perform).toHaveBeenNthCalledWith(1, 'repair', { kind: 'hullRepair', material: 'repairMaterial' });
    expect(perform).toHaveBeenNthCalledWith(2, 'repair', { kind: 'hullRepair', material: 'ductTape' });
  });

  it('renders repair availability using the same selected resource as the command', () => {
    const availableReason = vi.fn((_action: string, option?: unknown) => (
      typeof option === 'object' && option !== null && 'kind' in option
        ? null
        : 'No repair material remains.'
    ));
    const render = vi.fn();
    const phase = SurvivalPhase.forTest({
      session: {
        snapshot: vi.fn(() => snapshot({
          inventory: inventory({
            'ductTape-1': { instanceId: 'ductTape-1', type: 'ductTape', condition: 'usable' },
          }),
        })),
        availableReason,
      },
      world: { dispose: vi.fn() },
      ui: { render, setJournalUnread: vi.fn(), dispose: vi.fn() },
    });

    phase.start();
    const unavailable = render.mock.calls[0]![1];

    expect(unavailable('repair')).toBeNull();
    expect(availableReason).toHaveBeenLastCalledWith(
      'repair',
      { kind: 'hullRepair', material: 'ductTape' },
    );
  });

  it('routes one eligible physical item through the presentation lock', async () => {
    const event = SURVIVAL_EVENTS.find(({ id }) => id === 'dangerous-waters')!;
    const cue = deferred();
    let current = snapshot({
      state: 'dayEvent',
      pendingEventId: event.id,
      inventory: inventory({
        'compass-1': { instanceId: 'compass-1', type: 'compass', condition: 'usable' },
      }),
    });
    const resolveEvent = vi.fn(() => accepted({ code: 'event-resolved', cue: 'impact' }));
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => current), resolveEvent },
      world: {
        play: vi.fn(() => Promise.resolve()),
        playEventItemUse: vi.fn(() => cue.promise),
        dispose: vi.fn(),
      },
      ui: {
        showEventReveal: vi.fn(() => Promise.resolve()),
        setEventSelection: vi.fn(),
        showFeedback: vi.fn(),
        setBusy: vi.fn(),
        dispose: vi.fn(),
      },
    });

    phase.start();
    await flushPromises();
    phase.handleEventItem('compass', 'compass-1');
    phase.handleEndure();
    expect(resolveEvent).not.toHaveBeenCalled();

    cue.resolve();
    await flushPromises();
    expect(resolveEvent).toHaveBeenCalledOnce();
    expect(resolveEvent).toHaveBeenCalledWith({
      kind: 'item',
      choiceId: 'compass',
      instanceId: 'compass-1',
    });
    current = snapshot({ state: 'day' });
  });

  it('shows an ending once and restarts only through its callback', () => {
    const restart = vi.fn();
    const showEnding = vi.fn();
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => snapshot({ state: 'sunk', day: 6, seed: 8 })) },
      world: { update: vi.fn(), dispose: vi.fn() },
      ui: { render: vi.fn(), showEnding, dispose: vi.fn() },
      onRestart: restart,
    });

    phase.update(1, 0.016);
    phase.update(2, 0.016);

    expect(showEnding).toHaveBeenCalledOnce();
    expect(showEnding).toHaveBeenCalledWith('sunk', 6, 8, expect.any(Number));
    phase.requestRestart();
    phase.requestRestart();
    expect(restart).toHaveBeenCalledOnce();
  });

  it('shows a terminal daytime ending only after its cue completes', async () => {
    let current = snapshot();
    const cue = deferred();
    const showEnding = vi.fn();
    const phase = SurvivalPhase.forTest({
      session: {
        snapshot: vi.fn(() => current),
        perform: vi.fn(() => {
          current = snapshot({ state: 'sunk', day: 4 });
          return accepted({ code: 'boat-sunk', cue: 'sinking', deltas: { hull: -100 } });
        }),
      },
      world: { play: vi.fn(() => cue.promise), dispose: vi.fn() },
      ui: { showFeedback: vi.fn(), setBusy: vi.fn(), showEnding, render: vi.fn(), dispose: vi.fn() },
    });

    phase.handleAction('dive');
    expect(showEnding).not.toHaveBeenCalled();
    cue.resolve();
    await flushPromises();
    expect(showEnding).toHaveBeenCalledOnce();
  });

  it.each([
    ['dayEvent', false],
    ['nightEvent', true],
  ] as const)('resolves %s and calls dawn only for night events', async (state, expectsDawn) => {
    const event = SURVIVAL_EVENTS.find(({ phase }) => phase === (state === 'dayEvent' ? 'day' : 'night'))!;
    let current = snapshot({ state, pendingEventId: event.id });
    const beginDawn = vi.fn(() => {
      current = snapshot({ state: 'day', day: 2 });
      return accepted({ code: 'dawn', cue: 'dawn' });
    });
    const phase = SurvivalPhase.forTest({
      session: {
        snapshot: vi.fn(() => current),
        resolveEvent: vi.fn(() => {
          current = snapshot({ state: state === 'dayEvent' ? 'day' : 'nightEvent' });
          return accepted({ code: 'event-resolved', cue: 'impact' });
        }),
        beginDawn,
      },
      world: { play: vi.fn(() => Promise.resolve()), dispose: vi.fn() },
      ui: {
        showEventReveal: vi.fn(() => Promise.resolve()), setEventSelection: vi.fn(),
        showFeedback: vi.fn(), setBusy: vi.fn(), render: vi.fn(),
        setJournalUnread: vi.fn(), restoreCommandFocus: vi.fn(), dispose: vi.fn(),
      },
    });
    phase.start();
    await flushPromises();
    phase.handleEndure();
    await flushPromises();
    expect(beginDawn).toHaveBeenCalledTimes(expectsDawn ? 1 : 0);
  });

  it('shows a terminal night ending after its cue and skips dawn', async () => {
    const event = SURVIVAL_EVENTS.find(({ phase }) => phase === 'night')!;
    let current = snapshot({ state: 'nightEvent', pendingEventId: event.id, day: 5 });
    const beginDawn = vi.fn();
    const showEnding = vi.fn();
    const phase = SurvivalPhase.forTest({
      session: {
        snapshot: vi.fn(() => current),
        resolveEvent: vi.fn(() => {
          current = snapshot({ state: 'sunk', day: 5, journalEntries: [completedEntry(5)] });
          return accepted({ code: 'event-resolved', cue: 'sinking' });
        }),
        beginDawn,
      },
      world: { play: vi.fn(() => Promise.resolve()), dispose: vi.fn() },
      ui: {
        showEventReveal: vi.fn(() => Promise.resolve()), setEventSelection: vi.fn(),
        showFeedback: vi.fn(), setBusy: vi.fn(), render: vi.fn(),
        setJournalUnread: vi.fn(), showEnding, dispose: vi.fn(),
      },
    });
    phase.start();
    await flushPromises();
    phase.handleEndure();
    await flushPromises();
    expect(showEnding).toHaveBeenCalledOnce();
    expect(beginDawn).not.toHaveBeenCalled();
  });

  it('marks completed history unread and clears it when the journal opens', () => {
    const entries = [completedEntry(1)];
    const setJournalUnread = vi.fn();
    const showJournal = vi.fn();
    const beginDawn = vi.fn();
    const ui: Partial<SurvivalUI> = { render: vi.fn(), setJournalUnread, showJournal, dispose: vi.fn() };
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => snapshot({ day: 2, journalEntries: entries })), beginDawn },
      world: { dispose: vi.fn() },
      ui,
    });
    phase.start();
    expect(setJournalUnread).toHaveBeenLastCalledWith(true);
    ui.onJournalOpen?.();
    expect(showJournal).toHaveBeenCalledWith(entries);
    expect(setJournalUnread).toHaveBeenLastCalledWith(false);
    expect(beginDawn).not.toHaveBeenCalled();
  });

  it('pauses while hidden and requires the UI resume action before updates continue', () => {
    const listeners = new Map<string, EventListener>();
    const fakeDocument = {
      hidden: false,
      addEventListener: vi.fn((type: string, listener: EventListener) => listeners.set(type, listener)),
      removeEventListener: vi.fn((type: string) => listeners.delete(type)),
    };
    vi.stubGlobal('document', fakeDocument);
    const update = vi.fn();
    const setPaused = vi.fn();
    const ui: Record<string, unknown> = { render: vi.fn(), setPaused, setJournalUnread: vi.fn(), dispose: vi.fn() };
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => snapshot()) },
      world: { update, setPhase: vi.fn(), setWeather: vi.fn(), dispose: vi.fn() }, ui,
    });
    phase.start();
    phase.update(1, 0.016);
    expect(update).toHaveBeenCalledOnce();
    fakeDocument.hidden = true;
    listeners.get('visibilitychange')!(new Event('visibilitychange'));
    phase.update(2, 0.016);
    expect(setPaused).toHaveBeenCalledWith(true);
    expect(update).toHaveBeenCalledOnce();
    fakeDocument.hidden = false;
    (ui.onPauseChange as (paused: boolean) => void)(false);
    phase.update(3, 0.016);
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('wires command, pause, journal, and restart callbacks without legacy camera input', () => {
    const perform = vi.fn(() => ({ ...accepted(), accepted: false }));
    const restart = vi.fn();
    const ui: Record<string, unknown> = {
      showFeedback: vi.fn(),
      showJournal: vi.fn(),
      setJournalUnread: vi.fn(),
      dispose: vi.fn(),
    };
    SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => snapshot()), perform },
      world: { dispose: vi.fn() },
      ui,
      onRestart: restart,
    });
    (ui.onAction as (action: 'dive') => void)('dive');
    (ui.onPauseChange as (paused: boolean) => void)(true);
    (ui.onRestart as () => void)();
    expect(perform).toHaveBeenCalledWith('dive', undefined);
    expect(restart).toHaveBeenCalledOnce();
    expect(ui).not.toHaveProperty('onPointer');
    expect(ui).not.toHaveProperty('onContinue');
    expect(ui).not.toHaveProperty('onJournalContinue');
    expect(ui).not.toHaveProperty('onSkip');
  });

  it('relays item highlight identity to the world and ignores it after disposal', () => {
    const setHighlightedItem = vi.fn();
    const ui: Partial<SurvivalUI> = { dispose: vi.fn() };
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => snapshot()) },
      world: { setHighlightedItem, dispose: vi.fn() }, ui,
    });
    ui.onAnchorHighlight?.('bucket-1');
    ui.onAnchorHighlight?.(null);
    expect(setHighlightedItem.mock.calls).toEqual([['bucket-1'], [null]]);
    phase.dispose();
    ui.onAnchorHighlight?.('bucket-1');
    expect(setHighlightedItem).toHaveBeenCalledTimes(2);
  });

  it('ignores async sequence completion after disposal and disposes owned resources once', async () => {
    const cue = deferred();
    const worldDispose = vi.fn();
    const uiDispose = vi.fn();
    const setBusy = vi.fn();
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => snapshot()), perform: vi.fn(() => accepted()) },
      world: { play: vi.fn(() => cue.promise), dispose: worldDispose },
      ui: { showFeedback: vi.fn(), setBusy, render: vi.fn(), dispose: uiDispose },
    });
    phase.handleAction('dive');
    phase.dispose();
    phase.dispose();
    cue.resolve();
    await flushPromises();
    expect(setBusy).toHaveBeenCalledTimes(1);
    expect(worldDispose).toHaveBeenCalledOnce();
    expect(uiDispose).toHaveBeenCalledOnce();
  });
});
