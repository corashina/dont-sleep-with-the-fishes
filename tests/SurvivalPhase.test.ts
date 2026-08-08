// Importance: 5/5. Protects survival orchestration and lifecycle.
import { PerspectiveCamera, Scene } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SurvivalAudio } from '../src/audio/SurvivalAudio';
import type { PhaseContext } from '../src/app/GamePhase';
import type { AudioBackend, AudioVoice } from '../src/audio/AudioBackend';
import { AudioSystem } from '../src/audio/AudioSystem';
import type { SoundId } from '../src/audio/audioManifest';
import type { ItemInstance, ItemInstanceId } from '../src/game/ItemState';
import type { SceneRenderer } from '../src/rendering/SceneRenderer';
import type { ProjectedBoatBounds } from '../src/survival/BoatInteraction';
import { BoatWorld } from '../src/survival/BoatWorld';
import { SURVIVAL_EVENTS } from '../src/survival/events';
import { FISHING_CATCHES } from '../src/survival/fishingCatalog';
import type { FishingCastPoint } from '../src/survival/FishingSession';
import type { JournalEntry, JournalNightRecord } from '../src/survival/journal';
import {
  formatDangerousWatersOutcome,
  formatDiveResult,
  formatDriftingLootResult,
  formatEventResult,
  formatFishingResult,
  SurvivalPhase,
} from '../src/survival/SurvivalPhase';
import { deriveEventVariantSeed } from '../src/survival/eventPresentationOutcome';
import type { EventOutcomePresentation } from '../src/survival/eventPresentationTypes';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import type {
  RewardSummary,
  SurvivalInventorySnapshot,
  SurvivalItemState,
  SurvivalSnapshot,
  SurvivalState,
} from '../src/survival/survivalTypes';
import type {
  DiveResultView,
  DriftingLootResultView,
  FishingResultView,
  FishingUiState,
  SurvivalUI,
} from '../src/ui/SurvivalUI';
import type { PresentationWeatherId } from '../src/weather/presentationWeather';
import { createTestPropModels } from './helpers/propModels';
import { sequenceRandom } from './helpers/random';
import { createTestMoonTexture } from './helpers/skyAssets';

function inventory(
  overrides: Partial<Record<ItemInstanceId, SurvivalItemState>> = {},
): SurvivalInventorySnapshot {
  return overrides;
}

function snapshot(overrides: Partial<SurvivalSnapshot> = {}): SurvivalSnapshot {
  return {
    state: 'day', endingReason: 'standard', day: 1, pressure: 0, health: 100, hunger: 20, energy: 3, hull: 100,
    food: 0, bait: 0, recoveredFood: 0, recoveredBait: 0, repairMaterial: 0,
    rescueProgress: 0, chest: { state: 'none', acquiredDay: null },
    weather: 'calm', actedToday: false,
    journalEntries: [], inventory: inventory(), savedItems: [], captainWhiskers: null, pendingEventId: null,
    pendingEventTargetId: null,
    pendingDriftingLootVariant: null,
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

describe('formatFishingResult utility salvage', () => {
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
    }, accepted({
      code: 'utility-caught',
      deltas: catchId === 'bait' ? { bait: 1 } : {},
    }))).toMatchObject({ caption: 'UTILITY SALVAGE', title, detail });
  });
});

describe('formatDangerousWatersOutcome', () => {
  it('shows a clear route when the Hull does not change', () => {
    expect(formatDangerousWatersOutcome(accepted({ deltas: {} }))).toEqual({
      title: 'CLEAR WATER',
      detail: 'The route opens ahead.',
      result: 'HULL HOLDS',
      state: 'safe',
    });
  });

  it.each([
    [-7, 'damage', 'ROCK STRIKE'],
    [-25, 'severe', 'SEVERE ROCK STRIKE'],
  ] as const)('shows exact Hull loss for %s damage', (hull, state, result) => {
    expect(formatDangerousWatersOutcome(accepted({
      message: 'The rocks damage the boat.',
      deltas: { hull },
    }))).toEqual({
      title: `HULL \u2212${Math.abs(hull)}`,
      detail: 'The rocks damage the boat.',
      result,
      state,
    });
  });
});

describe('formatDiveResult', () => {
  it.each([
    [{ food: 1, energy: -3 }, { kind: 'resource', id: 'food', quantity: 1 }, []],
    [{ bait: 1, energy: -3 }, { kind: 'resource', id: 'bait', quantity: 1 }, []],
    [{ repairMaterial: 1, energy: -3 }, { kind: 'resource', id: 'repairMaterial', quantity: 1 }, []],
    [{ rescueProgress: 10, energy: -3 }, null, ['RESCUE PROGRESS +10']],
    [{ energy: -3 }, null, ['NOTHING FOUND']],
    [{ energy: -3, health: -10 }, null, ['NOTHING FOUND', 'YOU SUFFERED SOME INJURIES']],
  ] as const)('formats exact dive deltas', (deltas, reward, lines) => {
    expect(formatDiveResult(accepted({ deltas }))).toEqual({
      title: 'DIVE RESULT',
      reward,
      lines,
    });
  });

  it('shows the truthful applied loss for a low-health fatal injury', () => {
    expect(formatDiveResult(accepted({
      deltas: { energy: -3, health: -4 },
    }))).toEqual({
      title: 'DIVE RESULT',
      reward: null,
      lines: ['NOTHING FOUND', 'YOU SUFFERED SOME INJURIES'],
    });
  });

  it('passes an item reward to the result paper', () => {
    const rewardSummary = { kind: 'item', id: 'energyBar', quantity: 1 } as const;
    expect(formatDiveResult(accepted({ deltas: { energy: -3 }, rewardSummary }))).toEqual({
      title: 'DIVE RESULT',
      reward: rewardSummary,
      lines: [],
    });
  });
});

describe('SurvivalPhase test context', () => {
  it('includes an empty event model library', () => {
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => snapshot()) },
      world: { dispose: vi.fn() },
      ui: { dispose: vi.fn() },
    });
    const context = (phase as unknown as { context: PhaseContext }).context;

    expect(context.supernaturalEventModels.animations('ghost')).toEqual([]);
    phase.dispose();
  });
});

