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
import type { FishingUiState, SurvivalUI } from '../src/ui/SurvivalUI';
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
  readonly onRestart?: () => void;
}

function createFishingRig(options: FishingRigOptions = {}) {
  const calls: string[] = [];
  const savedItems: readonly ItemInstance[] = options.withBait
    ? [{ instanceId: 'baitTin-1', type: 'baitTin' as const }]
    : [];
  const realSession = new SurvivalSession(savedItems, {
    seed: 1,
    random: sequenceRandom([0, 0]),
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
    rig.phase.handleEventItem('unused-choice');
    rig.phase.handleEndure();
    rig.phase.handleJournalOpen();
    expect(rig.session.perform).not.toHaveBeenCalled();
    expect(rig.session.resolveEvent).not.toHaveBeenCalled();
    expect(rig.ui.showJournal).toBeUndefined();
    rig.world.setHighlightedItem.mockClear();
    rig.ui.onAnchorHighlight?.('baitTin-1');
    expect(rig.world.setHighlightedItem).not.toHaveBeenCalled();

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

  it('commits one reel before presentation and requests the day event only after return', async () => {
    const rig = createFishingRig({ withBait: true });
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

    rig.animations.reel.at(-1)!.resolve();
    await flushPromises();
    expect(rig.ui.setFishingState).toHaveBeenLastCalledWith({
      mode: 'result', message: 'CAUGHT COD', biteTarget: null,
    });
    expect(rig.world.exitFishingView).toHaveBeenCalledOnce();
    expect(rig.session.requestDayEvent).not.toHaveBeenCalled();
    rig.animations.exit.at(-1)!.resolve();
    await flushPromises();

    const exitIndex = rig.calls.indexOf('exitFishingView');
    const unlockIndex = rig.calls.indexOf('unlock');
    const eventIndex = rig.calls.indexOf('requestDayEvent');
    expect(presentationIndex).toBeLessThan(exitIndex);
    expect(exitIndex).toBeLessThan(unlockIndex);
    expect(unlockIndex).toBeLessThan(eventIndex);
    expect(rig.world.clearFishingPresentation).toHaveBeenCalledOnce();
    expect(rig.ui.setFishingState).toHaveBeenLastCalledWith({
      mode: 'hidden', message: '', biteTarget: null,
    });
    expect(rig.session.requestDayEvent).toHaveBeenCalledOnce();
    expect(rig.world.play).not.toHaveBeenCalled();

    rig.realSession.perform('endDay');
    expect(rig.realSession.snapshot().journalEntries[0]?.actions).toHaveLength(1);
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
    rig.animations.miss.at(-1)!.resolve();
    await flushPromises();
    expect(rig.ui.setFishingState).toHaveBeenLastCalledWith({
      mode: 'result', message: 'IT GOT AWAY', biteTarget: null,
    });
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

      expect(rig.session.requestDayEvent).toHaveBeenCalledOnce();
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
    const pendingHandles = Object.values(rig.animations)
      .flat()
      .filter((handle) => !handle.isSettled());

    if (teardown === 'restart') rig.phase.requestRestart();
    else rig.phase.dispose();
    rig.phase.dispose();
    await flushPromises();
    rig.phase.update(20, 20);

    expect(onRestart).toHaveBeenCalledTimes(teardown === 'restart' ? 1 : 0);
    expect(rig.world.dispose).toHaveBeenCalledOnce();
    expect(rig.ui.dispose).toHaveBeenCalledOnce();
    expect(pendingHandles.every((handle) => handle.isSettled())).toBe(true);
    expect(vi.mocked(rig.ui.setFishingState!).mock.calls).toHaveLength(fishingUiCalls);
    expect(rig.session.requestDayEvent).toHaveBeenCalledTimes(eventCalls);
    expect(rig.session.finishFishing).toHaveBeenCalledTimes(finishCalls);
    expect(attempt.snapshot()).toEqual(beforeTeardown);
    expect(rig.realSession.snapshot()).toEqual(sessionBeforeTeardown);
    },
  );

  it('plays a scheduled day event cue and opens it without a continuation gate', async () => {
    const event = SURVIVAL_EVENTS.find(({ phase }) => phase === 'day')!;
    let current = snapshot();
    const calls: string[] = [];
    const requestDayEvent = vi.fn(() => {
      current = snapshot({ state: 'dayEvent', pendingEventId: event.id, actedToday: true });
      return accepted({ code: 'event-opened', cue: event.cue, deltas: {} });
    });
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => current), perform: vi.fn(() => accepted()), requestDayEvent },
      world: { play: vi.fn(async (cue) => { calls.push(cue); }), dispose: vi.fn() },
      ui: {
        render: vi.fn(), showFeedback: vi.fn(), setBusy: vi.fn(), setJournalUnread: vi.fn(),
        showEvent: vi.fn(() => calls.push('event')), dispose: vi.fn(),
      },
    });

    phase.handleAction('dive');
    await flushPromises();

    expect(requestDayEvent).toHaveBeenCalledOnce();
    expect(calls).toEqual(['fish', event.cue, 'event']);
  });

  it('covers sleep before revealing a committed night event', async () => {
    const event = SURVIVAL_EVENTS.find(({ phase }) => phase === 'night')!;
    let current = snapshot();
    const calls: string[] = [];
    const perform = vi.fn(() => {
      current = snapshot({ state: 'nightEvent', pendingEventId: event.id });
      return accepted({ code: 'event-opened', cue: 'nightfall', deltas: {} });
    });
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => current), perform },
      world: { play: vi.fn(async () => { calls.push('nightfall'); }), dispose: vi.fn() },
      ui: {
        setSleepCovered: vi.fn(async (covered) => { calls.push(covered ? 'cover' : 'uncover'); }),
        setBusy: vi.fn(), render: vi.fn(), showEvent: vi.fn(() => { calls.push('event'); }),
        setJournalUnread: vi.fn(), dispose: vi.fn(),
      },
    });
    phase.handleAction('endDay');
    await flushPromises();
    expect(calls.indexOf('cover')).toBeLessThan(calls.indexOf('event'));
    expect(calls.indexOf('uncover')).toBeLessThan(calls.indexOf('event'));
  });

  it('holds a quiet night under cover and begins dawn without a journal modal', async () => {
    let current = snapshot({ state: 'nightEvent', journalEntries: [completedEntry(1, { kind: 'quiet' })] });
    const beginDawn = vi.fn(() => {
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
      world: { play: vi.fn(() => Promise.resolve()), dispose: vi.fn() },
      ui: {
        setSleepCovered: vi.fn(() => Promise.resolve()), holdSleep: vi.fn(() => Promise.resolve()),
        setBusy: vi.fn(), render: vi.fn(), setJournalUnread: vi.fn(), showJournal,
        restoreCommandFocus: vi.fn(), dispose: vi.fn(),
      },
    });
    phase.handleAction('endDay');
    await flushPromises();
    expect(beginDawn).toHaveBeenCalledOnce();
    expect(showJournal).not.toHaveBeenCalled();
  });

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

  it('routes item and endure event commands through the same presentation lock', async () => {
    const cue = deferred();
    const resolveEvent = vi.fn(() => accepted({ code: 'event-resolved', cue: 'impact' }));
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => snapshot({ state: 'dayEvent' })), resolveEvent },
      world: { play: vi.fn(() => cue.promise), dispose: vi.fn() },
      ui: { hideEvent: vi.fn(), showFeedback: vi.fn(), setBusy: vi.fn(), dispose: vi.fn() },
    });

    phase.handleEventItem('custom-event-choice');
    phase.handleEndure();
    expect(resolveEvent).toHaveBeenCalledOnce();
    expect(resolveEvent).toHaveBeenCalledWith('custom-event-choice');

    cue.resolve();
    await flushPromises();
    phase.handleEndure();
    expect(resolveEvent).toHaveBeenLastCalledWith(null);
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
    let current = snapshot({ state });
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
        hideEvent: vi.fn(), showFeedback: vi.fn(), setBusy: vi.fn(), render: vi.fn(),
        setJournalUnread: vi.fn(), restoreCommandFocus: vi.fn(), dispose: vi.fn(),
      },
    });
    phase.handleEndure();
    await flushPromises();
    expect(beginDawn).toHaveBeenCalledTimes(expectsDawn ? 1 : 0);
  });

  it('shows a terminal night ending after its cue and skips dawn', async () => {
    let current = snapshot({ state: 'nightEvent', day: 5 });
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
        hideEvent: vi.fn(), showFeedback: vi.fn(), setBusy: vi.fn(), render: vi.fn(),
        setJournalUnread: vi.fn(), showEnding, dispose: vi.fn(),
      },
    });
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