describe('formatEventResult', () => {
  const result = (
    overrides: Partial<EventOutcomePresentation> = {},
  ): EventOutcomePresentation => ({
    outcome: accepted({ message: 'The event settles.', deltas: {} }),
    resourceDeltas: {},
    brokenInstanceIds: [],
    lostInstanceIds: [],
    consumedInstanceIds: [],
    selectedInstanceId: null,
    selectedCondition: null,
    targetInstanceId: null,
    ...overrides,
  });

  it('lists exact resource and broken-item changes', () => {
    expect(formatEventResult(result({
      resourceDeltas: { food: 3 },
      brokenInstanceIds: ['bucket-1'],
    })).lines).toEqual([
      'FOOD +3',
      'BUCKET BROKEN',
    ]);
  });

  it('lists hull damage and exact lost and consumed items', () => {
    expect(formatEventResult(result({
      resourceDeltas: { hull: -18 },
      lostInstanceIds: ['map-1', 'swimRing-1'],
      consumedInstanceIds: ['ductTape-1'],
    })).lines).toEqual([
      'HULL -18',
      'MAP LOST',
      'SWIM RING LOST',
      'DUCT TAPE CONSUMED',
    ]);
  });
});

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
  const cancelFishing = vi.fn((...args: Parameters<SurvivalSession['cancelFishing']>) => {
    calls.push('cancelFishing');
    return realSession.cancelFishing(...args);
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
    cancelFishing,
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
  const catchTarget: ProjectedBoatBounds = Object.freeze({
    x: 410, y: 290, width: 96, height: 54, depth: 1.8, visible: true,
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
    projectFishingCatch: vi.fn(() => catchTarget),
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
    setFishingViewExitVisible: vi.fn((visible: boolean) => {
      calls.push(visible ? 'showFishingViewExit' : 'hideFishingViewExit');
    }),
    restoreCommandFocus: vi.fn(() => calls.push('restoreCommandFocus')),
    dispose: vi.fn(() => {
      for (const handle of animations.fade) handle.resolve();
    }),
  };
  const phase = SurvivalPhase.forTest({
    session,
    world,
    ui,
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
    catchTarget,
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
  expect(rig.animations.enter).toHaveLength(1);
  rig.animations.enter.at(-1)!.resolve();
  await flushPromises();
}

async function completeFishingCast(rig: FishingRig): Promise<void> {
  rig.animations.cast.at(-1)!.resolve();
  await flushPromises();
}

async function settleFishingReturn(
  rig: FishingRig,
  resultAnimation: 'reel' | 'miss',
): Promise<void> {
  rig.animations[resultAnimation].at(-1)!.resolve();
  await flushPromises();
  rig.ui.onFishingResultContinue?.();
  rig.ui.onFishingResultContinue?.();
  expect(rig.animations.exit).toHaveLength(0);
  rig.ui.onFishingViewExit?.();
  rig.ui.onFishingViewExit?.();
  expect(rig.animations.exit).toHaveLength(1);
  rig.animations.exit[0]!.resolve();
  await flushPromises();
}

type FishingTeardownStage =
  | 'entering'
  | 'aiming'
  | 'casting'
  | 'waiting'
  | 'bite'
  | 'reeling'
  | 'missing'
  | 'result'
  | 'returning';

async function reachFishingTeardownStage(
  rig: FishingRig,
  stage: FishingTeardownStage,
): Promise<void> {
  if (stage === 'entering') return;

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
  rig.ui.onFishingViewExit?.();
  if (stage === 'returning') return;
  rig.animations.exit.at(-1)!.resolve();
  await flushPromises();
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function createDiveRig(options: {
  readonly terminalState?: Extract<SurvivalState, 'dead' | 'sunk' | 'rescued'>;
  readonly withScuba?: boolean;
} = {}) {
  const calls: string[] = [];
  const sequence = deferred();
  const fadeOut = deferred();
  const coveredScene = deferred();
  const coveredHold = deferred();
  const fadeIn = deferred();
  const resultHold = deferred();
  const diveInventory = options.withScuba === false
    ? inventory()
    : inventory({
        'scubaSet-1': {
          instanceId: 'scubaSet-1',
          type: 'scubaSet',
          condition: 'usable',
        },
      });
  let current = snapshot({ inventory: diveInventory });
  const outcome = accepted({
    code: 'dive-food',
    message: 'You find food below.',
    deltas: { energy: -3, food: 1 },
    cue: 'fish',
  });
  const perform = vi.fn(() => {
    calls.push('perform:dive');
    current = snapshot({
      inventory: diveInventory,
      state: options.terminalState ?? 'day',
      energy: 0,
      food: 1,
      health: options.terminalState === 'dead' ? 0 : 100,
    });
    return outcome;
  });
  let impact: () => void = () => undefined;
  const playDive = vi.fn((instanceId: ItemInstanceId, onWaterImpact: () => void) => {
    calls.push(`playDive:${instanceId}`);
    impact = onWaterImpact;
    return sequence.promise;
  });
  const world = {
    playDive,
    clearDivePresentation: vi.fn(() => calls.push('clearDive')),
    syncInventory: vi.fn(),
    projectInteractionAnchors: vi.fn(() => []),
    setDocumentHidden: vi.fn(),
    dispose: vi.fn(),
  };
  const ui: Partial<SurvivalUI> = {
    setBusy: vi.fn((busy: boolean) => calls.push(busy ? 'lock' : 'unlock')),
    setSleepCoverProfile: vi.fn((profile) => {
      calls.push(`coverProfile:${profile}`);
      return Promise.resolve();
    }),
    setSleepCovered: vi.fn((covered: boolean) => {
      calls.push(`fade:${covered}`);
      return covered ? fadeOut.promise : fadeIn.promise;
    }),
    render: vi.fn(() => calls.push('renderCovered')),
    setJournalUnread: vi.fn(),
    setAnchors: vi.fn(),
    settleCoveredScene: vi.fn(() => coveredScene.promise),
    holdDiveCovered: vi.fn(() => {
      calls.push('holdCovered');
      return coveredHold.promise;
    }),
    showDiveResult: vi.fn((_view: DiveResultView) => {
      calls.push('showResult');
      return resultHold.promise;
    }),
    restoreCommandFocus: vi.fn(() => calls.push('focus')),
    showEnding: vi.fn(() => calls.push('ending')),
    showFeedback: vi.fn(),
    dispose: vi.fn(),
  };
  const phase = SurvivalPhase.forTest({
    session: { snapshot: vi.fn(() => current), perform },
    world,
    ui,
  });
  const phaseAudio = (phase as unknown as { audio: SurvivalAudio }).audio;
  vi.spyOn(phaseAudio, 'beginDive').mockImplementation(() => calls.push('impactAudio'));
  vi.spyOn(phaseAudio, 'finishDive').mockImplementation(() => calls.push('finishAudio'));
  const cancelDive = vi.spyOn(phaseAudio, 'cancelDive');
  const deny = vi.spyOn(phaseAudio, 'deny');
  return {
    phase,
    calls,
    outcome,
    perform,
    world,
    ui,
    deny,
    cancelDive,
    impact: () => impact(),
    steps: { sequence, fadeOut, coveredScene, coveredHold, fadeIn, resultHold },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('SurvivalPhase orchestration', () => {
  it('runs an accepted dive in exact presentation order', async () => {
    const rig = createDiveRig();

    rig.phase.handleAction('dive');
    expect(rig.calls).toEqual(['perform:dive', 'lock', 'playDive:scubaSet-1']);

    rig.impact();
    expect(rig.calls.at(-1)).toBe('impactAudio');
    rig.steps.sequence.resolve();
    await flushPromises();
    expect(rig.calls.slice(-2)).toEqual(['coverProfile:dive', 'fade:true']);

    rig.steps.fadeOut.resolve();
    await flushPromises();
    expect(rig.calls.slice(-4)).toEqual([
      'clearDive',
      'finishAudio',
      'renderCovered',
      'holdCovered',
    ]);

    rig.steps.coveredScene.resolve();
    await flushPromises();
    expect(rig.calls.at(-1)).toBe('holdCovered');
    rig.steps.coveredHold.resolve();
    await flushPromises();
    expect(rig.calls.at(-1)).toBe('fade:false');

    rig.steps.fadeIn.resolve();
    await flushPromises();
    expect(rig.calls).toEqual([
      'perform:dive',
      'lock',
      'playDive:scubaSet-1',
      'impactAudio',
      'coverProfile:dive',
      'fade:true',
      'clearDive',
      'finishAudio',
      'renderCovered',
      'holdCovered',
      'fade:false',
      'coverProfile:solid',
      'showResult',
    ]);
    expect(rig.ui.showDiveResult).toHaveBeenCalledWith({
      title: 'DIVE RESULT',
      reward: { kind: 'resource', id: 'food', quantity: 1 },
      lines: [],
    });
    expect(rig.steps.resultHold.isSettled()).toBe(false);
    rig.steps.resultHold.resolve();
    await flushPromises();
    expect(rig.calls.slice(-2)).toEqual(['unlock', 'focus']);
    rig.phase.dispose();
  });

  it('shows a rejected dive without starting or locking its presentation', () => {
    const rejected = { ...accepted(), accepted: false, code: 'blocked' };
    const playDive = vi.fn();
    const setBusy = vi.fn();
    const showFeedback = vi.fn();
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => snapshot()), perform: vi.fn(() => rejected) },
      world: { playDive, dispose: vi.fn() },
      ui: { setBusy, showFeedback, dispose: vi.fn() },
    });

    phase.handleAction('dive');

    expect(playDive).not.toHaveBeenCalled();
    expect(setBusy).not.toHaveBeenCalled();
    expect(showFeedback).toHaveBeenCalledWith(rejected);
    phase.dispose();
  });

  it('denies a second command while the dive sequence runs', () => {
    const rig = createDiveRig();

    rig.phase.handleAction('dive');
    rig.phase.handleAction('repair');

    expect(rig.perform).toHaveBeenCalledOnce();
    expect(rig.deny).toHaveBeenCalledOnce();
    rig.phase.dispose();
  });

  it('uses the stable fallback when an accepted test dive has no scuba object', () => {
    const rig = createDiveRig({ withScuba: false });

    rig.phase.handleAction('dive');

    expect(rig.world.playDive).toHaveBeenCalledWith('scubaSet-1', expect.any(Function));
    rig.phase.dispose();
  });

  it('holds a fatal dive result before unlocking and showing death', async () => {
    const rig = createDiveRig({ terminalState: 'dead' });
    rig.phase.handleAction('dive');
    rig.impact();
    rig.steps.sequence.resolve();
    await flushPromises();
    rig.steps.fadeOut.resolve();
    await flushPromises();
    rig.steps.coveredScene.resolve();
    await flushPromises();
    rig.steps.coveredHold.resolve();
    await flushPromises();
    rig.steps.fadeIn.resolve();
    await flushPromises();

    expect(rig.calls.at(-1)).toBe('showResult');
    expect(rig.calls).not.toContain('unlock');
    expect(rig.calls).not.toContain('ending');

    rig.steps.resultHold.resolve();
    await flushPromises();
    expect(rig.calls.slice(-2)).toEqual(['unlock', 'ending']);
    expect(rig.ui.restoreCommandFocus).not.toHaveBeenCalled();
    rig.phase.dispose();
  });

  it('stops all late dive continuation after disposal', async () => {
    const rig = createDiveRig({ terminalState: 'dead' });
    rig.phase.handleAction('dive');
    rig.phase.dispose();

    rig.impact();
    Object.values(rig.steps).forEach((step) => step.resolve());
    await flushPromises();

    expect(rig.calls).toEqual(['perform:dive', 'lock', 'playDive:scubaSet-1']);
    expect(rig.ui.setSleepCovered).not.toHaveBeenCalled();
    expect(rig.ui.showDiveResult).not.toHaveBeenCalled();
    expect(rig.ui.restoreCommandFocus).not.toHaveBeenCalled();
    expect(rig.ui.showEnding).not.toHaveBeenCalled();
    expect(rig.cancelDive).toHaveBeenCalledOnce();
  });

  it('waits for visibility before continuing a settled dive sequence', async () => {
    const listeners = new Map<string, EventListener>();
    const fakeDocument = {
      hidden: false,
      addEventListener: vi.fn((type: string, listener: EventListener) => listeners.set(type, listener)),
      removeEventListener: vi.fn((type: string) => listeners.delete(type)),
    };
    vi.stubGlobal('document', fakeDocument);
    const rig = createDiveRig();
    rig.phase.start();
    rig.calls.length = 0;
    rig.phase.handleAction('dive');
    rig.impact();

    fakeDocument.hidden = true;
    listeners.get('visibilitychange')!(new Event('visibilitychange'));
    expect(rig.cancelDive).toHaveBeenCalledOnce();
    rig.steps.sequence.resolve();
    await flushPromises();
    expect(rig.ui.setSleepCoverProfile).not.toHaveBeenCalledWith('dive');

    fakeDocument.hidden = false;
    listeners.get('visibilitychange')!(new Event('visibilitychange'));
    await flushPromises();
    expect(rig.ui.setSleepCoverProfile).toHaveBeenCalledWith('dive');
    rig.phase.dispose();
  });

  it('cancels dive audio when restart cancels the lifecycle', () => {
    const rig = createDiveRig();
    rig.phase.handleAction('dive');
    rig.impact();

    rig.phase.requestRestart();

    expect(rig.cancelDive).toHaveBeenCalledOnce();
    rig.phase.dispose();
  });

  it.each([
    { kind: 'resource', id: 'food', quantity: 2 },
    { kind: 'resource', id: 'bait', quantity: 2 },
    { kind: 'resource', id: 'repairMaterial', quantity: 2 },
    { kind: 'item', id: 'energyBar', quantity: 1 },
    { kind: 'resource', id: 'food', quantity: 1 },
  ] satisfies readonly RewardSummary[])(
    'formats the applied Drifting Loot reward %#',
    (reward) => {
      expect(formatDriftingLootResult(reward)).toEqual({
        caption: 'SALVAGE RECOVERED',
        reward,
        energyCost: 3,
        target: null,
      });
    },
  );

  it('orchestrates covered dawn retrieval, held result, and one-shot same-day Continue', async () => {
    const calls: string[] = [];
    const retrieval = deferred();
    const realSession = new SurvivalSession([], {
      seed: 17,
      random: sequenceRandom([0, 0, 0, 0]),
      initial: { day: 2 },
    });
    const session = {
      snapshot: vi.fn(realSession.snapshot.bind(realSession)),
      availableReason: vi.fn(realSession.availableReason.bind(realSession)),
      perform: vi.fn(realSession.perform.bind(realSession)),
      beginDawn: vi.fn(realSession.beginDawn.bind(realSession)),
      resolveEvent: vi.fn(realSession.resolveEvent.bind(realSession)),
    };
    const clearEvent = vi.fn(() => calls.push('clear'));
    const retrieveDriftingLoot = vi.fn(() => {
      expect(realSession.snapshot()).toMatchObject({
        state: 'day',
        day: 3,
        energy: 0,
        food: 2,
        pendingEventId: null,
      });
      calls.push('retrieve');
      return retrieval.promise;
    });
    const resultTarget = Object.freeze({
      x: 410, y: 260, width: 100, height: 80, depth: 1, visible: true,
    });
    let resultView: DriftingLootResultView | null = null;
    const setBusy = vi.fn((busy: boolean) => calls.push(busy ? 'lock' : 'unlock'));
    const restoreCommandFocus = vi.fn(() => calls.push('focus'));
    const hideDriftingLootResult = vi.fn(() => calls.push('hide-result'));
    const world = {
      scene: new Scene(),
      play: vi.fn((cue: string) => {
        calls.push(cue);
        return Promise.resolve();
      }),
      stageEvent: vi.fn((id: string, variant?: 'barrel' | 'crate' | null) => {
        calls.push(`stage:${id}:${variant}`);
      }),
      revealEvent: vi.fn((id: string) => {
        calls.push(`reveal:${id}`);
        return Promise.resolve();
      }),
      retrieveDriftingLoot,
      projectDriftingLoot: vi.fn(() => {
        calls.push('project');
        return resultTarget;
      }),
      clearEvent,
      dispose: vi.fn(),
    };
    const ui: Partial<SurvivalUI> = {
      beginEventPresentation: vi.fn(() => calls.push('begin-event')),
      setSleepCovered: vi.fn((covered) => {
        calls.push(covered ? 'cover' : 'uncover');
        return Promise.resolve();
      }),
      holdSleep: vi.fn(() => Promise.resolve()),
      showEventReveal: vi.fn(() => Promise.resolve()),
      settleCoveredScene: vi.fn(() => {
        calls.push('settle');
        return Promise.resolve();
      }),
      setEventSelection: vi.fn(),
      playEventChoiceBeat: vi.fn(() => Promise.resolve()),
      clearEventPresentation: vi.fn(),
      showDriftingLootResult: vi.fn((view) => {
        resultView = view;
        calls.push('result');
      }),
      hideDriftingLootResult,
      setBusy,
      render: vi.fn(),
      setJournalUnread: vi.fn(),
      restoreCommandFocus,
      dispose: vi.fn(),
    };
    const phase = SurvivalPhase.forTest({
      session,
      world,
      ui,
      sceneRenderer: {
        render: vi.fn(() => calls.push('render')),
        resize: vi.fn(),
        dispose: vi.fn(),
      },
    });

    phase.handleAction('endDay');
    await flushPromises();
    await flushPromises();

    expect(calls.filter((call) => [
      'nightfall',
      'cover',
      'dawn',
      'begin-event',
      'stage:drifting-loot:barrel',
      'render',
      'settle',
      'uncover',
      'reveal:drifting-loot',
    ].includes(call))).toEqual([
      'nightfall',
      'cover',
      'dawn',
      'begin-event',
      'stage:drifting-loot:barrel',
      'render',
      'settle',
      'uncover',
      'reveal:drifting-loot',
    ]);

    calls.length = 0;
    setBusy.mockClear();
    restoreCommandFocus.mockClear();
    hideDriftingLootResult.mockClear();
    ui.onEventChoice?.('retrieve');
    await flushPromises();
    expect(calls).toContain('retrieve');
    phase.handleAction('eat');
    expect(session.perform).toHaveBeenCalledOnce();

    retrieval.resolve();
    await flushPromises();
    expect(calls).toContain('project');
    expect(resultView).toEqual({
      caption: 'SALVAGE RECOVERED',
      reward: { kind: 'resource', id: 'food', quantity: 2 },
      energyCost: 3,
      target: resultTarget,
    });
    expect(clearEvent).not.toHaveBeenCalled();
    phase.handleAction('eat');
    expect(session.perform).toHaveBeenCalledOnce();

    ui.onDriftingLootContinue?.();
    ui.onDriftingLootContinue?.();

    expect(clearEvent).toHaveBeenCalledOnce();
    expect(hideDriftingLootResult).toHaveBeenCalledOnce();
    expect(setBusy.mock.calls.filter(([busy]) => busy === false)).toHaveLength(1);
    expect(restoreCommandFocus).toHaveBeenCalledOnce();
    expect(realSession.snapshot()).toMatchObject({ state: 'day', day: 3 });
  });

  it('draws and reveals Drifting Bottle through a normal dawn', async () => {
    const session = new SurvivalSession([], {
      seed: 203,
      random: sequenceRandom([0, 0, 0.99]),
      initial: { day: 2 },
    });
    const stageEvent = vi.fn();
    const revealEvent = vi.fn(() => Promise.resolve());
    const phase = SurvivalPhase.forTest({
      session,
      world: {
        play: vi.fn(() => Promise.resolve()),
        stageEvent,
        revealEvent,
        clearEvent: vi.fn(),
        dispose: vi.fn(),
      },
      ui: {
        beginEventPresentation: vi.fn(),
        setSleepCovered: vi.fn(() => Promise.resolve()),
        holdSleep: vi.fn(() => Promise.resolve()),
        showEventReveal: vi.fn(() => Promise.resolve()),
        settleCoveredScene: vi.fn(() => Promise.resolve()),
        setEventSelection: vi.fn(),
        clearEventPresentation: vi.fn(),
        setBusy: vi.fn(),
        render: vi.fn(),
        setJournalUnread: vi.fn(),
        dispose: vi.fn(),
      },
    });

    phase.handleAction('endDay');
    await flushPromises();
    await flushPromises();

    expect(session.snapshot()).toMatchObject({
      state: 'dayEvent',
      day: 3,
      pendingEventId: 'drifting-bottle',
    });
    expect(stageEvent).toHaveBeenCalledWith(
      'drifting-bottle',
      null,
      expect.any(Number),
    );
    expect(revealEvent).toHaveBeenCalledWith('drifting-bottle');
    phase.dispose();
  });

  it('lets Drifting Loot recede without a result and resumes the same day', async () => {
    let current = snapshot({
      state: 'dayEvent',
      day: 4,
      pendingEventId: 'drifting-loot',
      pendingDriftingLootVariant: 'crate',
    });
    const recedeDriftingLoot = vi.fn(() => Promise.resolve());
    const clearEvent = vi.fn();
    const showDriftingLootResult = vi.fn();
    const restoreCommandFocus = vi.fn();
    const ui: Partial<SurvivalUI> = {
      setSleepCovered: vi.fn(() => Promise.resolve()),
      showEventReveal: vi.fn(() => Promise.resolve()),
      setEventSelection: vi.fn(),
      playEventChoiceBeat: vi.fn(() => Promise.resolve()),
      clearEventPresentation: vi.fn(),
      hideDriftingLootResult: vi.fn(),
      showDriftingLootResult,
      setBusy: vi.fn(),
      render: vi.fn(),
      setJournalUnread: vi.fn(),
      restoreCommandFocus,
      dispose: vi.fn(),
    };
    const phase = SurvivalPhase.forTest({
      session: {
        snapshot: vi.fn(() => current),
        resolveEvent: vi.fn(() => {
          current = snapshot({ state: 'day', day: 4 });
          return accepted({ code: 'event-resolved', cue: 'none', deltas: {} });
        }),
      },
      world: {
        stageEvent: vi.fn(),
        revealEvent: vi.fn(() => Promise.resolve()),
        recedeDriftingLoot,
        clearEvent,
        dispose: vi.fn(),
      },
      ui,
    });

    phase.start();
    await flushPromises();
    ui.onEventChoice?.('sleep');
    await flushPromises();

    expect(recedeDriftingLoot).toHaveBeenCalledOnce();
    expect(showDriftingLootResult).not.toHaveBeenCalled();
    expect(clearEvent).toHaveBeenCalledOnce();
    expect(restoreCommandFocus).toHaveBeenCalledOnce();
    expect(current).toMatchObject({ state: 'day', day: 4 });
  });

  it.each([
    ['null', null],
    ['unexpected', 'buoy' as unknown as SurvivalSnapshot['pendingDriftingLootVariant']],
  ] as const)(
    'keeps an invalid dawn loot snapshot covered for a %s variant',
    async (_label, invalidVariant) => {
    let current = snapshot({ state: 'nightEvent', day: 2 });
    const setSleepCovered = vi.fn(() => Promise.resolve());
    const showFeedback = vi.fn();
    const stageEvent = vi.fn();
    const phase = SurvivalPhase.forTest({
      session: {
        snapshot: vi.fn(() => current),
        perform: vi.fn(() => accepted({ code: 'quiet-night', cue: 'nightfall' })),
        beginDawn: vi.fn(() => {
          current = snapshot({
            state: 'dayEvent',
            day: 3,
            pendingEventId: 'drifting-loot',
            pendingDriftingLootVariant: invalidVariant,
          });
          return accepted({ code: 'dawn', cue: 'dawn' });
        }),
      },
      world: {
        play: vi.fn(() => Promise.resolve()),
        stageEvent,
        clearEvent: vi.fn(),
        dispose: vi.fn(),
      },
      ui: {
        setSleepCovered,
        holdSleep: vi.fn(() => Promise.resolve()),
        beginEventPresentation: vi.fn(),
        clearEventPresentation: vi.fn(),
        hideDriftingLootResult: vi.fn(),
        showFeedback,
        setBusy: vi.fn(),
        render: vi.fn(),
        setJournalUnread: vi.fn(),
        dispose: vi.fn(),
      },
    });

    phase.handleAction('endDay');
    await flushPromises();
    await flushPromises();

    expect(stageEvent).not.toHaveBeenCalled();
    expect(setSleepCovered).toHaveBeenCalledWith(true);
    expect(setSleepCovered).not.toHaveBeenCalledWith(false);
    expect(showFeedback).toHaveBeenCalledWith({
      accepted: false,
      code: 'drifting-loot-variant-missing',
      message: 'The drifting loot could not be staged.',
      deltas: {},
      cue: 'none',
    });
    },
  );

  it.each([
    ['null', null],
    ['unexpected', 'buoy' as unknown as SurvivalSnapshot['pendingDriftingLootVariant']],
  ] as const)(
    'rejects a %s Drifting Loot variant before choice resolution or animation',
    async (_label, invalidVariant) => {
      let current = snapshot({
        state: 'dayEvent',
        day: 3,
        pendingEventId: 'drifting-loot',
        pendingDriftingLootVariant: 'barrel',
      });
      const resolveEvent = vi.fn();
      const playEventChoiceBeat = vi.fn(() => Promise.resolve());
      const retrieveDriftingLoot = vi.fn(() => Promise.resolve());
      const recedeDriftingLoot = vi.fn(() => Promise.resolve());
      const stageEvent = vi.fn();
      const showDriftingLootResult = vi.fn();
      const showFeedback = vi.fn();
      const ui: Partial<SurvivalUI> = {
        setSleepCovered: vi.fn(() => Promise.resolve()),
        showEventReveal: vi.fn(() => Promise.resolve()),
        setEventSelection: vi.fn(),
        playEventChoiceBeat,
        clearEventPresentation: vi.fn(),
        hideDriftingLootResult: vi.fn(),
        showDriftingLootResult,
        showFeedback,
        setBusy: vi.fn(),
        dispose: vi.fn(),
      };
      const phase = SurvivalPhase.forTest({
        session: { snapshot: vi.fn(() => current), resolveEvent },
        world: {
          stageEvent,
          revealEvent: vi.fn(() => Promise.resolve()),
          retrieveDriftingLoot,
          recedeDriftingLoot,
          clearEvent: vi.fn(),
          dispose: vi.fn(),
        },
        ui,
      });

      phase.start();
      await flushPromises();
      current = snapshot({
        state: 'dayEvent',
        day: 3,
        pendingEventId: 'drifting-loot',
        pendingDriftingLootVariant: invalidVariant,
      });
      ui.onEventChoice?.('retrieve');
      await flushPromises();

      expect(showFeedback).toHaveBeenCalledWith({
        accepted: false,
        code: 'drifting-loot-variant-missing',
        message: 'The drifting loot could not be staged.',
        deltas: {},
        cue: 'none',
      });
      expect(resolveEvent).not.toHaveBeenCalled();
      expect(stageEvent).toHaveBeenCalledOnce();
      expect(stageEvent).toHaveBeenCalledWith('drifting-loot', 'barrel', expect.any(Number));
      expect(playEventChoiceBeat).not.toHaveBeenCalled();
      expect(retrieveDriftingLoot).not.toHaveBeenCalled();
      expect(recedeDriftingLoot).not.toHaveBeenCalled();
      expect(showDriftingLootResult).not.toHaveBeenCalled();
    },
  );

  it('keeps a real insufficient-energy Drifting Loot encounter choosing without mutation', async () => {
    const realSession = new SurvivalSession([], {
      seed: 28,
      random: sequenceRandom([0]),
      initial: { day: 3, energy: 2 },
      initialEventId: 'drifting-loot',
    });
    const before = realSession.snapshot();
    const retrieveDriftingLoot = vi.fn(() => Promise.resolve());
    const showDriftingLootResult = vi.fn();
    const setEventSelection = vi.fn();
    const ui: Partial<SurvivalUI> = {
      setSleepCovered: vi.fn(() => Promise.resolve()),
      showEventReveal: vi.fn(() => Promise.resolve()),
      setEventSelection,
      playEventChoiceBeat: vi.fn(() => Promise.resolve()),
      showFeedback: vi.fn(),
      setBusy: vi.fn(),
      showDriftingLootResult,
      dispose: vi.fn(),
    };
    const phase = SurvivalPhase.forTest({
      session: {
        snapshot: vi.fn(realSession.snapshot.bind(realSession)),
        resolveEvent: vi.fn(realSession.resolveEvent.bind(realSession)),
      },
      world: {
        stageEvent: vi.fn(),
        revealEvent: vi.fn(() => Promise.resolve()),
        retrieveDriftingLoot,
        dispose: vi.fn(),
      },
      ui,
    });

    phase.start();
    await flushPromises();
    ui.onEventChoice?.('retrieve');
    await flushPromises();

    expect(realSession.snapshot()).toMatchObject({
      state: before.state,
      day: before.day,
      energy: before.energy,
      food: before.food,
      bait: before.bait,
      repairMaterial: before.repairMaterial,
      inventory: before.inventory,
      pendingEventId: 'drifting-loot',
      pendingDriftingLootVariant: 'barrel',
    });
    expect(setEventSelection).toHaveBeenCalledTimes(2);
    expect(retrieveDriftingLoot).not.toHaveBeenCalled();
    expect(showDriftingLootResult).not.toHaveBeenCalled();
  });

  it('reveals Drifting Loot after resolving a non-terminal night event', async () => {
    let current = snapshot({
      state: 'nightEvent',
      day: 2,
      pendingEventId: 'drifting-bottle',
    });
    const stageEvent = vi.fn();
    const phase = SurvivalPhase.forTest({
      session: {
        snapshot: vi.fn(() => current),
        resolveEvent: vi.fn(() => {
          current = snapshot({ state: 'nightEvent', day: 2 });
          return accepted({ code: 'event-resolved', cue: 'none' });
        }),
        beginDawn: vi.fn(() => {
          current = snapshot({
            state: 'dayEvent',
            day: 3,
            pendingEventId: 'drifting-loot',
            pendingDriftingLootVariant: 'crate',
          });
          return accepted({ code: 'dawn', cue: 'dawn' });
        }),
      },
      world: {
        play: vi.fn(() => Promise.resolve()),
        stageEvent,
        revealEvent: vi.fn(() => Promise.resolve()),
        reactToEventOutcome: vi.fn(() => Promise.resolve()),
        clearEvent: vi.fn(),
        dispose: vi.fn(),
      },
      ui: {
        setSleepCovered: vi.fn(() => Promise.resolve()),
        showEventReveal: vi.fn(() => Promise.resolve()),
        setEventSelection: vi.fn(),
        showFeedback: vi.fn(),
        holdEventOutcome: vi.fn(() => Promise.resolve()),
        settleCoveredScene: vi.fn(() => Promise.resolve()),
        beginEventPresentation: vi.fn(),
        clearEventPresentation: vi.fn(),
        setBusy: vi.fn(),
        render: vi.fn(),
        setJournalUnread: vi.fn(),
        dispose: vi.fn(),
      },
    });

    phase.start();
    await flushPromises();
    stageEvent.mockClear();
    phase.handleEndure();
    await flushPromises();
    await flushPromises();

    expect(stageEvent).toHaveBeenCalledWith('drifting-loot', 'crate', expect.any(Number));
    expect(current).toMatchObject({ state: 'dayEvent', day: 3 });
  });

  it.each(['dispose', 'restart'] as const)(
    'cancels a stale Drifting Loot retrieval after %s',
    async (teardown) => {
      let current = snapshot({
        state: 'dayEvent',
        day: 3,
        energy: 3,
        pendingEventId: 'drifting-loot',
        pendingDriftingLootVariant: 'barrel',
      });
      const retrieval = deferred();
      const showDriftingLootResult = vi.fn();
      const restoreCommandFocus = vi.fn();
      const onRestart = vi.fn();
      const ui: Partial<SurvivalUI> = {
        setSleepCovered: vi.fn(() => Promise.resolve()),
        showEventReveal: vi.fn(() => Promise.resolve()),
        setEventSelection: vi.fn(),
        playEventChoiceBeat: vi.fn(() => Promise.resolve()),
        clearEventPresentation: vi.fn(),
        hideDriftingLootResult: vi.fn(),
        showDriftingLootResult,
        setBusy: vi.fn(),
        render: vi.fn(),
        setJournalUnread: vi.fn(),
        restoreCommandFocus,
        dispose: vi.fn(),
      };
      const phase = SurvivalPhase.forTest({
        session: {
          snapshot: vi.fn(() => current),
          resolveEvent: vi.fn(() => {
            current = snapshot({ state: 'day', day: 3, energy: 0, food: 2 });
            return accepted({
              code: 'event-resolved',
              cue: 'none',
              deltas: { energy: -3, food: 2 },
              rewardSummary: { kind: 'resource', id: 'food', quantity: 2 },
            });
          }),
        },
        world: {
          stageEvent: vi.fn(),
          revealEvent: vi.fn(() => Promise.resolve()),
          retrieveDriftingLoot: vi.fn(() => retrieval.promise),
          clearEvent: vi.fn(() => retrieval.resolve()),
          dispose: vi.fn(() => retrieval.resolve()),
        },
        ui,
        onRestart,
      });

      phase.start();
      await flushPromises();
      ui.onEventChoice?.('retrieve');
      await flushPromises();
      if (teardown === 'dispose') phase.dispose();
      else phase.requestRestart();
      await flushPromises();

      expect(showDriftingLootResult).not.toHaveBeenCalled();
      expect(restoreCommandFocus).not.toHaveBeenCalled();
      expect(onRestart).toHaveBeenCalledTimes(teardown === 'restart' ? 1 : 0);
    },
  );

  it.each(['dispose', 'restart'] as const)(
    'cancels a Drifting Loot dawn reveal after %s without stale continuation',
    async (teardown) => {
      const realSession = new SurvivalSession([], {
        seed: 29,
        random: sequenceRandom([0, 0, 0]),
        initial: { day: 2 },
      });
      const reveal = deferred();
      const setSleepCovered = vi.fn(() => Promise.resolve());
      const setEventSelection = vi.fn();
      const setBusy = vi.fn();
      const restoreCommandFocus = vi.fn();
      const onRestart = vi.fn();
      const clearEvent = vi.fn(() => reveal.resolve());
      const phase = SurvivalPhase.forTest({
        session: {
          snapshot: vi.fn(realSession.snapshot.bind(realSession)),
          perform: vi.fn(realSession.perform.bind(realSession)),
          beginDawn: vi.fn(realSession.beginDawn.bind(realSession)),
        },
        world: {
          scene: new Scene(),
          play: vi.fn(() => Promise.resolve()),
          stageEvent: vi.fn(),
          revealEvent: vi.fn(() => reveal.promise),
          clearEvent,
          dispose: vi.fn(() => reveal.resolve()),
        },
        ui: {
          setSleepCovered,
          holdSleep: vi.fn(() => Promise.resolve()),
          beginEventPresentation: vi.fn(),
          showEventReveal: vi.fn(() => Promise.resolve()),
          setEventSelection,
          clearEventPresentation: vi.fn(),
          hideDriftingLootResult: vi.fn(),
          settleCoveredScene: vi.fn(() => Promise.resolve()),
          setBusy,
          render: vi.fn(),
          setJournalUnread: vi.fn(),
          restoreCommandFocus,
          dispose: vi.fn(),
        },
        onRestart,
      });

      phase.handleAction('endDay');
      await flushPromises();
      expect(realSession.snapshot()).toMatchObject({
        state: 'dayEvent',
        day: 3,
        pendingEventId: 'drifting-loot',
        pendingDriftingLootVariant: 'barrel',
      });
      expect(reveal.isSettled()).toBe(false);
      setSleepCovered.mockClear();
      setBusy.mockClear();
      clearEvent.mockClear();

      if (teardown === 'dispose') phase.dispose();
      else phase.requestRestart();
      const clearCount = clearEvent.mock.calls.length;
      expect(clearCount).toBe(1);
      await flushPromises();

      expect(clearEvent).toHaveBeenCalledTimes(clearCount);
      expect(setEventSelection).not.toHaveBeenCalled();
      expect(setSleepCovered).not.toHaveBeenCalledWith(false);
      expect(setBusy).not.toHaveBeenCalledWith(false);
      expect(restoreCommandFocus).not.toHaveBeenCalled();
      expect(onRestart).toHaveBeenCalledTimes(teardown === 'restart' ? 1 : 0);
    },
  );

  it.each([
    ['result', 'dispose'],
    ['result', 'restart'],
    ['receding', 'dispose'],
    ['receding', 'restart'],
  ] as const)(
    'cancels Drifting Loot %s wait after %s without stale cleanup',
    async (stage, teardown) => {
      const realSession = new SurvivalSession([], {
        seed: 30,
        random: sequenceRandom([0]),
        initial: { day: 3, energy: 3 },
        initialEventId: 'drifting-loot',
      });
      const recession = deferred();
      const clearEvent = vi.fn(() => recession.resolve());
      const setBusy = vi.fn();
      const restoreCommandFocus = vi.fn();
      const showDriftingLootResult = vi.fn();
      const onRestart = vi.fn();
      const ui: Partial<SurvivalUI> = {
        setSleepCovered: vi.fn(() => Promise.resolve()),
        showEventReveal: vi.fn(() => Promise.resolve()),
        setEventSelection: vi.fn(),
        playEventChoiceBeat: vi.fn(() => Promise.resolve()),
        clearEventPresentation: vi.fn(),
        hideDriftingLootResult: vi.fn(),
        showDriftingLootResult,
        setBusy,
        render: vi.fn(),
        setJournalUnread: vi.fn(),
        restoreCommandFocus,
        dispose: vi.fn(),
      };
      const phase = SurvivalPhase.forTest({
        session: {
          snapshot: vi.fn(realSession.snapshot.bind(realSession)),
          resolveEvent: vi.fn(realSession.resolveEvent.bind(realSession)),
        },
        world: {
          stageEvent: vi.fn(),
          revealEvent: vi.fn(() => Promise.resolve()),
          retrieveDriftingLoot: vi.fn(() => Promise.resolve()),
          projectDriftingLoot: vi.fn(() => null),
          recedeDriftingLoot: vi.fn(() => recession.promise),
          clearEvent,
          dispose: vi.fn(() => recession.resolve()),
        },
        ui,
        onRestart,
      });

      phase.start();
      await flushPromises();
      setBusy.mockClear();
      restoreCommandFocus.mockClear();
      clearEvent.mockClear();
      ui.onEventChoice?.(stage === 'result' ? 'retrieve' : 'sleep');
      await flushPromises();
      const continueResult = ui.onDriftingLootContinue;
      expect(showDriftingLootResult).toHaveBeenCalledTimes(stage === 'result' ? 1 : 0);
      if (stage === 'receding') expect(recession.isSettled()).toBe(false);

      if (teardown === 'dispose') phase.dispose();
      else phase.requestRestart();
      const clearCount = clearEvent.mock.calls.length;
      expect(clearCount).toBe(1);
      continueResult?.();
      continueResult?.();
      await flushPromises();

      expect(clearEvent).toHaveBeenCalledTimes(clearCount);
      expect(showDriftingLootResult).toHaveBeenCalledTimes(stage === 'result' ? 1 : 0);
      expect(setBusy).not.toHaveBeenCalledWith(false);
      expect(restoreCommandFocus).not.toHaveBeenCalled();
      expect(onRestart).toHaveBeenCalledTimes(teardown === 'restart' ? 1 : 0);
    },
  );

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
      },
    );
  });

  it('synchronizes stable inventory once while projecting anchors every update', () => {
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
    phase.update(2, 0.016);

    expect(syncInventory).toHaveBeenCalledTimes(1);
    expect(syncInventory).toHaveBeenCalledWith(current);
    expect(projectInteractionAnchors).toHaveBeenCalledTimes(4);
    expect(projectInteractionAnchors).toHaveBeenLastCalledWith(800, 600);
    expect(setAnchors).toHaveBeenLastCalledWith(anchors);
  });

  it('renders and unlocks an accepted daytime action without text feedback', async () => {
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

    phase.handleAction('sendMessage');
    phase.handleAction('sendMessage');
    expect(perform).toHaveBeenCalledOnce();
    expect(setBusy).toHaveBeenCalledWith(true);

    cue.resolve();
    await flushPromises();
    expect(render).toHaveBeenCalled();
    expect(showFeedback).not.toHaveBeenCalled();
    expect(setBusy).toHaveBeenLastCalledWith(false);

    phase.handleAction('sendMessage');
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
    phase.handleAction('repair');
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
    expect(rig.ui.setFishingViewExitVisible).toHaveBeenLastCalledWith(true);
  });

  it('cancels from aiming, restores energy, and returns without casting', async () => {
    const rig = createFishingRig();
    rig.phase.start();
    rig.phase.handleAction('fish');
    await settleFishingEntry(rig);

    rig.ui.onFishingViewExit?.();
    rig.ui.onFishingViewExit?.();

    expect(rig.session.cancelFishing).toHaveBeenCalledOnce();
    expect(rig.world.playFishingCast).not.toHaveBeenCalled();
    expect(rig.realSession.snapshot()).toMatchObject({ energy: 3, actedToday: false });
    expect(rig.ui.setFishingState).toHaveBeenLastCalledWith({
      mode: 'hidden', message: '', biteTarget: null,
    });
    expect(rig.world.exitFishingView).toHaveBeenCalledOnce();
    rig.animations.exit.at(-1)!.resolve();
    await flushPromises();
    expect(rig.calls.at(-1)).toBe('restoreCommandFocus');
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
    expect(rig.ui.setFishingViewExitVisible).toHaveBeenLastCalledWith(false);
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
    expect(rig.ui.showFishingResult).toHaveBeenCalledWith({
      caption: 'SMALL CATCH',
      title: 'COD',
      detail: '+1 FOOD',
      catchTarget: rig.catchTarget,
    });
    expect(rig.world.projectFishingCatch).toHaveBeenCalledWith(1, 1);
    expect(rig.ui.setFishingState).toHaveBeenLastCalledWith({
      mode: 'result', message: '', biteTarget: null,
    });
    expect(rig.world.exitFishingView).not.toHaveBeenCalled();
    expect(rig.session.requestDayEvent).not.toHaveBeenCalled();
    rig.ui.onFishingResultContinue?.();
    rig.ui.onFishingResultContinue?.();
    expect(rig.ui.hideFishingResult).toHaveBeenCalledOnce();
    expect(rig.world.clearFishingPresentation).toHaveBeenCalledOnce();
    expect(rig.world.exitFishingView).not.toHaveBeenCalled();
    rig.ui.onFishingViewExit?.();
    rig.ui.onFishingViewExit?.();
    expect(rig.world.exitFishingView).toHaveBeenCalledOnce();
    rig.animations.exit.at(-1)!.resolve();
    await flushPromises();

    const exitIndex = rig.calls.indexOf('exitFishingView');
    const unlockIndex = rig.calls.lastIndexOf('unlock');
    expect(presentationIndex).toBeLessThan(exitIndex);
    expect(rig.calls.indexOf('playFishingReel:cod'))
      .toBeLessThan(rig.calls.indexOf('result:COD:+1 FOOD'));
    expect(rig.calls.indexOf('result:COD:+1 FOOD'))
      .toBeLessThan(rig.calls.indexOf('exitFishingView'));
    expect(exitIndex).toBeLessThan(unlockIndex);
    expect(rig.ui.setFishingState).toHaveBeenLastCalledWith({
      mode: 'hidden', message: '', biteTarget: null,
    });
    expect(rig.session.requestDayEvent).not.toHaveBeenCalled();
    expect(rig.world.play).not.toHaveBeenCalled();

    rig.realSession.perform('endDay');
    expect(rig.realSession.snapshot().journalEntries[0]?.actions).toHaveLength(1);
  });

  it('shows the projected broken compass utility result after reeling', async () => {
    const rig = createFishingRig({ day: 3, catchRoll: 406 / 422 });
    rig.phase.start();
    rig.phase.handleAction('fish');
    await settleFishingEntry(rig);
    expect(fishingCastCallback(rig)(null)).toBe(true);
    await completeFishingCast(rig);
    rig.phase.update(3, 3);

    expect(fishingReelCallback(rig)()).toBe(true);
    rig.animations.reel.at(-1)!.resolve();
    await flushPromises();

    expect(rig.ui.showFishingResult).toHaveBeenCalledWith({
      caption: 'UTILITY SALVAGE',
      title: 'BROKEN COMPASS',
      detail: 'BROKEN — REPAIR WITH DUCT TAPE',
      catchTarget: rig.catchTarget,
    });
  });

  it.each([
    {
      label: 'baited tuna', options: { withBait: true, day: 3, catchRoll: 0.17 },
      resultAnimation: 'reel' as const, expected: 'result:TUNA:+2 FOOD - 1 BAIT USED',
    },
    {
      label: 'plastic bottle', options: { catchRoll: 300 / 375 },
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
    expect(rig.world.exitFishingView).not.toHaveBeenCalled();
    expect(rig.ui.hideFishingResult).toHaveBeenCalledOnce();
    expect(rig.world.clearFishingPresentation).toHaveBeenCalledOnce();
    expect(rig.ui.setFishingViewExitVisible).toHaveBeenLastCalledWith(true);
    expect(rig.ui.setFishingState).toHaveBeenLastCalledWith({
      mode: 'ready', message: '', biteTarget: null,
    });
    rig.ui.onFishingViewExit?.();
    rig.ui.onFishingViewExit?.();
    expect(rig.world.exitFishingView).toHaveBeenCalledOnce();
    rig.animations.exit.at(-1)!.resolve();
    await flushPromises();
    expect(rig.ui.setFishingState).toHaveBeenLastCalledWith({
      mode: 'hidden', message: '', biteTarget: null,
    });
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

  it('keeps gameplay timing and results identical through normal motion', async () => {
      const rig = createFishingRig();
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
      expect(rig.animations.fade).toHaveLength(0);
    },
  );

  it.each(([
    'entering', 'aiming', 'casting', 'waiting', 'bite', 'reeling', 'missing', 'result', 'returning',
  ] as const).flatMap((stage) => (
    (['dispose', 'restart'] as const).map((teardown) => [stage, teardown] as const)
  )))(
    '%s settles safely through %s without later callbacks',
    async (state, teardown) => {
    let rig!: FishingRig;
    const onRestart = vi.fn(() => rig.phase.dispose());
    rig = createFishingRig({ onRestart });
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

  it('keeps routine actions in daylight without scheduling an event', async () => {
    let current = snapshot();
    const calls: string[] = [];
    const requestDayEvent = vi.fn();
    const showFeedback = vi.fn();
    const perform = vi.fn(() => {
      current = snapshot({ state: 'day', pendingEventId: null, actedToday: true });
      return accepted();
    });
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => current), perform, requestDayEvent },
      world: {
        play: vi.fn(async (cue) => { calls.push(cue); }),
        dispose: vi.fn(),
      },
      ui: {
        render: vi.fn(), showFeedback, setBusy: vi.fn(), setJournalUnread: vi.fn(),
        beginEventPresentation: vi.fn(),
        setSleepCovered: vi.fn(),
        setEventSelection: vi.fn(),
        dispose: vi.fn(),
      },
    });

    phase.handleAction('repair');
    await flushPromises();

    expect(perform).toHaveBeenCalledWith('repair', undefined);
    expect(requestDayEvent).not.toHaveBeenCalled();
    expect(current).toMatchObject({ state: 'day', pendingEventId: null });
    expect(calls).toEqual(['fish']);
    expect(showFeedback).not.toHaveBeenCalled();
  });

  it('does not open Dangerous Waters after eating', async () => {
    const session = new SurvivalSession(
      [{ instanceId: 'cannedFood-1', type: 'cannedFood' }],
      {
        seed: 202,
        random: sequenceRandom([0.999999, 0, 0]),
        initial: { day: 4, hunger: 35, energy: 3 },
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
      setEventSelection: vi.fn(),
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

    expect(session.snapshot()).toMatchObject({
      state: 'day',
      pendingEventId: null,
      energy: 3,
      food: 0,
    });
    expect(setEventSelection).not.toHaveBeenCalled();
    expect(ui.beginEventPresentation).not.toHaveBeenCalled();
    expect(ui.setSleepCovered).not.toHaveBeenCalled();
  });

  it('stages a committed night event under cover before revealing choices', async () => {
    const event = SURVIVAL_EVENTS.find(({ id }) => id === 'shower-night')!;
    let current = snapshot();
    const calls: string[] = [];
    const setEventEligibleItems = vi.fn();
    const setEventSelection = vi.fn(() => { calls.push('selection'); });
    const cover = deferred();
    const tableauReveal = deferred();
    const sceneSettle = deferred();
    const uncover = deferred();
    const sceneRenderer: SceneRenderer = {
      render: vi.fn(() => { calls.push('scene-render'); }),
      resize: vi.fn(),
      dispose: vi.fn(),
    };
    const perform = vi.fn(() => {
      current = snapshot({ state: 'nightEvent', pendingEventId: event.id });
      return accepted({ code: 'event-opened', cue: 'nightfall', deltas: {} });
    });
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => current), perform },
      world: {
        scene: new Scene(),
        play: vi.fn(async (cue) => { calls.push(cue); }),
        stageEvent: vi.fn(() => { calls.push('stage'); }),
        revealEvent: vi.fn(() => {
          calls.push('reveal-tableau');
          return tableauReveal.promise;
        }),
        setEventEligibleItems,
        dispose: vi.fn(),
      },
      ui: {
        beginEventPresentation: vi.fn(() => { calls.push('begin-event'); }),
        setSleepCovered: vi.fn((covered) => {
          calls.push(covered ? 'cover' : 'uncover');
          return covered ? cover.promise : uncover.promise;
        }),
        settleCoveredScene: vi.fn(() => {
          calls.push('settle');
          return sceneSettle.promise;
        }),
        setBusy: vi.fn(), render: vi.fn(), showEventReveal: vi.fn(async () => { calls.push('caption'); }),
        setEventSelection,
        setJournalUnread: vi.fn(), dispose: vi.fn(),
      },
      sceneRenderer,
    });
    phase.handleAction('endDay');
    await flushPromises();
    expect(calls).toEqual(['begin-event', 'nightfall', 'cover']);

    cover.resolve();
    await flushPromises();
    expect(calls).toEqual([
      'begin-event', 'nightfall', 'cover', 'stage', 'scene-render', 'settle',
    ]);
    expect(setEventEligibleItems).toHaveBeenLastCalledWith(new Set());
    expect(setEventSelection).not.toHaveBeenCalled();
    expect(calls).not.toContain('reveal-tableau');

    sceneSettle.resolve();
    await flushPromises();
    expect(calls.at(-1)).toBe('uncover');
    expect(calls).not.toContain('reveal-tableau');
    expect(calls).not.toContain('selection');

    uncover.resolve();
    await flushPromises();
    expect(calls.at(-1)).toBe('reveal-tableau');
    expect(calls).not.toContain('selection');

    tableauReveal.resolve();
    await flushPromises();
    expect(calls.slice(-2)).toEqual(['caption', 'selection']);
    expect(setEventSelection).toHaveBeenCalledOnce();
  });

  it('keeps event reveal ordering through authored transitions', async () => {
    const event = SURVIVAL_EVENTS.find(({ id }) => id === 'shower-night')!;
    let current = snapshot();
    const calls: string[] = [];
    const phase = SurvivalPhase.forTest({
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
      'begin-event', 'nightfall', 'cover', 'stage',
      'uncover', 'reveal-tableau', 'caption', 'selection',
    ]);
  });

  it('shows the Dangerous Waters caption after its scene reveal', async () => {
    const event = SURVIVAL_EVENTS.find(({ id }) => id === 'dangerous-waters')!;
    const calls: string[] = [];
    const phase = SurvivalPhase.forTest({
      session: {
        snapshot: vi.fn(() => snapshot({
          state: 'nightEvent',
          pendingEventId: event.id,
        })),
      },
      world: {
        stageEvent: vi.fn(() => { calls.push('stage'); }),
        revealEvent: vi.fn(async () => { calls.push('reveal-tableau'); }),
        dispose: vi.fn(),
      },
      ui: {
        beginEventPresentation: vi.fn(() => { calls.push('begin-event'); }),
        setSleepCovered: vi.fn(async (covered) => {
          calls.push(covered ? 'cover' : 'uncover');
        }),
        showEventReveal: vi.fn(async () => { calls.push('caption'); }),
        setEventSelection: vi.fn(() => { calls.push('selection'); }),
        setBusy: vi.fn(),
        render: vi.fn(),
        setJournalUnread: vi.fn(),
        dispose: vi.fn(),
      },
    });

    phase.start();
    await flushPromises();

    expect(calls).toEqual([
      'begin-event',
      'cover',
      'stage',
      'uncover',
      'reveal-tableau',
      'caption',
      'selection',
    ]);
  });

  it('stages a dedicated event with exact context and preserves reveal order', async () => {
    const calls: string[] = [];
    const stageEvent = vi.fn(() => { calls.push('stage:snatcher'); });
    const current = snapshot({
      state: 'dayEvent',
      day: 6,
      seed: 42,
      pendingEventId: 'snatcher',
      pendingEventTargetId: 'map-1',
      inventory: inventory({
        'map-1': { instanceId: 'map-1', type: 'map', condition: 'usable' },
        'spyglass-1': {
          instanceId: 'spyglass-1',
          type: 'spyglass',
          condition: 'usable',
        },
      }),
    });
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => current) },
      world: {
        scene: new Scene(),
        stageEvent,
        revealEvent: vi.fn(async () => { calls.push('world:reveal'); }),
        dispose: vi.fn(),
      },
      ui: {
        beginEventPresentation: vi.fn(),
        setSleepCovered: vi.fn(async (covered) => {
          calls.push(covered ? 'cover:on' : 'cover:off');
        }),
        showEventReveal: vi.fn(async () => { calls.push('ui:reveal'); }),
        settleCoveredScene: vi.fn(async () => { calls.push('render:settle'); }),
        setEventSelection: vi.fn(() => { calls.push('choices:on'); }),
        setBusy: vi.fn(),
        render: vi.fn(),
        setJournalUnread: vi.fn(),
        dispose: vi.fn(),
      },
    });

    phase.start();
    await flushPromises();

    expect(stageEvent).toHaveBeenCalledWith({
      eventId: 'snatcher',
      targetInstanceId: 'map-1',
      variantSeed: deriveEventVariantSeed(42, 6, 'snatcher'),
    });
    expect(calls).toEqual([
      'cover:on',
      'stage:snatcher',
      'ui:reveal',
      'render:settle',
      'cover:off',
      'world:reveal',
      'choices:on',
    ]);
  });

  it('routes a stable seed into a focused event presenter', async () => {
    const current = snapshot({
      state: 'nightEvent',
      day: 6,
      seed: 42,
      pendingEventId: 'midnight-tour',
      pressure: 1,
    });
    const stageEvent = vi.fn();
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => current) },
      world: {
        stageEvent,
        revealEvent: vi.fn(() => Promise.resolve()),
        dispose: vi.fn(),
      },
      ui: {
        beginEventPresentation: vi.fn(),
        setSleepCovered: vi.fn(() => Promise.resolve()),
        showEventReveal: vi.fn(() => Promise.resolve()),
        settleCoveredScene: vi.fn(() => Promise.resolve()),
        setEventSelection: vi.fn(),
        setBusy: vi.fn(),
        render: vi.fn(),
        setJournalUnread: vi.fn(),
        dispose: vi.fn(),
      },
    });

    phase.start();
    await flushPromises();

    expect(stageEvent).toHaveBeenCalledWith(
      'midnight-tour',
      null,
      deriveEventVariantSeed(current.seed, current.day, 'midnight-tour'),
    );
  });

  it.each([
    ['shower-night', 'rain'],
    ['windy-night', 'wind'],
    ['thunderstorm', 'thunderstorm'],
    ['restless-waves', 'waves'],
    ['man-in-the-fog', 'fog'],
  ] as const)(
    'applies %s event weather before staging and retains it until central cleanup',
    async (eventId, expectedWeather) => {
      const event = SURVIVAL_EVENTS.find(({ id }) => id === eventId)!;
      let current = snapshot({
        state: event.phase === 'day' ? 'dayEvent' : 'nightEvent',
        pendingEventId: event.id,
      });
      const calls: string[] = [];
      const holdOutcome = deferred();
      let phase!: SurvivalPhase;
      const setPresentationWeather = vi.fn((id: PresentationWeatherId) => {
        calls.push(`weather:${id}`);
      });
      phase = SurvivalPhase.forTest({
        session: {
          snapshot: vi.fn(() => current),
          resolveEvent: vi.fn(() => {
            current = snapshot({
              state: event.phase === 'day' ? 'day' : 'nightEvent',
              pendingEventId: null,
            });
            return accepted({ code: 'event-resolved', cue: 'impact' });
          }),
          beginDawn: vi.fn(() => {
            current = snapshot({ state: 'day', pendingEventId: null });
            return accepted({ code: 'dawn', cue: 'dawn' });
          }),
        },
        world: {
          setPresentationWeather,
          stageEvent: vi.fn(() => {
            calls.push(`stage:${phase.getPresentationWeather()}`);
          }),
          revealEvent: vi.fn(() => Promise.resolve()),
          play: vi.fn(() => Promise.resolve()),
          reactToEventOutcome: vi.fn(() => Promise.resolve()),
          clearEvent: vi.fn(() => calls.push(`clear:${phase.getPresentationWeather()}`)),
          dispose: vi.fn(),
        },
        ui: {
          beginEventPresentation: vi.fn(),
          setSleepCovered: vi.fn(() => Promise.resolve()),
          showEventReveal: vi.fn(() => {
            calls.push(`reveal:${phase.getPresentationWeather()}`);
            return Promise.resolve();
          }),
          setEventSelection: vi.fn(() => {
            calls.push(`selection:${phase.getPresentationWeather()}`);
          }),
          showFeedback: vi.fn(),
          holdEventOutcome: vi.fn(() => {
            calls.push(`outcome:${phase.getPresentationWeather()}`);
            return holdOutcome.promise;
          }),
          setBusy: vi.fn(),
          render: vi.fn(),
          setJournalUnread: vi.fn(),
          clearEventPresentation: vi.fn(),
          restoreCommandFocus: vi.fn(),
          dispose: vi.fn(),
        },
      });

      phase.start();
      await flushPromises();

      expect(calls.indexOf(`weather:${expectedWeather}`))
        .toBeLessThan(calls.indexOf(`stage:${expectedWeather}`));
      expect(calls).toContain(`reveal:${expectedWeather}`);
      expect(calls).toContain(`selection:${expectedWeather}`);
      expect(phase.getPresentationWeather()).toBe(expectedWeather);

      phase.handleEndure();
      await flushPromises();
      expect(calls).toContain(`outcome:${expectedWeather}`);
      expect(phase.getPresentationWeather()).toBe(expectedWeather);

      holdOutcome.resolve();
      await flushPromises();
      expect(calls).toContain(`clear:${expectedWeather}`);
      expect(phase.getPresentationWeather()).toBe('calm');
      expect(setPresentationWeather).toHaveBeenLastCalledWith('calm');
      expect(setPresentationWeather.mock.calls.map(([id]) => id))
        .not.toEqual(expect.arrayContaining(['overcast', 'squall']));
      phase.dispose();
    },
  );

  it('uses Calm for unrelated events', async () => {
    const phase = SurvivalPhase.forTest({
      session: {
        snapshot: vi.fn(() => snapshot({
          state: 'dayEvent',
          pendingEventId: 'drifting-bottle',
        })),
      },
      world: {
        stageEvent: vi.fn(),
        revealEvent: vi.fn(() => Promise.resolve()),
        setPresentationWeather: vi.fn(),
        dispose: vi.fn(),
      },
      ui: {
        showEventReveal: vi.fn(() => Promise.resolve()),
        setEventSelection: vi.fn(),
        dispose: vi.fn(),
      },
    });

    phase.start();
    await flushPromises();

    expect(phase.getPresentationWeather()).toBe('calm');
    phase.dispose();
  });

  it('plays thunder only after the lightning sample becomes visible', () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(65, 16 / 9, 0.08, 220),
      propModels,
      createTestMoonTexture(),
    );
    const calls: string[] = [];
    const thunder = vi.spyOn(SurvivalAudio.prototype, 'thunder').mockImplementation(() => {
      const lightning = world.scene.getObjectByName('weather-lightning-light');
      calls.push(lightning?.visible === true ? 'visible' : 'hidden');
    });
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => snapshot()) },
      world,
      ui: {},
    });

    try {
      phase.setWeatherOverride('thunderstorm');
      phase.start();
      phase.update(1.35, 1.35);

      expect(calls).toEqual(['visible']);
    } finally {
      phase.dispose();
      thunder.mockRestore();
      propModels.dispose();
    }
  });

  it('keeps forced weather above automatic weather and restores the active event weather', async () => {
    let phase!: SurvivalPhase;
    const calls: string[] = [];
    let actualWeather: PresentationWeatherId = 'calm';
    const setPresentationWeather = vi.fn((id: PresentationWeatherId) => {
      actualWeather = id;
      calls.push(`weather:${id}`);
    });
    const setWeather = vi.fn((id: PresentationWeatherId) => {
      calls.push(`gameplay:${id}`);
      setPresentationWeather(id);
    });
    phase = SurvivalPhase.forTest({
      session: {
        snapshot: vi.fn(() => snapshot({
          state: 'nightEvent',
          pendingEventId: 'thunderstorm',
        })),
      },
      world: {
        setWeather,
        setPresentationWeather,
        stageEvent: vi.fn(() => {
          calls.push(`stage:${phase.getPresentationWeather()}:${actualWeather}`);
        }),
        revealEvent: vi.fn(() => Promise.resolve()),
        dispose: vi.fn(),
      },
      ui: {
        showEventReveal: vi.fn(() => Promise.resolve()),
        setEventSelection: vi.fn(),
        dispose: vi.fn(),
      },
    });

    phase.setWeatherOverride('fog');
    phase.start();
    await flushPromises();

    expect(calls).toContain('stage:fog:fog');
    expect(setWeather).not.toHaveBeenCalled();
    expect(phase.getPresentationWeather()).toBe('fog');
    expect(actualWeather).toBe('fog');
    phase.setWeatherOverride(null);
    expect(phase.getPresentationWeather()).toBe('thunderstorm');
    expect(actualWeather).toBe('thunderstorm');
    expect(setPresentationWeather).toHaveBeenLastCalledWith('thunderstorm');
    phase.dispose();
  });

  it('restores contextual choices when session resolution rejects the choice', async () => {
    const event = SURVIVAL_EVENTS.find(({ id }) => id === 'drifting-loot')!;
    const current = snapshot({
      state: 'dayEvent',
      pendingEventId: event.id,
      pendingDriftingLootVariant: 'barrel',
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
      {
        id: 'retrieve',
        label: 'Retrieve It',
        unavailableReason: null,
        anchorId: 'drifting-loot',
        energyCost: 3,
      },
      { id: 'sleep', label: 'Let It Drift', unavailableReason: null },
    ]);
    expect(setBusy).toHaveBeenLastCalledWith(false);
  });

  it('finishes the contextual press beat without showing outcome text', async () => {
    const event = SURVIVAL_EVENTS.find(({ id }) => id === 'dangerous-waters')!;
    let current = snapshot({
      state: 'dayEvent',
      pendingEventId: event.id,
      energy: 3,
    });
    const calls: string[] = [];
    const beat = deferred();
    const worldBeat = deferred();
    const showEventOutcome = vi.fn();
    const resolveEvent = vi.fn(() => {
      calls.push('resolve');
      current = snapshot({ state: 'day', pendingEventId: null, energy: 0 });
      return accepted({
        code: 'event-resolved',
        message: 'The rocks damage the boat.',
        cue: 'none',
        deltas: { hull: -25 },
      });
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
      showEventOutcome,
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
        playEventChoice: vi.fn(() => {
          calls.push('world-choice');
          return worldBeat.promise;
        }),
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

    ui.onEventChoice?.('sleep');
    await flushPromises();
    expect(calls).toEqual(['press', 'world-choice']);
    expect(resolveEvent).not.toHaveBeenCalled();

    beat.resolve();
    await flushPromises();
    expect(resolveEvent).not.toHaveBeenCalled();
    worldBeat.resolve();
    await flushPromises();
    expect(calls.slice(0, 4)).toEqual([
      'press',
      'world-choice',
      'resolve',
      'react',
    ]);
    expect(showEventOutcome).not.toHaveBeenCalled();
  });

  it('anchors Handyman Chest and Touch choices to their world subjects', async () => {
    const current = snapshot({
      state: 'nightEvent',
      pendingEventId: 'handyman',
      chest: { state: 'closed', acquiredDay: 4 },
    });
    const setEventSelection = vi.fn();
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => current) },
      world: {
        stageEvent: vi.fn(),
        revealEvent: vi.fn(() => Promise.resolve()),
        dispose: vi.fn(),
      },
      ui: {
        render: vi.fn(),
        setJournalUnread: vi.fn(),
        setBusy: vi.fn(),
        beginEventPresentation: vi.fn(),
        setSleepCovered: vi.fn(() => Promise.resolve()),
        showEventReveal: vi.fn(() => Promise.resolve()),
        setEventSelection,
        dispose: vi.fn(),
      },
    });

    phase.start();
    await flushPromises();

    expect(setEventSelection.mock.calls[0]![1]).toEqual([
      {
        id: 'chest',
        label: 'Chest for Anchor',
        unavailableReason: null,
        anchorId: 'persistent-chest',
      },
      {
        id: 'touch',
        label: 'Touch the Hand',
        unavailableReason: null,
        anchorId: 'handyman:hand',
      },
      { id: 'sleep', label: 'Sleep', unavailableReason: null },
    ]);
    phase.dispose();
  });

  it('orders a focused contextual result before permanent sync and the held pose', async () => {
    let current = snapshot({
      state: 'nightEvent',
      pendingEventId: 'midnight-tour',
      pressure: 1,
    });
    let resolvedSnapshot: SurvivalSnapshot | null = null;
    const calls: string[] = [];
    const choiceMotion = deferred();
    const reaction = deferred();
    const hold = deferred();
    let revealed = false;
    let unlocked = false;
    const outcome = accepted({
      code: 'event-resolved',
      cue: 'none',
      message: 'You find one bait.',
      deltas: { bait: 1 },
      eventResult: {
        eventId: 'midnight-tour',
        choiceId: 'visit',
        resultId: 'tour-bait',
      },
    });
    const showFeedback = vi.fn(() => { calls.push('feedback'); });
    const ui = {
      beginEventPresentation: vi.fn(),
      setSleepCovered: vi.fn(() => Promise.resolve()),
      settleCoveredScene: vi.fn(() => Promise.resolve()),
      showEventReveal: vi.fn(() => Promise.resolve()),
      setEventSelection: vi.fn(),
      playEventChoiceBeat: vi.fn(() => Promise.resolve()),
      setBusy: vi.fn((busy: boolean) => {
        if (!busy && revealed && !unlocked) {
          unlocked = true;
          calls.push('unlock');
        }
      }),
      showEventOutcome: vi.fn(() => { calls.push('caption'); }),
      showFeedback,
      holdEventOutcome: vi.fn(() => {
        calls.push('hold');
        return hold.promise;
      }),
      render: vi.fn(),
      setJournalUnread: vi.fn(),
      clearEventPresentation: vi.fn(),
      restoreCommandFocus: vi.fn(),
      dispose: vi.fn(),
    };
    const phase = SurvivalPhase.forTest({
      session: {
        snapshot: vi.fn(() => current),
        resolveEvent: vi.fn(() => {
          calls.push('resolve');
          resolvedSnapshot = snapshot({
            state: 'nightEvent',
            pendingEventId: null,
            pressure: 1,
            bait: 1,
          });
          current = resolvedSnapshot;
          return outcome;
        }),
        beginDawn: vi.fn(() => {
          current = snapshot({ state: 'day', day: 2, bait: 1 });
          return accepted({ code: 'dawn', cue: 'none', deltas: {} });
        }),
      },
      world: {
        stageEvent: vi.fn(() => { calls.push('stage'); }),
        revealEvent: vi.fn(() => {
          revealed = true;
          calls.push('reveal');
          return Promise.resolve();
        }),
        playEventChoice: vi.fn((_eventId, choice) => {
          calls.push('choice');
          expect(choice).toEqual({
            choiceId: 'visit',
            instanceId: null,
            condition: null,
          });
          return choiceMotion.promise;
        }),
        reactToEventOutcome: vi.fn((_eventId, received, choice) => {
          calls.push('result');
          expect(received).toBe(outcome);
          expect(choice).toEqual({
            choiceId: 'visit',
            instanceId: null,
            condition: null,
          });
          return reaction.promise;
        }),
        syncInventory: vi.fn((synced) => {
          if (synced === resolvedSnapshot) calls.push('sync');
        }),
        play: vi.fn(() => Promise.resolve()),
        clearEvent: vi.fn(() => { calls.push('clear'); }),
        dispose: vi.fn(),
      },
      ui,
    });

    phase.start();
    await flushPromises();

    (ui as Partial<SurvivalUI>).onEventChoice?.('visit');
    await flushPromises();
    expect(calls).toEqual(['stage', 'reveal', 'unlock', 'choice']);

    choiceMotion.resolve();
    await flushPromises();
    phase.update(1, 0.016);
    expect(calls).toEqual([
      'stage', 'reveal', 'unlock', 'choice', 'resolve', 'result',
    ]);

    reaction.resolve();
    await flushPromises();
    expect(calls).toEqual([
      'stage', 'reveal', 'unlock', 'choice', 'resolve', 'result',
      'sync', 'hold',
    ]);
    expect(ui.showEventOutcome).not.toHaveBeenCalled();
    expect(showFeedback).not.toHaveBeenCalled();

    hold.resolve();
    await flushPromises();
    expect(calls.at(-1)).toBe('clear');
    phase.dispose();
  });

  it('orders a focused item result without showing outcome text', async () => {
    const map = {
      instanceId: 'map-1' as const,
      type: 'map' as const,
      condition: 'usable' as const,
    };
    let current = snapshot({
      state: 'nightEvent',
      pendingEventId: 'night-trader',
      inventory: inventory({ 'map-1': map }),
    });
    let resolvedSnapshot: SurvivalSnapshot | null = null;
    const calls: string[] = [];
    const choiceMotion = deferred();
    const reaction = deferred();
    const hold = deferred();
    let revealed = false;
    let unlocked = false;
    const outcome = accepted({
      code: 'event-resolved',
      cue: 'none',
      message: 'The trader gives you a compass.',
      deltas: {},
      eventResult: {
        eventId: 'night-trader',
        choiceId: 'map',
        resultId: 'trader-reward',
      },
    });
    const showFeedback = vi.fn();
    const ui = {
      beginEventPresentation: vi.fn(),
      setSleepCovered: vi.fn(() => Promise.resolve()),
      settleCoveredScene: vi.fn(() => Promise.resolve()),
      showEventReveal: vi.fn(() => Promise.resolve()),
      setEventSelection: vi.fn(),
      setEventUsing: vi.fn(),
      setBusy: vi.fn((busy: boolean) => {
        if (!busy && revealed && !unlocked) {
          unlocked = true;
          calls.push('unlock');
        }
      }),
      showEventOutcome: vi.fn(() => { calls.push('caption'); }),
      showFeedback,
      holdEventOutcome: vi.fn(() => {
        calls.push('hold');
        return hold.promise;
      }),
      render: vi.fn(),
      setJournalUnread: vi.fn(),
      clearEventPresentation: vi.fn(),
      restoreCommandFocus: vi.fn(),
      dispose: vi.fn(),
    };
    const phase = SurvivalPhase.forTest({
      session: {
        snapshot: vi.fn(() => current),
        resolveEvent: vi.fn(() => {
          calls.push('resolve');
          resolvedSnapshot = snapshot({
            state: 'nightEvent',
            pendingEventId: null,
            inventory: inventory({
              'map-1': { ...map, condition: 'lost' },
              'compass-1': {
                instanceId: 'compass-1',
                type: 'compass',
                condition: 'usable',
              },
            }),
          });
          current = resolvedSnapshot;
          return outcome;
        }),
        beginDawn: vi.fn(() => {
          current = snapshot({ state: 'day', day: 2 });
          return accepted({ code: 'dawn', cue: 'none', deltas: {} });
        }),
      },
      world: {
        stageEvent: vi.fn(() => { calls.push('stage'); }),
        revealEvent: vi.fn(() => {
          revealed = true;
          calls.push('reveal');
          return Promise.resolve();
        }),
        playEventItemUse: vi.fn(() => Promise.resolve()),
        playEventChoice: vi.fn((_eventId, choice) => {
          calls.push('choice');
          expect(choice).toEqual({
            choiceId: 'map',
            instanceId: 'map-1',
            condition: 'usable',
          });
          return choiceMotion.promise;
        }),
        reactToEventOutcome: vi.fn((_eventId, received, choice) => {
          calls.push('result');
          expect(received).toBe(outcome);
          expect(choice).toEqual({
            choiceId: 'map',
            instanceId: 'map-1',
            condition: 'lost',
          });
          return reaction.promise;
        }),
        syncInventory: vi.fn((synced) => {
          if (synced === resolvedSnapshot) calls.push('sync');
        }),
        play: vi.fn(() => Promise.resolve()),
        clearEvent: vi.fn(() => { calls.push('clear'); }),
        dispose: vi.fn(),
      },
      ui,
    });

    phase.start();
    await flushPromises();
    expect([...ui.setEventSelection.mock.calls[0]![0]]).toEqual([
      ['map-1', 'map'],
    ]);
    expect(ui.setEventSelection.mock.calls[0]![1]).toEqual([
      { id: 'sleep', label: 'Refuse', unavailableReason: null },
    ]);
    phase.handleEventItem('map', 'map-1');
    await flushPromises();
    expect(calls).toEqual(['stage', 'reveal', 'unlock', 'choice']);

    choiceMotion.resolve();
    await flushPromises();
    phase.update(1, 0.016);
    expect(calls).toEqual([
      'stage', 'reveal', 'unlock', 'choice', 'resolve', 'result',
    ]);

    reaction.resolve();
    await flushPromises();
    expect(calls).toEqual([
      'stage', 'reveal', 'unlock', 'choice', 'resolve', 'result',
      'sync', 'hold',
    ]);
    expect(ui.showEventOutcome).not.toHaveBeenCalled();
    expect(showFeedback).not.toHaveBeenCalled();

    hold.resolve();
    await flushPromises();
    expect(calls.at(-1)).toBe('clear');
    phase.dispose();
  });

  it.each([
    {
      label: 'a missing event result',
      eventId: 'night-trader',
      choiceId: 'map',
      route: 'item',
      eventResult: undefined,
      received: 'missing',
    },
    {
      label: 'a wrong event id',
      eventId: 'midnight-tour',
      choiceId: 'visit',
      route: 'context',
      eventResult: {
        eventId: 'handyman',
        choiceId: 'visit',
        resultId: 'tour-bait',
      },
      received: 'handyman/visit',
    },
    {
      label: 'a wrong choice id',
      eventId: 'other-people',
      choiceId: 'sleep',
      route: 'endure',
      eventResult: {
        eventId: 'other-people',
        choiceId: 'flare',
        resultId: 'rescue-missed',
      },
      received: 'other-people/flare',
    },
  ])('rejects $label before focused sync or reaction and cleans up', async ({
    eventId,
    choiceId,
    route,
    eventResult,
    received,
  }) => {
    const map = {
      instanceId: 'map-1' as const,
      type: 'map' as const,
      condition: 'usable' as const,
    };
    const before = snapshot({
      state: 'nightEvent',
      pendingEventId: eventId,
      energy: 3,
      bait: 0,
      ...(route === 'item'
        ? { inventory: inventory({ 'map-1': map }) }
        : {}),
    });
    let current = before;
    let resolvedSnapshot: SurvivalSnapshot | null = null;
    const calls: string[] = [];
    const reactToEventOutcome = vi.fn();
    const play = vi.fn();
    const syncInventory = vi.fn((synced: SurvivalSnapshot) => {
      if (synced !== before) calls.push('sync');
    });
    const setBusy = vi.fn();
    const clearEvent = vi.fn(() => { calls.push('clear-world'); });
    const clearEventPresentation = vi.fn(() => { calls.push('clear-ui'); });
    const restoreCommandFocus = vi.fn(() => { calls.push('focus'); });
    const onInvariantError = vi.fn((error: Error) => {
      calls.push('error');
      expect(error.message).toBe(
        `Focused event ${eventId} requires result ${eventId}/${choiceId}; `
        + `received ${received}.`,
      );
      expect(clearEvent).toHaveBeenCalledOnce();
      expect(clearEventPresentation).toHaveBeenCalledOnce();
      expect(reactToEventOutcome).not.toHaveBeenCalled();
      expect(play).not.toHaveBeenCalled();
      expect(syncInventory).not.toHaveBeenCalledWith(resolvedSnapshot);
    });
    const outcome = accepted({
      code: 'event-resolved',
      cue: 'none',
      message: 'The tour result is invalid.',
      deltas: { bait: 1 },
      ...(eventResult === undefined ? {} : { eventResult }),
    });
    const ui = {
      beginEventPresentation: vi.fn(),
      setSleepCovered: vi.fn(() => Promise.resolve()),
      settleCoveredScene: vi.fn(() => Promise.resolve()),
      showEventReveal: vi.fn(() => Promise.resolve()),
      setEventSelection: vi.fn(),
      playEventChoiceBeat: vi.fn(() => Promise.resolve()),
      setBusy,
      showEventOutcome: vi.fn(),
      showFeedback: vi.fn(),
      clearEventPresentation,
      restoreCommandFocus,
      dispose: vi.fn(),
    };
    const phase = SurvivalPhase.forTest({
      session: {
        snapshot: vi.fn(() => current),
        resolveEvent: vi.fn(() => {
          resolvedSnapshot = snapshot({
            state: 'nightEvent',
            pendingEventId: null,
            energy: 0,
            bait: 1,
            ...(route === 'item'
              ? {
                  inventory: inventory({
                    'map-1': { ...map, condition: 'lost' },
                    'compass-1': {
                      instanceId: 'compass-1',
                      type: 'compass',
                      condition: 'usable',
                    },
                  }),
                }
              : {}),
          });
          current = resolvedSnapshot;
          return outcome;
        }),
        beginDawn: vi.fn(() => {
          current = snapshot({
            state: 'day',
            day: 2,
            energy: 0,
            bait: 1,
          });
          return accepted({ code: 'dawn', cue: 'none', deltas: {} });
        }),
      },
      world: {
        stageEvent: vi.fn(),
        revealEvent: vi.fn(() => Promise.resolve()),
        playEventItemUse: vi.fn(() => Promise.resolve()),
        playEventChoice: vi.fn(() => Promise.resolve()),
        reactToEventOutcome,
        syncInventory,
        play,
        clearEvent,
        dispose: vi.fn(),
      },
      ui,
      onInvariantError,
    });

    phase.start();
    await flushPromises();
    syncInventory.mockClear();
    if (route === 'item') phase.handleEventItem(choiceId, 'map-1');
    else if (route === 'context') {
      (ui as Partial<SurvivalUI>).onEventChoice?.(choiceId);
    } else {
      phase.handleEndure();
    }
    await flushPromises();
    await flushPromises();

    expect(onInvariantError).toHaveBeenCalledOnce();
    expect(calls).toEqual([
      'clear-world',
      'clear-ui',
      'error',
      'sync',
      'focus',
    ]);
    expect(reactToEventOutcome).not.toHaveBeenCalled();
    expect(play).toHaveBeenCalledOnce();
    expect(play).toHaveBeenCalledWith('none');
    expect(calls.indexOf('error')).toBeLessThan(calls.indexOf('sync'));
    expect(syncInventory).toHaveBeenCalledWith(current);
    expect(ui.showEventOutcome).not.toHaveBeenCalled();
    expect(ui.showFeedback).not.toHaveBeenCalled();
    expect(setBusy).toHaveBeenLastCalledWith(false);
    expect(current.state).toBe('day');
    phase.dispose();
  });

  it('shows a focused rejection as bottom feedback without a result reaction', async () => {
    const current = snapshot({
      state: 'nightEvent',
      pendingEventId: 'midnight-tour',
      pressure: 1,
    });
    const rejected = {
      ...accepted(),
      accepted: false,
      code: 'requirements-unmet',
      message: 'The island is out of reach.',
      cue: 'none' as const,
    };
    const showFeedback = vi.fn();
    const showEventOutcome = vi.fn();
    const reactToEventOutcome = vi.fn();
    const ui = {
      beginEventPresentation: vi.fn(),
      setSleepCovered: vi.fn(() => Promise.resolve()),
      settleCoveredScene: vi.fn(() => Promise.resolve()),
      showEventReveal: vi.fn(() => Promise.resolve()),
      setEventSelection: vi.fn(),
      playEventChoiceBeat: vi.fn(() => Promise.resolve()),
      setBusy: vi.fn(),
      showFeedback,
      showEventOutcome,
      dispose: vi.fn(),
    };
    const phase = SurvivalPhase.forTest({
      session: {
        snapshot: vi.fn(() => current),
        resolveEvent: vi.fn(() => rejected),
      },
      world: {
        stageEvent: vi.fn(),
        revealEvent: vi.fn(() => Promise.resolve()),
        playEventChoice: vi.fn(() => Promise.resolve()),
        reactToEventOutcome,
        dispose: vi.fn(),
      },
      ui,
    });

    phase.start();
    await flushPromises();
    (ui as Partial<SurvivalUI>).onEventChoice?.('visit');
    await flushPromises();

    expect(showFeedback).toHaveBeenCalledWith(rejected);
    expect(showEventOutcome).not.toHaveBeenCalled();
    expect(reactToEventOutcome).not.toHaveBeenCalled();
    phase.dispose();
  });

  it.each(['dispose', 'restart'] as const)(
    'does not sync, caption, or unlock after %s supersedes a focused result',
    async (teardown) => {
      let current = snapshot({
        state: 'nightEvent',
        pendingEventId: 'midnight-tour',
        pressure: 1,
      });
      let resolvedSnapshot: SurvivalSnapshot | null = null;
      const reaction = deferred();
      const showEventOutcome = vi.fn();
      const setBusy = vi.fn();
      const syncInventory = vi.fn();
      const onRestart = vi.fn();
      const outcome = accepted({
        code: 'event-resolved',
        cue: 'none',
        eventResult: {
          eventId: 'midnight-tour',
          choiceId: 'visit',
          resultId: 'tour-bait',
        },
      });
      const ui = {
        beginEventPresentation: vi.fn(),
        setSleepCovered: vi.fn(() => Promise.resolve()),
        settleCoveredScene: vi.fn(() => Promise.resolve()),
        showEventReveal: vi.fn(() => Promise.resolve()),
        setEventSelection: vi.fn(),
        playEventChoiceBeat: vi.fn(() => Promise.resolve()),
        setBusy,
        showEventOutcome,
        clearEventPresentation: vi.fn(),
        dispose: vi.fn(),
      };
      const phase = SurvivalPhase.forTest({
        session: {
          snapshot: vi.fn(() => current),
          resolveEvent: vi.fn(() => {
            resolvedSnapshot = snapshot({
              state: 'nightEvent',
              pendingEventId: null,
              pressure: 1,
              bait: 1,
            });
            current = resolvedSnapshot;
            return outcome;
          }),
        },
        world: {
          stageEvent: vi.fn(),
          revealEvent: vi.fn(() => Promise.resolve()),
          playEventChoice: vi.fn(() => Promise.resolve()),
          reactToEventOutcome: vi.fn(() => reaction.promise),
          syncInventory,
          play: vi.fn(() => Promise.resolve()),
          clearEvent: vi.fn(),
          dispose: vi.fn(),
        },
        ui,
        onRestart,
      });

      phase.start();
      await flushPromises();
      (ui as Partial<SurvivalUI>).onEventChoice?.('visit');
      await flushPromises();
      phase.update(1, 0.016);
      expect(resolvedSnapshot).not.toBeNull();
      expect(syncInventory).not.toHaveBeenCalledWith(resolvedSnapshot);
      setBusy.mockClear();

      if (teardown === 'dispose') phase.dispose();
      else phase.requestRestart();
      reaction.resolve();
      await flushPromises();

      expect(syncInventory).not.toHaveBeenCalledWith(resolvedSnapshot);
      expect(showEventOutcome).not.toHaveBeenCalled();
      expect(setBusy).not.toHaveBeenCalledWith(false);
      expect(onRestart).toHaveBeenCalledTimes(teardown === 'restart' ? 1 : 0);
    },
  );

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
          pendingDriftingLootVariant: 'barrel',
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
          pendingDriftingLootVariant: 'barrel',
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
        anchorId: 'drifting-loot',
        energyCost: 3,
      },
      { id: 'sleep', label: 'Let It Drift', unavailableReason: null },
    ]);
  });

  it('uses the standard sleep fade for Bad Sleep', async () => {
    let current = snapshot({
      state: 'nightEvent',
      pendingEventId: 'bad-sleep',
    });
    const calls: string[] = [];
    const outcome = accepted({
      code: 'event-resolved',
      message: 'You wake in short, frightened bursts.',
      cue: 'impact',
    });
    const beginDawn = vi.fn(() => {
      calls.push('dawn');
      current = snapshot({ state: 'day', day: 2 });
      return accepted({ code: 'dawn', cue: 'dawn' });
    });
    const showFeedback = vi.fn();
    const showEventOutcome = vi.fn(() => calls.push('outcome'));
    const holdEventOutcome = vi.fn(() => {
      calls.push('hold');
      return Promise.resolve();
    });
    const restoreCommandFocus = vi.fn(() => calls.push('focus'));
    const setEventSelection = vi.fn(() => calls.push('selection'));
    let sleepCovered = false;
    const setSleepCovered = vi.fn((covered: boolean) => {
      sleepCovered = covered;
      calls.push(covered ? 'cover' : 'uncover');
      return Promise.resolve();
    });
    const phase = SurvivalPhase.forTest({
      session: {
        snapshot: vi.fn(() => current),
        resolveEvent: vi.fn(() => {
          current = snapshot({
            state: 'nightEvent',
            pendingEventId: null,
          });
          return outcome;
        }),
        beginDawn,
      },
      world: {
        scene: new Scene(),
        setPhase: vi.fn((phase) => {
          if (phase === 'day') expect(sleepCovered).toBe(true);
          calls.push(`phase:${phase}`);
        }),
        stageEvent: vi.fn(() => calls.push('stage')),
        revealEvent: vi.fn(() => {
          calls.push('reveal');
          return Promise.resolve();
        }),
        play: vi.fn(() => Promise.resolve()),
        reactToEventOutcome: vi.fn(() => {
          calls.push('reaction');
          return Promise.resolve();
        }),
        clearEvent: vi.fn(() => calls.push('clear')),
        dispose: vi.fn(),
      },
      ui: {
        beginEventPresentation: vi.fn(),
        setSleepCovered,
        settleCoveredScene: vi.fn(() => Promise.resolve()),
        showEventReveal: vi.fn(() => Promise.resolve()),
        setEventSelection,
        setBusy: vi.fn(),
        showFeedback,
        showEventOutcome,
        holdEventOutcome,
        render: vi.fn(),
        setJournalUnread: vi.fn(),
        clearEventPresentation: vi.fn(),
        restoreCommandFocus,
        dispose: vi.fn(),
      },
    });

    phase.start();
    await flushPromises();

    expect(calls.indexOf('cover')).toBeLessThan(calls.indexOf('uncover'));
    expect(calls.indexOf('uncover')).toBeLessThan(calls.indexOf('reveal'));
    expect(setEventSelection).toHaveBeenCalledOnce();

    phase.handleEndure();
    await flushPromises();
    await flushPromises();

    expect(calls.indexOf('reaction')).toBeLessThan(calls.indexOf('hold'));
    expect(showEventOutcome).not.toHaveBeenCalled();
    expect(showFeedback).not.toHaveBeenCalled();
    expect(calls.indexOf('hold')).toBeLessThan(calls.lastIndexOf('cover'));
    expect(calls.lastIndexOf('cover')).toBeLessThan(calls.indexOf('dawn'));
    expect(calls.indexOf('dawn')).toBeLessThan(calls.lastIndexOf('phase:day'));
    expect(calls.lastIndexOf('phase:day')).toBeLessThan(calls.lastIndexOf('uncover'));
    expect(calls.indexOf('dawn')).toBeLessThan(calls.lastIndexOf('uncover'));
    expect(calls.at(-1)).toBe('focus');
    expect(restoreCommandFocus).toHaveBeenCalledOnce();
    phase.dispose();
  });

  it('plays the Bad Sleep yawn after the scene opens and before reveal', async () => {
    const event = SURVIVAL_EVENTS.find(({ id }) => id === 'bad-sleep')!;
    let current = snapshot({ state: 'nightEvent', pendingEventId: event.id });
    const calls: string[] = [];
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => current) },
      world: {
        stageEvent: vi.fn(() => calls.push('stage')),
        revealEvent: vi.fn(() => {
          calls.push('reveal');
          return Promise.resolve();
        }),
        dispose: vi.fn(),
      },
      ui: {
        beginEventPresentation: vi.fn(),
        setSleepCovered: vi.fn((covered: boolean) => {
          calls.push(covered ? 'cover' : 'uncover');
          return Promise.resolve();
        }),
        settleCoveredScene: vi.fn(() => {
          calls.push('settle');
          return Promise.resolve();
        }),
        showEventReveal: vi.fn(() => {
          calls.push('caption');
          return Promise.resolve();
        }),
        setBadSleepCue: vi.fn(),
        setEventSelection: vi.fn(),
        setBusy: vi.fn(),
        dispose: vi.fn(),
      },
    });
    const phaseAudio = (phase as unknown as { audio: SurvivalAudio }).audio;
    vi.spyOn(phaseAudio, 'eventReveal').mockImplementation((eventId) => {
      calls.push(`audio:${eventId}`);
    });

    phase.start();
    await flushPromises();

    expect(calls).toEqual([
      'cover',
      'stage',
      'settle',
      'uncover',
      'audio:bad-sleep',
      'reveal',
      'caption',
    ]);
    phase.dispose();
  });

  it('runs the full Dangerous Waters lifecycle while choices stay locked until reveal completes', async () => {
    const event = SURVIVAL_EVENTS.find(({ id }) => id === 'dangerous-waters')!;
    let current = snapshot({ state: 'nightEvent', pendingEventId: event.id });
    const calls: string[] = [];
    const uncover = deferred();
    let trackExit = false;
    let sleepCoverClosed = false;
    const setBusy = vi.fn();
    const restoreCommandFocus = vi.fn();
    const ui: Partial<SurvivalUI> = {
      beginEventPresentation: vi.fn(),
      setSleepCovered: vi.fn((isCovered) => {
        if (!trackExit) return Promise.resolve();
        calls.push(isCovered ? 'cover' : 'uncover');
        if (isCovered) {
          sleepCoverClosed = true;
          return Promise.resolve();
        }
        return uncover.promise.then(() => {
          sleepCoverClosed = false;
        });
      }),
      settleCoveredScene: vi.fn(() => {
        if (!trackExit) return Promise.resolve();
        return Promise.resolve();
      }),
      showEventReveal: vi.fn(() => Promise.resolve()),
      setEventSelection: vi.fn(),
      setBusy,
      showEventOutcome: vi.fn(() => { calls.push('outcome'); }),
      showFeedback: vi.fn(),
      holdEventOutcome: vi.fn(() => {
        calls.push('hold-result');
        return Promise.resolve();
      }),
      render: vi.fn(),
      setJournalUnread: vi.fn(),
      restoreCommandFocus,
      dispose: vi.fn(),
    };
    const outcome = accepted({
      code: 'event-resolved',
      cue: 'impact',
      message: 'The rocks damage the boat.',
      deltas: { hull: -7 },
    });
    const phase = SurvivalPhase.forTest({
      session: {
        snapshot: vi.fn(() => current),
        resolveEvent: vi.fn(() => {
          calls.push('resolve');
          current = snapshot({ state: 'nightEvent', pendingEventId: null, hull: 93 });
          return outcome;
        }),
        beginDawn: vi.fn(() => {
          calls.push('dawn');
          current = snapshot({ state: 'day', day: 2, hull: 93 });
          return accepted({ code: 'dawn', cue: 'dawn' });
        }),
      },
      world: {
        scene: new Scene(),
        revealEvent: vi.fn(() => Promise.resolve()),
        playEventChoice: vi.fn(() => {
          calls.push('choice-world');
          return Promise.resolve();
        }),
        reactToEventOutcome: vi.fn((eventId) => {
          expect(eventId).toBe(event.id);
          return Promise.resolve();
        }),
        clearEvent: vi.fn(() => {
          expect(sleepCoverClosed).toBe(true);
          calls.push('clear-event');
        }),
        syncInventory: vi.fn(),
        play: vi.fn((cue) => {
          if (cue === 'impact') calls.push('impact');
          return Promise.resolve();
        }),
        dispose: vi.fn(),
      },
      ui,
      sceneRenderer: {
        render: vi.fn(() => { calls.push('scene-render'); }),
        resize: vi.fn(),
        dispose: vi.fn(),
      },
    });
    phase.start();
    await flushPromises();
    calls.length = 0;
    setBusy.mockClear();
    restoreCommandFocus.mockClear();
    trackExit = true;

    ui.playEventChoiceBeat = vi.fn(() => {
      calls.push('choice-ui');
      return Promise.resolve();
    });
    ui.onEventChoice?.('sleep');
    await flushPromises();
    await flushPromises();

    expect(calls).toEqual([
      'choice-ui', 'choice-world', 'resolve', 'impact', 'hold-result',
      'cover', 'clear-event', 'dawn', 'scene-render', 'uncover',
    ]);
    expect(ui.showEventOutcome).not.toHaveBeenCalled();
    expect(setBusy).toHaveBeenLastCalledWith(true);
    expect(restoreCommandFocus).not.toHaveBeenCalled();

    uncover.resolve();
    await flushPromises();
    expect(setBusy).toHaveBeenLastCalledWith(false);
    expect(restoreCommandFocus).toHaveBeenCalledOnce();
  });

  it.each([
    ['dispose', 'hold'],
    ['restart', 'hold'],
    ['dispose', 'cover'],
    ['restart', 'cover'],
    ['dispose', 'settle'],
    ['restart', 'settle'],
    ['dispose', 'uncover'],
    ['restart', 'uncover'],
  ] as const)(
    'does not continue a resolved event after %s supersedes its pending %s',
    async (teardown, pendingStep) => {
      const event = SURVIVAL_EVENTS.find(({ id }) => id === 'drifting-bottle')!;
      let current = snapshot({ state: 'nightEvent', pendingEventId: event.id });
      const outcomeHold = deferred();
      const cover = deferred();
      const sceneSettle = deferred();
      const uncover = deferred();
      let trackExit = false;
      const clearEvent = vi.fn();
      const beginDawn = vi.fn(() => {
        current = snapshot({ state: 'day', day: 2 });
        return accepted({ code: 'dawn', cue: 'dawn' });
      });
      const render = vi.fn();
      const setBusy = vi.fn();
      const restoreCommandFocus = vi.fn();
      const holdEventOutcome = vi.fn(() => outcomeHold.promise);
      const settleCoveredScene = vi.fn(() => trackExit ? sceneSettle.promise : Promise.resolve());
      const setSleepCovered = vi.fn((covered: boolean) => {
        if (!trackExit) return Promise.resolve();
        return covered ? cover.promise : uncover.promise;
      });
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
          settleCoveredScene,
          showEventReveal: vi.fn(() => Promise.resolve()),
          setEventSelection: vi.fn(),
          setBusy,
          showFeedback: vi.fn(),
          holdEventOutcome,
          render,
          setJournalUnread: vi.fn(),
          restoreCommandFocus,
          clearEventPresentation: vi.fn(),
          dispose: vi.fn(),
        },
        onRestart,
      });
      phase.start();
      await flushPromises();
      trackExit = true;
      settleCoveredScene.mockClear();

      phase.handleEndure();
      await flushPromises();
      expect(holdEventOutcome).toHaveBeenCalledOnce();

      if (pendingStep !== 'hold') {
        outcomeHold.resolve();
        await flushPromises();
        expect(setSleepCovered).toHaveBeenLastCalledWith(true);
      }
      if (pendingStep === 'settle' || pendingStep === 'uncover') {
        cover.resolve();
        await flushPromises();
      }
      if (pendingStep === 'settle') {
        expect(settleCoveredScene).toHaveBeenCalledOnce();
      }
      if (pendingStep === 'uncover') {
        sceneSettle.resolve();
        await flushPromises();
        expect(setSleepCovered).toHaveBeenLastCalledWith(false);
      }

      if (teardown === 'dispose') phase.dispose();
      else phase.requestRestart();
      clearEvent.mockClear();
      render.mockClear();
      setSleepCovered.mockClear();
      beginDawn.mockClear();
      setBusy.mockClear();
      restoreCommandFocus.mockClear();

      if (pendingStep === 'hold') outcomeHold.resolve();
      else if (pendingStep === 'cover') cover.resolve();
      else if (pendingStep === 'settle') {
        expect(setSleepCovered).not.toHaveBeenCalledWith(false);
        expect(setBusy).not.toHaveBeenLastCalledWith(false);
        expect(restoreCommandFocus).not.toHaveBeenCalled();
        sceneSettle.resolve();
      } else uncover.resolve();
      await flushPromises();

      expect(clearEvent).not.toHaveBeenCalled();
      expect(beginDawn).not.toHaveBeenCalled();
      expect(render).not.toHaveBeenCalled();
      expect(setSleepCovered).not.toHaveBeenCalledWith(false);
      expect(setBusy).not.toHaveBeenCalledWith(false);
      expect(restoreCommandFocus).not.toHaveBeenCalled();
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

  it('integrates Swim Ring bottle recovery through day-event resolution', async () => {
    const calls: string[] = [];
    const session = new SurvivalSession(
      [{ instanceId: 'swimRing-1', type: 'swimRing' }],
      {
        seed: 201,
        random: sequenceRandom([0, 0.99]),
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
    const showEventResult = vi.fn(() => { calls.push('result:paper-inside'); });
    const phase = SurvivalPhase.forTest({
      session,
      world: {
        syncInventory,
        play: vi.fn(async (cue) => { calls.push(`cue:${cue}`); }),
        stageEvent: vi.fn(() => { calls.push('stage:drifting-bottle'); }),
        revealEvent: vi.fn(async () => { calls.push('reveal:drifting-bottle'); }),
        playEventItemUse: vi.fn(async () => { calls.push('use:swimRing-1'); }),
        reactToEventOutcome: vi.fn(async () => { calls.push('react:drifting-bottle'); }),
        projectEventResultBounds: vi.fn(() => (
          { x: 440, y: 300, width: 80, height: 65, depth: 2, visible: true }
        )),
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
        showEventResult,
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
      day: 2,
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
    expect(showEventResult).not.toHaveBeenCalled();
    expect(calls.indexOf('react:drifting-bottle')).toBeLessThan(calls.indexOf('hold'));
    expect(calls).not.toContain('feedback');
    expect(calls.indexOf('hold')).toBeLessThan(calls.lastIndexOf('cover'));
    expect(calls.lastIndexOf('cover')).toBeLessThan(calls.indexOf('clear:drifting-bottle'));
    expect(calls).not.toContain('cue:dawn');
    expect(calls.indexOf('inventory:day:usable')).toBeLessThan(calls.lastIndexOf('uncover'));
  });

  it('keeps the Flowers collection animation without a result callout', async () => {
    const session = new SurvivalSession(
      [{ instanceId: 'bucket-1', type: 'bucket' }],
      {
        seed: 203,
        random: sequenceRandom([0]),
        initial: { day: 2 },
        initialEventId: 'flowers',
      },
    );
    const reactToEventOutcome = vi.fn(() => Promise.resolve());
    const showEventResult = vi.fn();
    const phase = SurvivalPhase.forTest({
      session,
      world: {
        play: vi.fn(() => Promise.resolve()),
        stageEvent: vi.fn(),
        revealEvent: vi.fn(() => Promise.resolve()),
        playEventItemUse: vi.fn(() => Promise.resolve()),
        reactToEventOutcome,
        clearEvent: vi.fn(),
        dispose: vi.fn(),
      },
      ui: {
        render: vi.fn(),
        setJournalUnread: vi.fn(),
        setBusy: vi.fn(),
        beginEventPresentation: vi.fn(),
        setSleepCovered: vi.fn(() => Promise.resolve()),
        showEventReveal: vi.fn(() => Promise.resolve()),
        setEventSelection: vi.fn(),
        setEventUsing: vi.fn(),
        showEventResult,
        holdEventOutcome: vi.fn(() => Promise.resolve()),
        clearEventPresentation: vi.fn(),
        restoreCommandFocus: vi.fn(),
        dispose: vi.fn(),
      },
    });

    phase.start();
    await flushPromises();
    phase.handleEventItem('bucket', 'bucket-1');
    await flushPromises();
    await flushPromises();

    expect(reactToEventOutcome).toHaveBeenCalledWith(
      'flowers',
      expect.objectContaining({ eventPresentationKey: 'flowers.collect' }),
      expect.anything(),
      expect.anything(),
    );
    expect(showEventResult).not.toHaveBeenCalled();
    phase.dispose();
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
    const showEventOutcome = vi.fn();
    const showFeedback = vi.fn();
    const holdEventOutcome = vi.fn(() => Promise.resolve());
    const setSleepCovered = vi.fn(() => Promise.resolve());
    const syncInventory = vi.fn();
    const world = {
      syncInventory,
      play: vi.fn(() => Promise.resolve()),
      stageEvent: vi.fn((eventId: string) => {
        rescueTableauVisible = eventId === 'other-people';
      }),
      revealEvent: vi.fn(() => Promise.resolve()),
      playEventItemUse: vi.fn(() => Promise.resolve()),
      reactToEventOutcome: vi.fn(() => {
        expect(syncInventory).toHaveBeenLastCalledWith(session.snapshot());
        return Promise.resolve();
      }),
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
        showFeedback,
        showEventOutcome,
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
    expect(showEventOutcome).not.toHaveBeenCalled();
    expect(showFeedback).not.toHaveBeenCalled();
    expect(rescueTableauVisible).toBe(true);
    expect(clearEvent).not.toHaveBeenCalled();
    expect(holdEventOutcome).not.toHaveBeenCalled();
    expect(setSleepCovered).not.toHaveBeenCalledWith(true);

    phase.dispose();

    expect(clearEvent).toHaveBeenCalledOnce();
    expect(rescueTableauVisible).toBe(false);
    expect(world.dispose).toHaveBeenCalledOnce();
  });

  it.each(['dispose', 'restart'] as const)(
    'clears a staged tableau when %s supersedes its reveal',
    async (teardown) => {
      const event = SURVIVAL_EVENTS.find(({ phase }) => phase === 'night')!;
      const reveal = deferred();
      const setEventSelection = vi.fn();
      const clearEvent = vi.fn();
      const onRestart = vi.fn();
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
        onRestart,
      });
      phase.start();
      await flushPromises();

      if (teardown === 'dispose') phase.dispose();
      else phase.requestRestart();
      reveal.resolve();
      await flushPromises();

      expect(clearEvent).toHaveBeenCalledOnce();
      expect(setEventSelection).not.toHaveBeenCalled();
      expect(onRestart).toHaveBeenCalledTimes(teardown === 'restart' ? 1 : 0);
    },
  );

  it('holds a quiet night under cover and begins dawn without a journal modal', async () => {
    const calls: string[] = [];
    const sceneSettle = deferred();
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
      world: {
        scene: new Scene(),
        play: vi.fn((cue) => { calls.push(cue); return Promise.resolve(); }),
        dispose: vi.fn(),
      },
      ui: {
        setSleepCovered: vi.fn((covered) => {
          calls.push(covered ? 'cover' : 'uncover');
          return Promise.resolve();
        }),
        holdSleep: vi.fn(() => { calls.push('hold'); return Promise.resolve(); }),
        settleCoveredScene: vi.fn(() => {
          calls.push('settle');
          return sceneSettle.promise;
        }),
        setBusy: vi.fn(), render: vi.fn(), setJournalUnread: vi.fn(), showJournal,
        restoreCommandFocus: vi.fn(), dispose: vi.fn(),
      },
      sceneRenderer: {
        render: vi.fn(() => { calls.push('scene-render'); }),
        resize: vi.fn(),
        dispose: vi.fn(),
      },
    });
    phase.handleAction('endDay');
    await flushPromises();
    expect(beginDawn).toHaveBeenCalledOnce();
    expect(showJournal).not.toHaveBeenCalled();
    expect(calls).toEqual(['nightfall', 'cover', 'hold', 'begin-dawn', 'dawn', 'scene-render', 'settle']);
    expect(calls).not.toContain('uncover');

    sceneSettle.resolve();
    await flushPromises();
    expect(calls.at(-1)).toBe('uncover');
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

  it.each([
    ['shotgun', 'shotgun-1', 'death-stare'],
    ['flashlight', 'flashlight-1', 'death-stare'],
    ['flareGun', 'flareGun-1', 'other-people'],
    ['anchor', 'anchor-1', 'thunderstorm'],
  ] as const)('defers the %s action sound until its keyed cue', async (
    itemType,
    instanceId,
    eventId,
  ) => {
    const current = snapshot({
      state: 'nightEvent',
      pendingEventId: eventId,
      inventory: inventory({
        [instanceId]: {
          instanceId, type: itemType, condition: 'usable' as const,
        },
      }),
    });
    const itemUse = deferred();
    let actionCue: ((cueIndex: number) => void) | undefined;
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => current) },
      world: {
        revealEvent: vi.fn(() => Promise.resolve()),
        playEventItemUse: vi.fn((
          _eventId: string,
          _choiceId: string,
          _instanceId: ItemInstanceId,
          onAction?: (cueIndex: number) => void,
        ) => {
          actionCue = onAction;
          return itemUse.promise;
        }),
        playEventChoice: vi.fn(() => Promise.resolve()),
        dispose: vi.fn(),
      },
      ui: {
        showEventReveal: vi.fn(() => Promise.resolve()),
        setEventSelection: vi.fn(),
        setEventUsing: vi.fn(),
        setBusy: vi.fn(),
        dispose: vi.fn(),
      },
    });
    const audio = (phase as unknown as { audio: SurvivalAudio }).audio;
    const eventItemCue = vi.spyOn(audio, 'eventItemCue');

    phase.start();
    await flushPromises();
    phase.handleEventItem(itemType, instanceId);

    expect(eventItemCue).not.toHaveBeenCalled();
    expect(actionCue).toEqual(expect.any(Function));
    actionCue!(0);
    expect(eventItemCue).toHaveBeenCalledExactlyOnceWith(itemType, 0);

    itemUse.resolve();
    await flushPromises();
    phase.dispose();
  });

  it('derives the selected item before random changed actors without an early inventory sync', async () => {
    const event = SURVIVAL_EVENTS.find(({ id }) => id === 'shower-night')!;
    const cue = deferred();
    let current = snapshot({
      state: 'nightEvent',
      pendingEventId: event.id,
      inventory: inventory({
        'bucket-1': { instanceId: 'bucket-1', type: 'bucket', condition: 'usable' },
        'map-1': { instanceId: 'map-1', type: 'map', condition: 'usable' },
      }),
    });
    const outcome = accepted({ code: 'event-resolved', cue: 'impact' });
    const focusedChoice = deferred();
    const resolveEvent = vi.fn(() => {
      current = snapshot({
        state: 'nightEvent',
        pendingEventId: null,
        inventory: inventory({
          'bucket-1': { instanceId: 'bucket-1', type: 'bucket', condition: 'broken' },
          'map-1': { instanceId: 'map-1', type: 'map', condition: 'broken' },
        }),
      });
      return outcome;
    });
    const playEventItemUse = vi.fn(() => cue.promise);
    const playEventChoice = vi.fn(() => focusedChoice.promise);
    const syncInventory = vi.fn();
    const reactToEventOutcome = vi.fn(() => {
      expect(syncInventory).not.toHaveBeenCalledWith(current);
      return Promise.resolve();
    });
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => current), resolveEvent },
      world: {
        play: vi.fn(() => Promise.resolve()),
        playEventItemUse,
        playEventChoice,
        reactToEventOutcome,
        syncInventory,
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
    phase.handleEventItem('bucket', 'bucket-1');
    phase.handleEndure();
    expect(playEventItemUse).toHaveBeenCalledWith(
      'shower-night',
      'bucket',
      'bucket-1',
    );
    expect(resolveEvent).not.toHaveBeenCalled();

    cue.resolve();
    await flushPromises();
    expect(playEventChoice).toHaveBeenCalledWith(
      'shower-night',
      {
        choiceId: 'bucket',
        instanceId: 'bucket-1',
        condition: 'usable',
      },
    );
    expect(resolveEvent).not.toHaveBeenCalled();

    focusedChoice.resolve();
    await flushPromises();
    expect(resolveEvent).toHaveBeenCalledOnce();
    expect(resolveEvent).toHaveBeenCalledWith({
      kind: 'item',
      choiceId: 'bucket',
      instanceId: 'bucket-1',
    });
    expect(reactToEventOutcome).toHaveBeenCalledWith(
      'shower-night',
      outcome,
      {
        choiceId: 'bucket',
        actors: [
          { instanceId: 'bucket-1', condition: 'broken' },
          { instanceId: 'map-1', condition: 'broken' },
        ],
      },
      expect.anything(),
    );
  });

  it('derives two Windy Night Sleep actors in stable order', async () => {
    let current = snapshot({
      state: 'nightEvent',
      pendingEventId: 'windy-night',
      inventory: inventory({
        'umbrella-1': {
          instanceId: 'umbrella-1',
          type: 'umbrella',
          condition: 'usable',
        },
        'map-1': {
          instanceId: 'map-1',
          type: 'map',
          condition: 'usable',
        },
      }),
    });
    const outcome = accepted({ code: 'event-resolved', cue: 'impact' });
    const reactToEventOutcome = vi.fn(() => Promise.resolve());
    const ui: Partial<SurvivalUI> = {
      showEventReveal: vi.fn(() => Promise.resolve()),
      setEventSelection: vi.fn(),
      playEventChoiceBeat: vi.fn(() => Promise.resolve()),
      dispose: vi.fn(),
    };
    const phase = SurvivalPhase.forTest({
      session: {
        snapshot: vi.fn(() => current),
        resolveEvent: vi.fn(() => {
          current = snapshot({
            state: 'nightEvent',
            pendingEventId: null,
            inventory: inventory({
              'umbrella-1': {
                instanceId: 'umbrella-1',
                type: 'umbrella',
                condition: 'broken',
              },
              'map-1': {
                instanceId: 'map-1',
                type: 'map',
                condition: 'broken',
              },
            }),
          });
          return outcome;
        }),
      },
      world: {
        play: vi.fn(() => Promise.resolve()),
        reactToEventOutcome,
        dispose: vi.fn(),
      },
      ui,
    });

    phase.start();
    await flushPromises();
    ui.onEventChoice?.('sleep');
    await flushPromises();

    expect(reactToEventOutcome).toHaveBeenCalledWith(
      'windy-night',
      outcome,
      {
        choiceId: 'sleep',
        actors: [
          { instanceId: 'map-1', condition: 'broken' },
          { instanceId: 'umbrella-1', condition: 'broken' },
        ],
      },
      expect.anything(),
    );
  });

  it('derives a random Thunderstorm loss for Sleep', async () => {
    let current = snapshot({
      state: 'nightEvent',
      pendingEventId: 'thunderstorm',
      inventory: inventory({
        'umbrella-1': {
          instanceId: 'umbrella-1',
          type: 'umbrella',
          condition: 'usable',
        },
      }),
    });
    const outcome = accepted({ code: 'event-resolved', cue: 'impact' });
    const reactToEventOutcome = vi.fn(() => Promise.resolve());
    const ui: Partial<SurvivalUI> = {
      showEventReveal: vi.fn(() => Promise.resolve()),
      setEventSelection: vi.fn(),
      playEventChoiceBeat: vi.fn(() => Promise.resolve()),
      dispose: vi.fn(),
    };
    const phase = SurvivalPhase.forTest({
      session: {
        snapshot: vi.fn(() => current),
        resolveEvent: vi.fn(() => {
          current = snapshot({
            state: 'nightEvent',
            pendingEventId: null,
            inventory: inventory({
              'umbrella-1': {
                instanceId: 'umbrella-1',
                type: 'umbrella',
                condition: 'lost',
              },
            }),
          });
          return outcome;
        }),
      },
      world: {
        play: vi.fn(() => Promise.resolve()),
        reactToEventOutcome,
        dispose: vi.fn(),
      },
      ui,
    });

    phase.start();
    await flushPromises();
    ui.onEventChoice?.('sleep');
    await flushPromises();

    expect(reactToEventOutcome).toHaveBeenCalledWith(
      'thunderstorm',
      outcome,
      {
        choiceId: 'sleep',
        actors: [{ instanceId: 'umbrella-1', condition: 'lost' }],
      },
      expect.anything(),
    );
  });

  it('passes an exact dedicated before-and-after diff to the world', async () => {
    let current = snapshot({
      state: 'dayEvent',
      day: 6,
      seed: 42,
      hull: 88,
      pendingEventId: 'snatcher',
      pendingEventTargetId: 'map-1',
      inventory: inventory({
        'map-1': { instanceId: 'map-1', type: 'map', condition: 'usable' },
        'spyglass-1': {
          instanceId: 'spyglass-1',
          type: 'spyglass',
          condition: 'usable',
        },
      }),
    });
    const outcome = accepted({
      code: 'event-resolved',
      message: 'The spyglass breaks.',
      deltas: { hull: -12 },
      cue: 'impact',
    });
    const reactToEventOutcome = vi.fn(() => Promise.resolve());
    const showEventResult = vi.fn();
    const phase = SurvivalPhase.forTest({
      session: {
        snapshot: vi.fn(() => current),
        resolveEvent: vi.fn(() => {
          current = snapshot({
            state: 'day',
            day: 6,
            seed: 42,
            hull: 76,
            inventory: inventory({
              'map-1': { instanceId: 'map-1', type: 'map', condition: 'usable' },
              'spyglass-1': {
                instanceId: 'spyglass-1',
                type: 'spyglass',
                condition: 'broken',
              },
            }),
          });
          return outcome;
        }),
      },
      world: {
        scene: new Scene(),
        stageEvent: vi.fn(),
        revealEvent: vi.fn(() => Promise.resolve()),
        playEventItemUse: vi.fn(() => Promise.resolve()),
        reactToEventOutcome,
        play: vi.fn(() => Promise.resolve()),
        clearEvent: vi.fn(),
        dispose: vi.fn(),
      },
      ui: {
        beginEventPresentation: vi.fn(),
        setSleepCovered: vi.fn(() => Promise.resolve()),
        showEventReveal: vi.fn(() => Promise.resolve()),
        setEventSelection: vi.fn(),
        setEventUsing: vi.fn(),
        showEventResult,
        holdEventOutcome: vi.fn(() => Promise.resolve()),
        clearEventPresentation: vi.fn(),
        setBusy: vi.fn(),
        render: vi.fn(),
        setJournalUnread: vi.fn(),
        dispose: vi.fn(),
      },
    });

    phase.start();
    await flushPromises();
    phase.handleEventItem('spyglass', 'spyglass-1');
    await flushPromises();

    const presentation = {
      outcome,
      resourceDeltas: { hull: -12 },
      brokenInstanceIds: ['spyglass-1'],
      lostInstanceIds: [],
      consumedInstanceIds: [],
      selectedInstanceId: 'spyglass-1',
      selectedCondition: 'broken',
      targetInstanceId: 'map-1',
    };
    expect(reactToEventOutcome).toHaveBeenCalledWith(
      'snatcher',
      outcome,
      {
        choiceId: 'spyglass',
        instanceId: 'spyglass-1',
        condition: 'broken',
      },
      presentation,
    );
    expect(showEventResult).not.toHaveBeenCalled();
  });

  it.each([
    {
      terminalState: 'dead' as const,
      eventId: 'death-stare',
      initialResources: { health: 7 },
      terminalResources: { health: 0 },
      deltas: { health: -7 },
    },
    {
      terminalState: 'sunk' as const,
      eventId: 'whirlpool',
      initialResources: { hull: 11 },
      terminalResources: { hull: 0 },
      deltas: { hull: -11 },
    },
  ])(
    'holds a dedicated $terminalState reaction before clearing it for the ending',
    async ({
      terminalState,
      eventId,
      initialResources,
      terminalResources,
      deltas,
    }) => {
      let current = snapshot({
        state: 'dayEvent',
        day: 6,
        pendingEventId: eventId,
        ...initialResources,
      });
      const hold = deferred();
      const calls: string[] = [];
      let visibleLines: readonly string[] | null = null;
      const resolveEvent = vi.fn(() => {
        current = snapshot({
          state: terminalState,
          day: 6,
          ...initialResources,
          ...terminalResources,
        });
        return accepted({
          code: 'event-resolved',
          message: `The event leaves you ${terminalState}.`,
          deltas,
          cue: terminalState === 'dead' ? 'impact' : 'sinking',
        });
      });
      const clearEventPresentation = vi.fn(() => {
        calls.push('clear-ui');
        visibleLines = null;
      });
      const showEnding = vi.fn(() => {
        calls.push('ending');
        expect(visibleLines).toBeNull();
      });
      const setBusy = vi.fn();
      const phase = SurvivalPhase.forTest({
        session: {
          snapshot: vi.fn(() => current),
          resolveEvent,
        },
        world: {
          scene: new Scene(),
          stageEvent: vi.fn(),
          revealEvent: vi.fn(() => Promise.resolve()),
          play: vi.fn(() => Promise.resolve()),
          reactToEventOutcome: vi.fn(() => Promise.resolve()),
          clearEvent: vi.fn(() => { calls.push('clear-world'); }),
          dispose: vi.fn(),
        },
        ui: {
          beginEventPresentation: vi.fn(),
          setSleepCovered: vi.fn(() => Promise.resolve()),
          showEventReveal: vi.fn(() => Promise.resolve()),
          setEventSelection: vi.fn(),
          showEventResult: vi.fn((view) => {
            calls.push('result');
            visibleLines = view.lines;
          }),
          holdEventOutcome: vi.fn(() => {
            calls.push('hold');
            return hold.promise;
          }),
          clearEventPresentation,
          setBusy,
          render: vi.fn(),
          setJournalUnread: vi.fn(),
          showEnding,
          dispose: vi.fn(),
        },
      });

      phase.start();
      await flushPromises();
      calls.length = 0;
      setBusy.mockClear();

      phase.handleEndure();
      await flushPromises();

      expect(visibleLines).toBeNull();
      expect(calls).toEqual(['hold']);
      expect(showEnding).not.toHaveBeenCalled();
      expect(clearEventPresentation).not.toHaveBeenCalled();
      expect(setBusy).not.toHaveBeenCalledWith(false);

      phase.handleEndure();
      await flushPromises();
      expect(resolveEvent).toHaveBeenCalledOnce();

      hold.resolve();
      await flushPromises();

      expect(calls).toEqual(['hold', 'clear-world', 'clear-ui', 'ending']);
      expect(visibleLines).toBeNull();
      expect(showEnding).toHaveBeenCalledOnce();
      expect(setBusy).toHaveBeenLastCalledWith(false);
    },
  );

  it('keeps the Sleep response free of physical item animation', async () => {
    const event = SURVIVAL_EVENTS.find(({ id }) => id === 'drifting-loot')!;
    let current = snapshot({
      state: 'dayEvent',
      pendingEventId: event.id,
      energy: 3,
    });
    const playEventItemUse = vi.fn(() => Promise.resolve());
    const ui: Partial<SurvivalUI> = {
      showEventReveal: vi.fn(() => Promise.resolve()),
      setEventSelection: vi.fn(),
      playEventChoiceBeat: vi.fn(() => Promise.resolve()),
      dispose: vi.fn(),
    };
    const phase = SurvivalPhase.forTest({
      session: {
        snapshot: vi.fn(() => current),
        resolveEvent: vi.fn(() => {
          current = snapshot({ state: 'day', pendingEventId: null });
          return accepted({ code: 'event-resolved', cue: 'none', deltas: {} });
        }),
      },
      world: {
        revealEvent: vi.fn(() => Promise.resolve()),
        playEventItemUse,
        reactToEventOutcome: vi.fn(() => Promise.resolve()),
        play: vi.fn(() => Promise.resolve()),
        dispose: vi.fn(),
      },
      ui,
    });

    phase.start();
    await flushPromises();
    ui.onEventChoice?.('sleep');
    await flushPromises();

    expect(playEventItemUse).not.toHaveBeenCalled();
  });

  it('keeps the Ghosts sleep mask through cover closure and clears it before dawn', async () => {
    const calls: string[] = [];
    let current = snapshot({
      state: 'nightEvent',
      pendingEventId: 'ghosts',
      pressure: 1,
    });
    let coverGate: Deferred | null = null;
    const setEventSleepMask = vi.fn((eventId: string, visible: boolean) => {
      calls.push(`mask:${eventId}:${visible}`);
    });
    const setSleepCovered = vi.fn((covered: boolean) => {
      calls.push(covered ? 'cover' : 'uncover');
      return coverGate?.promise ?? Promise.resolve();
    });
    const clearEventPresentation = vi.fn(() => {
      calls.push('clear');
    });
    const ui: Partial<SurvivalUI> = {
      showEventReveal: vi.fn(() => Promise.resolve()),
      setEventSelection: vi.fn(),
      playEventChoiceBeat: vi.fn(() => Promise.resolve()),
      holdEventOutcome: vi.fn(() => Promise.resolve()),
      settleCoveredScene: vi.fn(() => Promise.resolve()),
      setEventSleepMask,
      setSleepCovered,
      clearEventPresentation,
      dispose: vi.fn(),
    };
    const phase = SurvivalPhase.forTest({
      session: {
        snapshot: vi.fn(() => current),
        resolveEvent: vi.fn(() => {
          current = snapshot({
            state: 'nightEvent',
            pendingEventId: null,
            pressure: 1,
          });
          return accepted({ code: 'event-resolved', cue: 'none', deltas: {} });
        }),
        beginDawn: vi.fn(() => {
          calls.push('dawn');
          current = snapshot({ state: 'day', day: 2, pressure: 1 });
          return accepted({ code: 'dawn', cue: 'dawn', deltas: {} });
        }),
      },
      world: {
        play: vi.fn(() => Promise.resolve()),
        reactToEventOutcome: vi.fn(() => Promise.resolve()),
        dispose: vi.fn(),
      },
      ui,
    });

    phase.start();
    await flushPromises();
    calls.length = 0;
    coverGate = deferred();

    ui.onEventChoice?.('sleep');
    await flushPromises();

    expect(calls).toEqual(['mask:ghosts:true', 'cover']);
    expect(clearEventPresentation).not.toHaveBeenCalled();

    coverGate.resolve();
    await flushPromises();

    expect(calls.indexOf('cover')).toBeLessThan(calls.indexOf('clear'));
    expect(calls.indexOf('clear')).toBeLessThan(calls.indexOf('dawn'));
  });

  it.each(['dispose', 'restart'] as const)(
    'does not resolve an event when %s supersedes its pending physical item use',
    async (teardown) => {
      const itemUse = deferred();
      const resolveEvent = vi.fn();
      const onRestart = vi.fn();
      const phase = SurvivalPhase.forTest({
        session: {
          snapshot: vi.fn(() => snapshot({
            state: 'nightEvent',
            pendingEventId: 'shower-night',
            inventory: inventory({
              'bucket-1': {
                instanceId: 'bucket-1',
                type: 'bucket',
                condition: 'usable',
              },
            }),
          })),
          resolveEvent,
        },
        world: {
          revealEvent: vi.fn(() => Promise.resolve()),
          playEventItemUse: vi.fn(() => itemUse.promise),
          dispose: vi.fn(),
        },
        ui: {
          showEventReveal: vi.fn(() => Promise.resolve()),
          setEventSelection: vi.fn(),
          dispose: vi.fn(),
        },
        onRestart,
      });

      phase.start();
      await flushPromises();
      phase.handleEventItem('bucket', 'bucket-1');
      await flushPromises();

      if (teardown === 'dispose') phase.dispose();
      else phase.requestRestart();
      itemUse.resolve();
      await flushPromises();

      expect(resolveEvent).not.toHaveBeenCalled();
      expect(onRestart).toHaveBeenCalledTimes(teardown === 'restart' ? 1 : 0);
    },
  );

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
    expect(showEnding).toHaveBeenCalledWith('sunk', 6, 8, expect.any(Number), 'standard');
    phase.requestRestart();
    phase.requestRestart();
    expect(restart).toHaveBeenCalledOnce();
  });

  it('delegates Drifting Loot through Whiskers and shows the reward without an energy cost', async () => {
    let current = snapshot({
      state: 'dayEvent',
      day: 3,
      pendingEventId: 'drifting-loot',
      pendingDriftingLootVariant: 'crate',
      captainWhiskers: {
        alive: true, hunger: 5, sickness: 0, unhappiness: 0,
        pettedToday: false, deathCause: null,
      },
    });
    const delegateDriftingLoot = vi.fn(() => Promise.resolve());
    const retrieveDriftingLoot = vi.fn(() => Promise.resolve());
    const showDriftingLootResult = vi.fn();
    const ui: Partial<SurvivalUI> = {
      setSleepCovered: vi.fn(() => Promise.resolve()),
      showEventReveal: vi.fn(() => Promise.resolve()),
      setEventSelection: vi.fn(),
      playEventChoiceBeat: vi.fn(() => Promise.resolve()),
      clearEventPresentation: vi.fn(),
      showDriftingLootResult,
      setBusy: vi.fn(),
      render: vi.fn(),
      setJournalUnread: vi.fn(),
      dispose: vi.fn(),
    };
    const phase = SurvivalPhase.forTest({
      session: {
        snapshot: vi.fn(() => current),
        resolveEvent: vi.fn(() => {
          current = snapshot({ state: 'day', day: 3, food: 2 });
          return accepted({
            code: 'event-resolved',
            cue: 'none',
            deltas: { food: 2 },
            rewardSummary: { kind: 'resource', id: 'food', quantity: 2 },
          });
        }),
      },
      world: {
        stageEvent: vi.fn(),
        revealEvent: vi.fn(() => Promise.resolve()),
        delegateDriftingLoot,
        retrieveDriftingLoot,
        projectDriftingLoot: vi.fn(() => null),
        dispose: vi.fn(),
      },
      ui,
    });

    phase.start();
    await flushPromises();
    ui.onEventChoice?.('delegate-whiskers');
    await flushPromises();

    expect(delegateDriftingLoot).toHaveBeenCalledOnce();
    expect(retrieveDriftingLoot).not.toHaveBeenCalled();
    expect(showDriftingLootResult).toHaveBeenCalledWith({
      caption: 'SALVAGE RECOVERED',
      reward: { kind: 'resource', id: 'food', quantity: 2 },
      energyCost: 0,
      target: null,
    });
    phase.dispose();
  });

  it('does not animate Whiskers when Drifting Loot delegation is rejected', async () => {
    const current = snapshot({
      state: 'dayEvent',
      pendingEventId: 'drifting-loot',
      pendingDriftingLootVariant: 'barrel',
    });
    const rejected = accepted({
      accepted: false,
      code: 'captain-whiskers-unavailable',
      message: 'Captain Whiskers is too hungry to help.',
    });
    const delegateDriftingLoot = vi.fn(() => Promise.resolve());
    const showFeedback = vi.fn();
    const ui: Partial<SurvivalUI> = {
      setSleepCovered: vi.fn(() => Promise.resolve()),
      showEventReveal: vi.fn(() => Promise.resolve()),
      setEventSelection: vi.fn(),
      playEventChoiceBeat: vi.fn(() => Promise.resolve()),
      showFeedback,
      setBusy: vi.fn(),
      dispose: vi.fn(),
    };
    const phase = SurvivalPhase.forTest({
      session: {
        snapshot: vi.fn(() => current),
        resolveEvent: vi.fn(() => rejected),
      },
      world: {
        stageEvent: vi.fn(),
        revealEvent: vi.fn(() => Promise.resolve()),
        delegateDriftingLoot,
        dispose: vi.fn(),
      },
      ui,
    });

    phase.start();
    await flushPromises();
    ui.onEventChoice?.('delegate-whiskers');
    await flushPromises();

    expect(showFeedback).toHaveBeenCalledWith(rejected);
    expect(delegateDriftingLoot).not.toHaveBeenCalled();
    phase.dispose();
  });

  it.each([
    ['Sleep Normally', 'sleep', [0, 0, 0.99, 0.99, 0.99]],
    ['Watch at the exact 0.85 boundary', 'watch', [0.85, 0, 0.99, 0.99, 0.99]],
  ] as const)(
    'reveals and resolves the Guarded Sleep follow-up before day two for %s',
    async (_label, choiceId, rolls) => {
      const session = new SurvivalSession([{
        instanceId: 'captainWhiskers-1',
        type: 'captainWhiskers',
      }], {
        seed: 91,
        random: sequenceRandom(rolls),
        initial: { day: 1 },
        initialEventId: 'guarded-sleep',
      });
      const beginDawn = vi.spyOn(session, 'beginDawn');
      const calls: string[] = [];
      const setEventSelection = vi.fn(() => {
        calls.push(`select:${session.snapshot().pendingEventId}`);
      });
      const ui: Partial<SurvivalUI> = {
        beginEventPresentation: vi.fn(),
        setSleepCovered: vi.fn((covered) => {
          calls.push(covered ? 'cover' : 'uncover');
          return Promise.resolve();
        }),
        showEventReveal: vi.fn(() => Promise.resolve()),
        settleCoveredScene: vi.fn(() => Promise.resolve()),
        setEventSelection,
        playEventChoiceBeat: vi.fn(() => Promise.resolve()),
        holdEventOutcome: vi.fn(() => Promise.resolve()),
        clearEventPresentation: vi.fn(() => calls.push('clear-ui')),
        setBusy: vi.fn(),
        render: vi.fn(),
        setJournalUnread: vi.fn(),
        setAnchors: vi.fn(),
        restoreCommandFocus: vi.fn(),
        dispose: vi.fn(),
      };
      const phase = SurvivalPhase.forTest({
        session,
        world: {
          syncInventory: vi.fn(),
          projectInteractionAnchors: vi.fn(() => []),
          setPhase: vi.fn(),
          stageEvent: vi.fn((context: string | { eventId: string }) => {
            calls.push(`stage:${typeof context === 'string' ? context : context.eventId}`);
          }),
          revealEvent: vi.fn(() => Promise.resolve()),
          playEventChoice: vi.fn(() => Promise.resolve()),
          reactToEventOutcome: vi.fn(() => Promise.resolve()),
          play: vi.fn(() => Promise.resolve()),
          clearEvent: vi.fn(() => calls.push('clear-world')),
          setEventSelectedItem: vi.fn(),
          setEventEligibleItems: vi.fn(),
          dispose: vi.fn(),
        },
        ui,
      });

      phase.start();
      await flushPromises();
      calls.length = 0;

      ui.onEventChoice?.(choiceId);
      await flushPromises();
      await flushPromises();

      expect(beginDawn).not.toHaveBeenCalled();
      expect(session.snapshot()).toMatchObject({
        state: 'nightEvent',
        day: 1,
        pendingEventId: 'night-calm-fallback',
      });
      expect(calls.indexOf('cover')).toBeLessThan(calls.indexOf('stage:night-calm-fallback'));
      expect(calls.indexOf('stage:night-calm-fallback')).toBeLessThan(calls.indexOf('uncover'));
      expect(calls).toContain('select:night-calm-fallback');

      ui.onEventChoice?.('sleep');
      await flushPromises();
      await flushPromises();

      expect(beginDawn).toHaveBeenCalledOnce();
      expect(session.snapshot()).toMatchObject({ state: 'day', day: 2, pendingEventId: null });
      phase.dispose();
    },
  );

  it.each([
    {
      label: 'absent',
      savedItems: [] as ItemInstance[],
      state: {},
      expected: null,
    },
    {
      label: 'dead',
      savedItems: [{ instanceId: 'captainWhiskers-1', type: 'captainWhiskers' }] as ItemInstance[],
      state: { alive: false, deathCause: 'sea-watcher' as const },
      expected: null,
    },
    {
      label: 'Hungry',
      savedItems: [{ instanceId: 'captainWhiskers-1', type: 'captainWhiskers' }] as ItemInstance[],
      state: { hunger: 3 },
      expected: 'Captain Whiskers is Hungry and cannot retrieve the loot.',
    },
    {
      label: 'Sick',
      savedItems: [{ instanceId: 'captainWhiskers-1', type: 'captainWhiskers' }] as ItemInstance[],
      state: { hunger: 5, sickness: 2 },
      expected: 'Captain Whiskers is Sick and cannot retrieve the loot.',
    },
    {
      label: 'Lonely',
      savedItems: [{ instanceId: 'captainWhiskers-1', type: 'captainWhiskers' }] as ItemInstance[],
      state: { hunger: 5, unhappiness: 5 },
      expected: 'Captain Whiskers is Lonely and cannot retrieve the loot.',
    },
    {
      label: 'wellness four',
      savedItems: [{ instanceId: 'captainWhiskers-1', type: 'captainWhiskers' }] as ItemInstance[],
      state: { hunger: 4 },
      expected: undefined,
    },
  ])('maps session-owned Drifting Loot availability for $label', async ({
    savedItems,
    state,
    expected,
  }) => {
    const session = new SurvivalSession(savedItems, {
      seed: 92,
      initialCaptainWhiskers: state,
      initialEventId: 'drifting-loot',
    });
    const setEventSelection = vi.fn();
    const phase = SurvivalPhase.forTest({
      session,
      world: {
        syncInventory: vi.fn(),
        projectInteractionAnchors: vi.fn(() => []),
        setPhase: vi.fn(),
        stageEvent: vi.fn(),
        revealEvent: vi.fn(() => Promise.resolve()),
        setEventSelectedItem: vi.fn(),
        setEventEligibleItems: vi.fn(),
        dispose: vi.fn(),
      },
      ui: {
        beginEventPresentation: vi.fn(),
        setSleepCovered: vi.fn(() => Promise.resolve()),
        showEventReveal: vi.fn(() => Promise.resolve()),
        settleCoveredScene: vi.fn(() => Promise.resolve()),
        setEventSelection,
        setBusy: vi.fn(),
        render: vi.fn(),
        setJournalUnread: vi.fn(),
        setAnchors: vi.fn(),
        dispose: vi.fn(),
      },
    });

    phase.start();
    await flushPromises();

    const choices = setEventSelection.mock.calls.at(-1)?.[1] ?? [];
    const delegate = choices.find(({ id }: { id: string }) => id === 'delegate-whiskers');
    if (expected === null) expect(delegate).toBeUndefined();
    else expect(delegate?.unavailableReason).toBe(expected ?? null);
    phase.dispose();
  });

  it('passes the kidnapped ending reason to the UI', () => {
    const showEnding = vi.fn();
    const phase = SurvivalPhase.forTest({
      session: {
        snapshot: vi.fn(() => snapshot({
          state: 'dead',
          endingReason: 'kidnapped',
          day: 21,
        })),
      },
      world: { update: vi.fn(), dispose: vi.fn() },
      ui: { render: vi.fn(), showEnding, dispose: vi.fn() },
    });

    phase.update(1, 0.016);

    expect(showEnding).toHaveBeenCalledWith(
      'dead',
      21,
      8,
      expect.any(Number),
      'kidnapped',
    );
    phase.dispose();
  });

  it.each(['petWhiskers', 'feedWhiskers'] as const)(
    'syncs and plays accepted %s before rendering the changed companion state',
    async (action) => {
      const calls: string[] = [];
      let current = snapshot({
        captainWhiskers: {
          alive: true, hunger: 4, sickness: 0, unhappiness: 4,
          pettedToday: false, deathCause: null,
        },
      });
      const playCaptainWhiskersAction = vi.fn(() => {
        calls.push('play');
        return Promise.resolve();
      });
      const showFeedback = vi.fn();
      const phase = SurvivalPhase.forTest({
        session: {
          snapshot: vi.fn(() => current),
          perform: vi.fn(() => {
            current = snapshot({
              captainWhiskers: {
                ...current.captainWhiskers!,
                hunger: action === 'feedWhiskers' ? 5 : 4,
                unhappiness: action === 'petWhiskers' ? 0 : 4,
                pettedToday: action === 'petWhiskers',
              },
            });
            return accepted({ code: action, cue: 'none', deltas: {} });
          }),
          availableReason: vi.fn(() => null),
        },
        world: {
          syncInventory: vi.fn(() => calls.push('sync')),
          playCaptainWhiskersAction,
          dispose: vi.fn(),
        },
        ui: {
          render: vi.fn(() => calls.push('render')),
          setBusy: vi.fn(),
          showFeedback,
          restoreCommandFocus: vi.fn(),
          dispose: vi.fn(),
        },
      });
      phase.start();
      calls.length = 0;

      phase.handleAction(action);
      await flushPromises();

      expect(calls).toEqual(['sync', 'play', 'render']);
      expect(playCaptainWhiskersAction).toHaveBeenCalledWith(action);
      expect(showFeedback).not.toHaveBeenCalled();
      phase.dispose();
    },
  );

  it('keeps rejected Whiskers actions in the existing feedback path', () => {
    const showFeedback = vi.fn();
    const playCaptainWhiskersAction = vi.fn();
    const rejected = accepted({
      accepted: false,
      code: 'already-petted',
      message: 'Captain Whiskers has already been petted today.',
      cue: 'none',
      deltas: {},
    });
    const phase = SurvivalPhase.forTest({
      session: {
        snapshot: vi.fn(() => snapshot()),
        perform: vi.fn(() => rejected),
      },
      world: { playCaptainWhiskersAction, dispose: vi.fn() },
      ui: { showFeedback, dispose: vi.fn() },
    });

    phase.handleAction('petWhiskers');

    expect(showFeedback).toHaveBeenCalledWith(rejected);
    expect(playCaptainWhiskersAction).not.toHaveBeenCalled();
    phase.dispose();
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

    phase.handleAction('repair');
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

  it('resumes updates when a visibility-owned pause ends', () => {
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
    listeners.get('visibilitychange')!(new Event('visibilitychange'));
    phase.update(3, 0.016);
    expect(setPaused).toHaveBeenLastCalledWith(false);
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('keeps a manual pause across hide and restore', () => {
    const listeners = new Map<string, EventListener>();
    const fakeDocument = {
      hidden: false,
      addEventListener: vi.fn((type: string, listener: EventListener) => listeners.set(type, listener)),
      removeEventListener: vi.fn((type: string) => listeners.delete(type)),
    };
    vi.stubGlobal('document', fakeDocument);
    const update = vi.fn();
    const updateAmbient = vi.fn();
    const setPaused = vi.fn();
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => snapshot()) },
      world: {
        update,
        updateAmbient,
        setDocumentHidden: vi.fn(),
        dispose: vi.fn(),
      },
      ui: { render: vi.fn(), setPaused, dispose: vi.fn() },
    });
    phase.start();
    phase.setPaused(true);

    fakeDocument.hidden = true;
    listeners.get('visibilitychange')!(new Event('visibilitychange'));
    fakeDocument.hidden = false;
    listeners.get('visibilitychange')!(new Event('visibilitychange'));
    phase.update(3, 0.016);

    expect(setPaused).not.toHaveBeenCalledWith(false);
    expect(update).not.toHaveBeenCalled();
    expect(updateAmbient).not.toHaveBeenCalled();
  });

  it('freezes all boat motion while gameplay is paused', () => {
    const update = vi.fn();
    const updateAmbient = vi.fn();
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => snapshot()) },
      world: {
        update,
        updateAmbient,
        dispose: vi.fn(),
      },
      ui: { render: vi.fn(), setPaused: vi.fn(), dispose: vi.fn() },
    });

    phase.setPaused(true);
    phase.update(4, 0.016);

    expect(updateAmbient).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('freezes survival time while the Escape pause menu is open', () => {
    const update = vi.fn();
    const updateAmbient = vi.fn();
    const ui: Record<string, unknown> = {
      render: vi.fn(),
      setPaused: vi.fn(),
      dispose: vi.fn(),
    };
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => snapshot()) },
      world: { update, updateAmbient, dispose: vi.fn() },
      ui,
    });

    phase.update(10, 0.1);
    (ui.onPauseChange as (paused: boolean) => void)(true);
    phase.update(11, 0.5);
    (ui.onPauseChange as (paused: boolean) => void)(false);
    phase.update(12, 0.25);

    expect(update).toHaveBeenNthCalledWith(1, 10, 0.1);
    expect(update).toHaveBeenNthCalledWith(2, 10.25, 0.25);
    expect(update).toHaveBeenCalledTimes(2);
    expect(updateAmbient).not.toHaveBeenCalled();
  });

  it('settles a hidden event reveal and restores choices when visible', async () => {
    const listeners = new Map<string, EventListener>();
    const fakeDocument = {
      hidden: false,
      addEventListener: vi.fn((type: string, listener: EventListener) => listeners.set(type, listener)),
      removeEventListener: vi.fn((type: string) => listeners.delete(type)),
    };
    vi.stubGlobal('document', fakeDocument);
    const reveal = deferred();
    const setEventSelection = vi.fn();
    const setDocumentHidden = vi.fn((hidden: boolean) => {
      if (hidden) reveal.resolve();
    });
    const phase = SurvivalPhase.forTest({
      session: {
        snapshot: vi.fn(() => snapshot({
          state: 'nightEvent',
          pendingEventId: 'shower-night',
        })),
      },
      world: {
        stageEvent: vi.fn(),
        revealEvent: vi.fn(() => reveal.promise),
        setEventEligibleItems: vi.fn(),
        setDocumentHidden,
        dispose: vi.fn(),
      },
      ui: {
        beginEventPresentation: vi.fn(),
        setSleepCovered: vi.fn(() => Promise.resolve()),
        settleCoveredScene: vi.fn(() => Promise.resolve()),
        showEventReveal: vi.fn(() => Promise.resolve()),
        setEventSelection,
        setPaused: vi.fn(),
        dispose: vi.fn(),
      },
    });
    phase.start();
    await flushPromises();

    fakeDocument.hidden = true;
    listeners.get('visibilitychange')!(new Event('visibilitychange'));
    await flushPromises();
    expect(setDocumentHidden).toHaveBeenCalledWith(true);
    expect(setEventSelection).not.toHaveBeenCalled();

    fakeDocument.hidden = false;
    listeners.get('visibilitychange')!(new Event('visibilitychange'));
    await flushPromises();
    expect(setEventSelection).toHaveBeenCalledOnce();
    phase.dispose();
  });

  it('routes Other People lantern Sleep with a usable signal item', async () => {
    const session = new SurvivalSession(
      [{ instanceId: 'flashlight-1', type: 'flashlight' }],
      {
        seed: 204,
        random: sequenceRandom([0, 0.99, 0.99]),
        initial: { day: 15, rescueProgress: 15 },
        initialEventId: 'other-people',
      },
    );
    const playEventChoice = vi.fn(() => Promise.resolve());
    const reactToEventOutcome = vi.fn(() => Promise.resolve());
    const setEventSelection = vi.fn();
    const ui: Partial<SurvivalUI> = {
      beginEventPresentation: vi.fn(),
      setSleepCovered: vi.fn(() => Promise.resolve()),
      showEventReveal: vi.fn(() => Promise.resolve()),
      setEventSelection,
      setBusy: vi.fn(),
      showFeedback: vi.fn(),
      showEventOutcome: vi.fn(),
      holdEventOutcome: vi.fn(() => Promise.resolve()),
      clearEventPresentation: vi.fn(),
      render: vi.fn(),
      setJournalUnread: vi.fn(),
      dispose: vi.fn(),
    };
    const phase = SurvivalPhase.forTest({
      session,
      world: {
        play: vi.fn(() => Promise.resolve()),
        stageEvent: vi.fn(),
        revealEvent: vi.fn(() => Promise.resolve()),
        playEventChoice,
        reactToEventOutcome,
        clearEvent: vi.fn(),
        dispose: vi.fn(),
      },
      ui: ui as SurvivalUI,
    });
    phase.start();
    await flushPromises();

    expect(setEventSelection).toHaveBeenLastCalledWith(
      new Map([['flashlight-1', 'flashlight']]),
      [{ id: 'sleep', label: 'Let It Pass', unavailableReason: null }],
    );

    ui.onEventChoice?.('sleep');
    await flushPromises();
    await flushPromises();

    expect(playEventChoice).toHaveBeenCalledWith('other-people', {
      choiceId: 'sleep',
      instanceId: null,
      condition: null,
    });
    expect(reactToEventOutcome).toHaveBeenCalledWith(
      'other-people',
      expect.objectContaining({
        eventResult: {
          eventId: 'other-people',
          choiceId: 'sleep',
          resultId: 'people-pass',
        },
      }),
      expect.anything(),
      expect.anything(),
    );
    expect(session.snapshot()).toMatchObject({
      state: 'day',
      pendingEventId: null,
      inventory: { 'flashlight-1': { condition: 'usable' } },
    });
    phase.dispose();
  });

  it('keeps the Other People Flashlight signal choice usable', async () => {
    const session = new SurvivalSession(
      [{ instanceId: 'flashlight-1', type: 'flashlight' }],
      {
        seed: 205,
        random: sequenceRandom([0]),
        initial: { day: 15, rescueProgress: 15 },
        initialEventId: 'other-people',
      },
    );
    const playEventChoice = vi.fn(() => Promise.resolve());
    const reactToEventOutcome = vi.fn(() => Promise.resolve());
    const phase = SurvivalPhase.forTest({
      session,
      world: {
        play: vi.fn(() => Promise.resolve()),
        stageEvent: vi.fn(),
        revealEvent: vi.fn(() => Promise.resolve()),
        playEventChoice,
        reactToEventOutcome,
        clearEvent: vi.fn(),
        dispose: vi.fn(),
      },
      ui: {
        beginEventPresentation: vi.fn(),
        showEventReveal: vi.fn(() => Promise.resolve()),
        setEventSelection: vi.fn(),
        setEventUsing: vi.fn(),
        setBusy: vi.fn(),
        showFeedback: vi.fn(),
        holdEventOutcome: vi.fn(() => Promise.resolve()),
        clearEventPresentation: vi.fn(),
        render: vi.fn(),
        setJournalUnread: vi.fn(),
        dispose: vi.fn(),
      },
    });
    phase.start();
    await flushPromises();

    phase.handleEventItem('flashlight', 'flashlight-1');
    await flushPromises();
    await flushPromises();

    expect(playEventChoice).toHaveBeenCalledWith('other-people', {
      choiceId: 'flashlight',
      instanceId: 'flashlight-1',
      condition: 'usable',
    });
    expect(reactToEventOutcome).toHaveBeenCalledWith(
      'other-people',
      expect.objectContaining({
        eventResult: {
          eventId: 'other-people',
          choiceId: 'flashlight',
          resultId: 'people-rescue',
        },
      }),
      expect.anything(),
      expect.anything(),
    );
    expect(session.snapshot()).toMatchObject({
      state: 'rescued',
      inventory: { 'flashlight-1': { condition: 'usable' } },
    });
    phase.dispose();
  });

  it('defers contextual focused choice resolution until visibility resumes', async () => {
    const listeners = new Map<string, EventListener>();
    const fakeDocument = {
      hidden: false,
      addEventListener: vi.fn((type: string, listener: EventListener) => listeners.set(type, listener)),
      removeEventListener: vi.fn((type: string) => listeners.delete(type)),
    };
    vi.stubGlobal('document', fakeDocument);
    const focusedChoice = deferred();
    let current = snapshot({
      state: 'nightEvent',
      pendingEventId: 'midnight-tour',
    });
    const resolveEvent = vi.fn(() => {
      current = snapshot({
        state: 'nightEvent',
        pendingEventId: null,
      });
      return {
        ...accepted(),
        accepted: false as const,
        code: 'requirements-unmet' as const,
      };
    });
    const setDocumentHidden = vi.fn((hidden: boolean) => {
      if (hidden) focusedChoice.resolve();
    });
    const playEventChoice = vi.fn(() => focusedChoice.promise);
    const ui: Partial<SurvivalUI> = {
      beginEventPresentation: vi.fn(),
      setSleepCovered: vi.fn(() => Promise.resolve()),
      settleCoveredScene: vi.fn(() => Promise.resolve()),
      showEventReveal: vi.fn(() => Promise.resolve()),
      setEventSelection: vi.fn(),
      playEventChoiceBeat: vi.fn(() => Promise.resolve()),
      setBusy: vi.fn(),
      setPaused: vi.fn(),
      showFeedback: vi.fn(),
      dispose: vi.fn(),
    };
    const phase = SurvivalPhase.forTest({
      session: {
        snapshot: vi.fn(() => current),
        resolveEvent,
      },
      world: {
        stageEvent: vi.fn(),
        revealEvent: vi.fn(() => Promise.resolve()),
        setEventEligibleItems: vi.fn(),
        playEventChoice,
        setDocumentHidden,
        dispose: vi.fn(),
      },
      ui,
    });
    phase.start();
    await flushPromises();

    ui.onEventChoice?.('visit');
    await flushPromises();
    expect(playEventChoice).toHaveBeenCalledOnce();
    expect(resolveEvent).not.toHaveBeenCalled();

    fakeDocument.hidden = true;
    listeners.get('visibilitychange')!(new Event('visibilitychange'));
    await flushPromises();
    expect(setDocumentHidden).toHaveBeenCalledWith(true);
    expect(focusedChoice.isSettled()).toBe(true);
    expect(resolveEvent).not.toHaveBeenCalled();

    fakeDocument.hidden = false;
    phase.setPaused(false);
    await flushPromises();
    expect(resolveEvent).toHaveBeenCalledOnce();
    phase.dispose();
  });

  it('settles a hidden focused result and defers sync until resume', async () => {
    const listeners = new Map<string, EventListener>();
    const fakeDocument = {
      hidden: false,
      addEventListener: vi.fn((type: string, listener: EventListener) => listeners.set(type, listener)),
      removeEventListener: vi.fn((type: string) => listeners.delete(type)),
    };
    vi.stubGlobal('document', fakeDocument);
    const reaction = deferred();
    const hold = deferred();
    let current = snapshot({
      state: 'nightEvent',
      pendingEventId: 'midnight-tour',
      pressure: 1,
    });
    let resolvedSnapshot: SurvivalSnapshot | null = null;
    const syncInventory = vi.fn();
    const showEventOutcome = vi.fn();
    const setDocumentHidden = vi.fn((hidden: boolean) => {
      if (hidden) reaction.resolve();
    });
    const outcome = accepted({
      code: 'event-resolved',
      cue: 'none',
      message: 'You find one bait.',
      eventResult: {
        eventId: 'midnight-tour',
        choiceId: 'visit',
        resultId: 'tour-bait',
      },
    });
    const ui = {
      beginEventPresentation: vi.fn(),
      setSleepCovered: vi.fn(() => Promise.resolve()),
      settleCoveredScene: vi.fn(() => Promise.resolve()),
      showEventReveal: vi.fn(() => Promise.resolve()),
      setEventSelection: vi.fn(),
      playEventChoiceBeat: vi.fn(() => Promise.resolve()),
      setBusy: vi.fn(),
      setPaused: vi.fn(),
      showEventOutcome,
      holdEventOutcome: vi.fn(() => hold.promise),
      clearEventPresentation: vi.fn(),
      dispose: vi.fn(),
    };
    const phase = SurvivalPhase.forTest({
      session: {
        snapshot: vi.fn(() => current),
        resolveEvent: vi.fn(() => {
          resolvedSnapshot = snapshot({
            state: 'nightEvent',
            pendingEventId: null,
            pressure: 1,
            bait: 1,
          });
          current = resolvedSnapshot;
          return outcome;
        }),
      },
      world: {
        stageEvent: vi.fn(),
        revealEvent: vi.fn(() => Promise.resolve()),
        setEventEligibleItems: vi.fn(),
        playEventChoice: vi.fn(() => Promise.resolve()),
        reactToEventOutcome: vi.fn(() => reaction.promise),
        syncInventory,
        setDocumentHidden,
        play: vi.fn(() => Promise.resolve()),
        clearEvent: vi.fn(),
        dispose: vi.fn(),
      },
      ui,
    });
    phase.start();
    await flushPromises();
    (ui as Partial<SurvivalUI>).onEventChoice?.('visit');
    await flushPromises();
    phase.update(1, 0.016);

    expect(resolvedSnapshot).not.toBeNull();
    expect(syncInventory).not.toHaveBeenCalledWith(resolvedSnapshot);
    expect(showEventOutcome).not.toHaveBeenCalled();

    fakeDocument.hidden = true;
    listeners.get('visibilitychange')!(new Event('visibilitychange'));
    await flushPromises();
    expect(setDocumentHidden).toHaveBeenCalledWith(true);
    expect(syncInventory).not.toHaveBeenCalledWith(resolvedSnapshot);
    expect(showEventOutcome).not.toHaveBeenCalled();

    fakeDocument.hidden = false;
    phase.setPaused(false);
    await flushPromises();
    expect(syncInventory).toHaveBeenCalledWith(resolvedSnapshot);
    expect(showEventOutcome).not.toHaveBeenCalled();

    phase.dispose();
    hold.resolve();
    await flushPromises();
  });

  it('defers item resolution across hidden item and reaction boundaries', async () => {
    const listeners = new Map<string, EventListener>();
    const fakeDocument = {
      hidden: false,
      addEventListener: vi.fn((type: string, listener: EventListener) => listeners.set(type, listener)),
      removeEventListener: vi.fn((type: string) => listeners.delete(type)),
    };
    vi.stubGlobal('document', fakeDocument);
    const itemUse = deferred();
    const reaction = deferred();
    const hold = deferred();
    let activeBoundary: 'item' | 'reaction' = 'item';
    let current = snapshot({
      state: 'nightEvent',
      pendingEventId: 'shower-night',
      inventory: inventory({
        'bucket-1': {
          instanceId: 'bucket-1',
          type: 'bucket',
          condition: 'usable',
        },
      }),
    });
    const outcome = accepted({
      code: 'event-resolved',
      cue: 'none',
      deltas: {},
    });
    const resolveEvent = vi.fn(() => {
      current = snapshot({
        state: 'nightEvent',
        pendingEventId: null,
        inventory: inventory({
          'bucket-1': {
            instanceId: 'bucket-1',
            type: 'bucket',
            condition: 'broken',
          },
        }),
      });
      activeBoundary = 'reaction';
      return outcome;
    });
    const setDocumentHidden = vi.fn((hidden: boolean) => {
      if (!hidden) return;
      if (activeBoundary === 'item') itemUse.resolve();
      else reaction.resolve();
    });
    const syncInventory = vi.fn();
    const reactToEventOutcome = vi.fn(() => {
      expect(syncInventory).not.toHaveBeenCalledWith(current);
      return reaction.promise;
    });
    const showEventOutcome = vi.fn();
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => current), resolveEvent },
      world: {
        revealEvent: vi.fn(() => Promise.resolve()),
        playEventItemUse: vi.fn(() => itemUse.promise),
        reactToEventOutcome,
        play: vi.fn(() => Promise.resolve()),
        syncInventory,
        setDocumentHidden,
        dispose: vi.fn(),
      },
      ui: {
        setSleepCovered: vi.fn(() => Promise.resolve()),
        settleCoveredScene: vi.fn(() => Promise.resolve()),
        showEventReveal: vi.fn(() => Promise.resolve()),
        setEventSelection: vi.fn(),
        setPaused: vi.fn(),
        showEventOutcome,
        holdEventOutcome: vi.fn(() => hold.promise),
        dispose: vi.fn(),
      },
    });
    phase.start();
    await flushPromises();
    phase.handleEventItem('bucket', 'bucket-1');
    await flushPromises();

    fakeDocument.hidden = true;
    listeners.get('visibilitychange')!(new Event('visibilitychange'));
    await flushPromises();
    expect(resolveEvent).not.toHaveBeenCalled();

    fakeDocument.hidden = false;
    listeners.get('visibilitychange')!(new Event('visibilitychange'));
    await flushPromises();
    expect(resolveEvent).toHaveBeenCalledOnce();
    expect(showEventOutcome).not.toHaveBeenCalled();

    fakeDocument.hidden = true;
    listeners.get('visibilitychange')!(new Event('visibilitychange'));
    await flushPromises();
    expect(showEventOutcome).not.toHaveBeenCalled();

    fakeDocument.hidden = false;
    listeners.get('visibilitychange')!(new Event('visibilitychange'));
    await flushPromises();
    expect(showEventOutcome).not.toHaveBeenCalled();
    hold.resolve();
    phase.dispose();
  });

  it.each([
    ['safe', {}, ['audio-stop:0.02', 'react'], ['audio-stop:0.02', 'react']],
    ['attack', { health: -20 }, ['react'], ['react', 'audio-stop:0.08']],
  ] as const)(
    'coordinates the Eerie Melody loop around a %s result motion',
    async (_kind, deltas, beforeSettle, afterSettle) => {
      const calls: string[] = [];
      const reaction = deferred();
      const hold = deferred();
      const melodyVoice: AudioVoice = {
        id: 'eerieMelody',
        setGain: vi.fn(),
        setPaused: vi.fn(),
        stop: vi.fn((fadeSeconds) => calls.push(`audio-stop:${fadeSeconds}`)),
        onEnded: vi.fn(),
      };
      const backend: AudioBackend = {
        load: vi.fn(() => Promise.resolve()),
        unlock: vi.fn(() => Promise.resolve()),
        play: vi.fn((id: SoundId) => {
          if (id === 'eerieMelody') calls.push('audio-begin');
          return id === 'eerieMelody'
            ? melodyVoice
            : {
                id,
                setGain: vi.fn(),
                setPaused: vi.fn(),
                stop: vi.fn(),
                onEnded: vi.fn(),
              };
        }),
        playSpatialLoop: vi.fn(() => null),
        setListenerPose: vi.fn(),
        setBusGain: vi.fn(),
        setMasterGain: vi.fn(),
        dispose: vi.fn(),
      };
      let current = snapshot({
        state: 'nightEvent',
        pendingEventId: 'eerie-melody',
      });
      const phase = SurvivalPhase.forTest({
        audio: AudioSystem.forTest(backend),
        session: {
          snapshot: vi.fn(() => current),
          resolveEvent: vi.fn(() => {
            current = snapshot({ state: 'nightEvent', pendingEventId: null });
            return accepted({
              code: 'event-resolved',
              cue: 'impact',
              deltas,
            });
          }),
        },
        world: {
          revealEvent: vi.fn(() => {
            calls.push('reveal');
            return Promise.resolve();
          }),
          play: vi.fn(() => Promise.resolve()),
          reactToEventOutcome: vi.fn(() => {
            calls.push('react');
            return reaction.promise;
          }),
          dispose: vi.fn(),
        },
        ui: {
          setSleepCovered: vi.fn(() => Promise.resolve()),
          settleCoveredScene: vi.fn(() => Promise.resolve()),
          showEventReveal: vi.fn(() => Promise.resolve()),
          setEventSelection: vi.fn(),
          playEventChoiceBeat: vi.fn(() => Promise.resolve()),
          showFeedback: vi.fn(),
          holdEventOutcome: vi.fn(() => hold.promise),
          dispose: vi.fn(),
        },
      });

      phase.start();
      await flushPromises();
      expect(calls.slice(0, 2)).toEqual(['audio-begin', 'reveal']);
      calls.length = 0;

      phase.handleEndure();
      await flushPromises();
      expect(calls).toEqual(beforeSettle);

      reaction.resolve();
      await flushPromises();
      expect(calls).toEqual(afterSettle);

      phase.dispose();
      expect(melodyVoice.stop).toHaveBeenCalledOnce();
      hold.resolve();
    },
  );

  it.each([
    ['death-stare', 'flashlight', 'flashlight-1', 'flashlight'],
    ['swarm-of-anglerfish', 'flashlight', 'flashlight-1', 'flashlight'],
    ['swarm-of-anglerfish', 'baitTin', 'baitTin-1', 'baitTin'],
    ['whirlpool', 'swimRing', 'swimRing-1', 'swimRing'],
  ] as const)(
    'keeps %s %s outcome text hidden after hide and restore',
    async (eventId, choiceId, instanceId, itemType) => {
      const listeners = new Map<string, EventListener>();
      const fakeDocument = {
        hidden: false,
        addEventListener: vi.fn((type: string, listener: EventListener) => listeners.set(type, listener)),
        removeEventListener: vi.fn((type: string) => listeners.delete(type)),
      };
      vi.stubGlobal('document', fakeDocument);
      const itemUse = deferred();
      let current = snapshot({
        state: 'nightEvent',
        pendingEventId: eventId,
        inventory: inventory({
          [instanceId]: { instanceId, type: itemType, condition: 'usable' as const },
        }),
      });
      const outcome = accepted({
        code: 'event-resolved',
        message: `${eventId} result`,
        deltas: {},
        cue: 'none',
      });
      const resolveEvent = vi.fn(() => {
        current = snapshot({
          state: 'nightEvent',
          pendingEventId: null,
          inventory: current.inventory,
        });
        return outcome;
      });
      const showEventResult = vi.fn();
      const setDocumentHidden = vi.fn((hidden: boolean) => {
        if (hidden) itemUse.resolve();
      });
      const phase = SurvivalPhase.forTest({
        session: { snapshot: vi.fn(() => current), resolveEvent },
        world: {
          stageEvent: vi.fn(),
          revealEvent: vi.fn(() => Promise.resolve()),
          playEventItemUse: vi.fn(() => itemUse.promise),
          reactToEventOutcome: vi.fn(() => Promise.resolve()),
          syncInventory: vi.fn(),
          setDocumentHidden,
          dispose: vi.fn(),
        },
        ui: {
          beginEventPresentation: vi.fn(),
          setSleepCovered: vi.fn(() => Promise.resolve()),
          showEventReveal: vi.fn(() => Promise.resolve()),
          setEventSelection: vi.fn(),
          setEventUsing: vi.fn(),
          setBusy: vi.fn(),
          setPaused: vi.fn(),
          showEventResult,
          holdEventOutcome: vi.fn(() => new Promise<void>(() => undefined)),
          dispose: vi.fn(),
        },
      });
      phase.start();
      await flushPromises();
      phase.handleEventItem(choiceId, instanceId);
      phase.update(0.2, 0.2);
      expect(showEventResult).not.toHaveBeenCalled();

      fakeDocument.hidden = true;
      listeners.get('visibilitychange')!(new Event('visibilitychange'));
      await flushPromises();
      expect(resolveEvent).not.toHaveBeenCalled();

      fakeDocument.hidden = false;
      listeners.get('visibilitychange')!(new Event('visibilitychange'));
      await flushPromises();

      expect(setDocumentHidden).toHaveBeenNthCalledWith(1, true);
      expect(setDocumentHidden).toHaveBeenNthCalledWith(2, false);
      expect(resolveEvent).toHaveBeenCalledOnce();
      expect(showEventResult).not.toHaveBeenCalled();
      phase.dispose();
    },
  );

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
