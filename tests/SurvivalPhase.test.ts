// Importance: 10/10 (scaled from 5/5). Protects survival orchestration and lifecycle.
import { PerspectiveCamera, Scene } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SurvivalAudio } from '../src/audio/SurvivalAudio';
import type { PhaseContext } from '../src/app/GamePhase';
import type { AudioBackend, AudioVoice } from '../src/audio/AudioBackend';
import { AudioSystem } from '../src/audio/AudioSystem';
import type { SoundId } from '../src/audio/audioManifest';
import type { ItemId, ItemInstance, ItemInstanceId } from '../src/game/ItemState';
import type { SceneRenderer } from '../src/rendering/SceneRenderer';
import type { ProjectedBoatBounds } from '../src/survival/BoatInteraction';
import { BoatWorld } from '../src/survival/BoatWorld';
import type { EventChoicePresentation } from '../src/survival/FocusedEventPresentation';
import {
  PLANE_CHOICE_WINDOW_SECONDS,
  SURVIVAL_EVENTS,
  type DriftingItemEventId,
} from '../src/survival/eventCatalog';
import type { FishingCastPoint } from '../src/survival/FishingSession';
import type { JournalEntry, JournalNightRecord } from '../src/survival/journalRecords';
import { formatDiveResult } from '../src/survival/SurvivalDayActionFlow';
import { SurvivalPhase, type SurvivalPhaseStart } from '../src/survival/SurvivalPhase';
import { deriveEventVariantSeed } from '../src/survival/eventPresentationOutcome';
import type { EventOutcomePresentation } from '../src/survival/eventPresentationTypes';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import type {
  SurvivalInventorySnapshot,
  SurvivalItemState,
  SurvivalState,
} from '../src/survival/survivalTypes';
import type { SurvivalSnapshot } from '../src/survival/survivalSnapshot';
import type { RewardResultView } from '../src/ui/SurvivalCoverViewModel';
import type { FocusedEventFocusView } from '../src/ui/SurvivalUiViewModel';
import type { FishingResultView, FishingUiState } from '../src/ui/SurvivalFishingView';
import type { EventContextChoice } from '../src/ui/SurvivalUiViewModel';
import type { SurvivalUI } from '../src/ui/SurvivalUI';
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
    state: 'day', ending: null, day: 1, pressure: 0, health: 100, hunger: 20, energy: 3, hull: 100,
    history: [],
    food: 0, bait: 0, recoveredFood: 0, recoveredBait: 0, repairMaterial: 0,
    rescueLead: 0, rescueTraceFinds: 0, radioSignalAvailable: false, radioSignalsSent: 0,
    chest: { state: 'none', acquiredDay: null },
    weather: 'calm', actedToday: false,
    journalEntries: [], inventory: inventory(), savedItems: [], carlitos: null, pendingEventId: null,
    pendingEventTargetId: null,
    lastOutcome: null, seed: 8, ...overrides,
  };
}

function saved(...types: ItemId[]): ItemInstance[] {
  return types.map((type, index) => ({
    instanceId: `${type}-${index + 1}` as ItemInstanceId,
    type,
  }));
}

function stablePhaseRig() {
  const onCheckpointChange = vi.fn();
  const session = new SurvivalSession(saved(), { seed: 41 });
  const phase = SurvivalPhase.forTest({
    session,
    world: {},
    ui: {},
    onCheckpointChange,
  });
  phase.start();
  onCheckpointChange.mockClear();
  return { phase, session, onCheckpointChange };
}

function stablePhase(): SurvivalPhase {
  return stablePhaseRig().phase;
}

describe('survival checkpoints', () => {
  it('emits an initial stable survival checkpoint', () => {
    const onCheckpointChange = vi.fn();
    const session = new SurvivalSession(saved(), { seed: 41 });
    const phase = SurvivalPhase.forTest({
      session,
      world: {},
      ui: {},
      onCheckpointChange,
      scavengeElapsedSeconds: 12,
    });

    phase.start();

    expect(onCheckpointChange).toHaveBeenLastCalledWith({
      scavengeElapsedSeconds: 12,
      session: session.exportCheckpoint(),
    });
  });

  it('does not expose a checkpoint while presentation is busy', () => {
    const phase = stablePhase();
    const internals = phase as unknown as { setBusy(value: boolean): void };
    internals.setBusy(true);

    expect(phase.getSurvivalCheckpoint()).toBeNull();
  });

  it('does not expose a checkpoint while fishing is active', () => {
    const phase = stablePhase();
    const internals = phase as unknown as {
      fishingFlow: { hasActiveAttempt(): boolean };
    };
    vi.spyOn(internals.fishingFlow, 'hasActiveAttempt').mockReturnValue(true);

    expect(phase.getSurvivalCheckpoint()).toBeNull();
  });

  it('emits after busy presentation settles', () => {
    const { phase, onCheckpointChange } = stablePhaseRig();
    const internals = phase as unknown as { setBusy(value: boolean): void };
    internals.setBusy(true);
    internals.setBusy(false);

    expect(onCheckpointChange).toHaveBeenCalledTimes(1);
  });

  it('clears the checkpoint for a terminal snapshot', () => {
    const onCheckpointChange = vi.fn();
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => snapshot({ state: 'dead' })) },
      world: {},
      ui: {},
      onCheckpointChange,
    });

    phase.start();

    expect(onCheckpointChange).toHaveBeenCalledOnce();
    expect(onCheckpointChange).toHaveBeenLastCalledWith(null);
  });

  it('restores elapsed time and world data through SurvivalSession.restore', () => {
    const source = new SurvivalSession(saved('cannedFood'), {
      seed: 41,
      initial: { day: 6 },
    });
    const checkpoint = {
      scavengeElapsedSeconds: 27,
      session: source.exportCheckpoint(),
    };
    const start: SurvivalPhaseStart = { kind: 'restored', checkpoint };
    const syncInventory = vi.fn();
    const render = vi.fn();
    const onCheckpointChange = vi.fn();
    const restore = vi.spyOn(SurvivalSession, 'restore');
    const phase = SurvivalPhase.forTestStart({
      world: { syncInventory },
      ui: { render },
      onCheckpointChange,
    }, start);

    try {
      phase.start();

      expect(restore).toHaveBeenCalledExactlyOnceWith(checkpoint.session);
      expect(syncInventory).toHaveBeenCalledWith(expect.objectContaining({
        day: 6,
        savedItems: saved('cannedFood'),
      }));
      expect(render).toHaveBeenCalledWith(expect.objectContaining({ day: 6 }), expect.any(Function));
      expect(phase.getSurvivalCheckpoint()).toEqual(checkpoint);
      expect(onCheckpointChange).toHaveBeenLastCalledWith(checkpoint);
    } finally {
      phase.dispose();
      restore.mockRestore();
    }
  });

  it.each([
    ['day event', 'wreckage'],
    ['night event', 'bad-sleep'],
  ] as const)(
    'restores a %s without emitting until its reveal settles',
    async (_label, eventId) => {
      const source = new SurvivalSession([], {
        seed: 41,
        initial: { day: 3 },
        initialEventId: eventId,
      });
      const checkpoint = {
        scavengeElapsedSeconds: 18,
        session: source.exportCheckpoint(),
      };
      const reveal = deferred();
      const setEventSelection = vi.fn();
      const onCheckpointChange = vi.fn();
      const phase = SurvivalPhase.forTestStart({
        world: {
          syncInventory: vi.fn(),
          stageEvent: vi.fn(),
          revealEvent: vi.fn(() => reveal.promise),
        },
        ui: {
          render: vi.fn(),
          beginEventPresentation: vi.fn(),
          setSleepCovered: vi.fn(() => Promise.resolve()),
          showEventReveal: vi.fn(() => Promise.resolve()),
          setEventSelection,
          setBusy: vi.fn(),
        },
        onCheckpointChange,
      }, { kind: 'restored', checkpoint });

      try {
        phase.start();
        await flushPromises();

        expect(phase.getSurvivalCheckpoint()).toBeNull();
        expect(onCheckpointChange).not.toHaveBeenCalled();

        reveal.resolve();
        await flushPromises();

        expect(setEventSelection).toHaveBeenCalledOnce();
        expect(phase.getSurvivalCheckpoint()).toEqual(checkpoint);
        expect(onCheckpointChange).toHaveBeenLastCalledWith(checkpoint);
      } finally {
        phase.dispose();
      }
    },
  );

  it('waits for the Chest Attack reveal before it emits the choice checkpoint', async () => {
    const source = new SurvivalSession([], {
      seed: 41,
      initialChest: { state: 'mimic', acquiredDay: 1 },
      initialEventId: 'chest-attack',
    });
    const checkpoint = {
      scavengeElapsedSeconds: 18,
      session: source.exportCheckpoint(),
    };
    const reveal = deferred();
    const choice = deferred();
    const onCheckpointChange = vi.fn();
    const phase = SurvivalPhase.forTestStart({
      world: {
        syncInventory: vi.fn(),
        stageEvent: vi.fn(),
        revealEvent: vi.fn(() => reveal.promise),
        playEventChoice: vi.fn(() => choice.promise),
      },
      ui: {
        render: vi.fn(),
        beginEventPresentation: vi.fn(),
        setSleepCovered: vi.fn(() => Promise.resolve()),
        showEventReveal: vi.fn(() => Promise.resolve()),
        setEventSelection: vi.fn(),
        setBusy: vi.fn(),
      },
      onCheckpointChange,
    }, { kind: 'restored', checkpoint });

    try {
      phase.start();
      await flushPromises();

      expect(onCheckpointChange).not.toHaveBeenCalled();

      reveal.resolve();
      await flushPromises();

      expect(onCheckpointChange).toHaveBeenCalledExactlyOnceWith(checkpoint);
    } finally {
      phase.dispose();
      choice.resolve();
    }
  });
});

function completedEntry(
  day: number,
  nighttime: JournalNightRecord = {
    kind: 'event',
    event: {
      phase: 'night', eventId: `night-${day}`, title: 'Quiet Night',
      prompt: 'The night passed without incident.', attemptedChoiceId: null,
      attemptedItemId: null,
      choiceLabel: 'Endure', outcomeCode: 'event-resolved',
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
    deltas: { energy: -1, food: 1 }, cue: 'fish' as const, ...overrides,
  };
}

describe('formatDiveResult', () => {

  it('shows the truthful applied loss for a low-health fatal injury', () => {
    expect(formatDiveResult(accepted({
      deltas: { energy: -3, health: -4 },
    }))).toEqual({
      title: 'DIVE RESULT',
      reward: null,
      lines: ['NOTHING FOUND', 'YOU SUFFERED SOME INJURIES'],
    });
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

interface DriftingItemRigOptions {
  readonly audio?: AudioSystem;
  readonly rejectChoice?: boolean;
  readonly onRestart?: () => void;
  readonly onFatalError?: (error: unknown) => void;
}

function createDriftingItemRig(
  eventId: DriftingItemEventId,
  options: DriftingItemRigOptions = {},
) {
  const calls: string[] = [];
  const realSession = new SurvivalSession([{
    instanceId: 'carlitos-1',
    type: 'carlitos',
  }], {
    seed: 41,
    random: sequenceRandom([0]),
    initial: { day: 3, energy: 3 },
    initialCarlitos: { hunger: 5, energy: 3 },
    initialEventId: eventId,
  });
  const resolveEvent = vi.fn((response: Parameters<SurvivalSession['resolveEvent']>[0]) => {
    calls.push(`resolve:${response.kind === 'choice' ? response.choiceId : response.kind}`);
    if (options.rejectChoice) {
      return accepted({
        accepted: false,
        code: 'requirements-unmet',
        message: 'The choice is no longer available.',
        deltas: {},
      });
    }
    return realSession.resolveEvent(response);
  });
  const session = {
    snapshot: vi.fn(realSession.snapshot.bind(realSession)),
    resolveEvent,
    companionEventActionAvailability: vi.fn(
      realSession.companionEventActionAvailability.bind(realSession),
    ),
  };
  const animations = {
    enter: deferred(),
    exit: deferred(),
    retrieve: deferred(),
    delegate: deferred(),
    recede: deferred(),
  };
  const world = {
    stageEvent: vi.fn(),
    revealEvent: vi.fn(() => Promise.resolve()),
    enterFocusedEventView: vi.fn((selectedEventId: DriftingItemEventId) => {
      calls.push(`enter:${selectedEventId}`);
      return animations.enter.promise;
    }),
    exitFocusedEventView: vi.fn(() => {
      calls.push('exit');
      return animations.exit.promise;
    }),
    retrieveDriftingItem: vi.fn((selectedEventId: DriftingItemEventId) => {
      calls.push(`retrieve:${selectedEventId}`);
      return animations.retrieve.promise;
    }),
    delegateDriftingItem: vi.fn((selectedEventId: DriftingItemEventId) => {
      calls.push(`delegate:${selectedEventId}`);
      return animations.delegate.promise;
    }),
    recedeDriftingItem: vi.fn((selectedEventId: DriftingItemEventId) => {
      calls.push(`recede:${selectedEventId}`);
      return animations.recede.promise;
    }),
    clearEvent: vi.fn(() => calls.push('clear-world')),
    setDocumentHidden: vi.fn(),
    dispose: vi.fn(),
  };
  const showFocusedEvent = vi.fn((view: FocusedEventFocusView) => {
    calls.push(`show-focus:${view.eventId}`);
  });
  const hideFocusedEvent = vi.fn(() => calls.push('hide-focus'));
  const restoreCommandFocus = vi.fn(() => calls.push('restore-focus'));
  const setEventSelection = vi.fn((
    _eligible: ReadonlyMap<ItemInstanceId, string>,
    choices: readonly EventContextChoice[] = [],
  ) => calls.push(`selection:${choices.map(({ id }) => id).join(',')}`));
  const setCameraTurnState = vi.fn();
  const ui: Partial<SurvivalUI> = {
    beginEventPresentation: vi.fn(),
    setSleepCovered: vi.fn(() => Promise.resolve()),
    settleCoveredScene: vi.fn(() => Promise.resolve()),
    showEventReveal: vi.fn(() => Promise.resolve()),
    setEventSelection,
    playEventChoiceBeat: vi.fn(() => Promise.resolve()),
    showFocusedEvent,
    hideFocusedEvent,
    showFeedback: vi.fn(),
    clearEventPresentation: vi.fn(() => calls.push('clear-ui')),
    setBusy: vi.fn((value: boolean) => calls.push(value ? 'busy' : 'ready')),
    setCameraTurnState,
    render: vi.fn(),
    setJournalUnread: vi.fn(),
    setAnchors: vi.fn(),
    restoreCommandFocus,
    dispose: vi.fn(),
  };
  const eventBundles = {
    beginLoad: vi.fn(() => undefined),
    activate: vi.fn(() => Promise.resolve()),
    cancelPendingActivation: vi.fn(),
    releaseActive: vi.fn(() => calls.push('release-bundle')),
    dispose: vi.fn(),
  };
  const onFatalError = options.onFatalError ?? vi.fn();
  const phase = SurvivalPhase.forTest({
    audio: options.audio,
    session,
    world,
    ui,
    eventBundles,
    onRestart: options.onRestart,
    onFatalError,
  }, eventId);
  return {
    eventId,
    calls,
    phase,
    realSession,
    session,
    resolveEvent,
    world,
    ui,
    eventBundles,
    animations,
    showFocusedEvent,
    hideFocusedEvent,
    restoreCommandFocus,
    setEventSelection,
    setCameraTurnState,
    onFatalError,
  };
}

type DriftingItemRig = ReturnType<typeof createDriftingItemRig>;

async function revealDriftingItem(rig: DriftingItemRig): Promise<void> {
  rig.phase.start();
  await flushPromises();
}

async function enterDriftingItemFocus(rig: DriftingItemRig): Promise<void> {
  rig.ui.onFocusedEventSelect?.(rig.eventId);
  rig.animations.enter.resolve();
  await flushPromises();
}

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
  for (let index = 0; index < 128; index += 1) await Promise.resolve();
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
      ending: options.terminalState === 'dead'
        ? { id: 'death', day: 1, savedPickupCount: 0, cause: { kind: 'diving' } }
        : options.terminalState === 'sunk'
          ? { id: 'sinking', day: 1, savedPickupCount: 0, cause: { eventId: null } }
          : options.terminalState === 'rescued'
            ? { id: 'rescue', day: 1, savedPickupCount: 0, signalAssisted: false }
            : null,
      energy: 0,
      food: 1,
      health: options.terminalState === 'dead' ? 0 : 100,
    });
    return outcome;
  });
  let impact: () => void = () => undefined;
  const playDive = vi.fn((instanceId: ItemInstanceId, options: {
    readonly onWaterImpact: () => void;
  }) => {
    calls.push(`playDive:${instanceId}`);
    impact = options.onWaterImpact;
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
    showRewardResult: vi.fn((_view: RewardResultView) => {
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

  it('keeps the radio action available until the incoming sound ends', async () => {
    let current = snapshot({ state: 'nightEvent', day: 4 });
    const signal = { finish: null as (() => void) | null };
    const beginRadioSignal = vi.spyOn(SurvivalAudio.prototype, 'beginRadioSignal')
      .mockImplementation((onEnded) => {
        signal.finish = onEnded;
        return true;
      });
    const expireRadioSignal = vi.fn(() => {
      if (!current.radioSignalAvailable) return false;
      current = snapshot({ ...current, radioSignalAvailable: false });
      return true;
    });
    const render = vi.fn();
    const phase = SurvivalPhase.forTest({
      session: {
        snapshot: vi.fn(() => current),
        beginDawn: vi.fn(() => {
          current = snapshot({
            state: 'day',
            day: 5,
            radioSignalAvailable: true,
          });
          return accepted({ code: 'dawn', cue: 'dawn', deltas: {} });
        }),
        expireRadioSignal,
      },
      world: {
        play: vi.fn(() => Promise.resolve()),
        dispose: vi.fn(),
      },
      ui: {
        render,
        setJournalUnread: vi.fn(),
        dispose: vi.fn(),
      },
    });

    await (phase as unknown as {
      eventFlow: {
        runDawn(generation: number, operation: number): Promise<SurvivalSnapshot>;
      };
    }).eventFlow.runDawn(0, 0);

    expect(beginRadioSignal).toHaveBeenCalledOnce();
    expect(current.radioSignalAvailable).toBe(true);
    signal.finish?.();
    expect(expireRadioSignal).toHaveBeenCalledOnce();
    expect(current.radioSignalAvailable).toBe(false);
    expect(render).toHaveBeenLastCalledWith(
      expect.objectContaining({ radioSignalAvailable: false }),
      expect.any(Function),
    );

    phase.dispose();
    beginRadioSignal.mockRestore();
  });

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
    expect(rig.ui.showRewardResult).toHaveBeenCalledWith({
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

  it('denies a second command while the dive sequence runs', () => {
    const rig = createDiveRig();

    rig.phase.handleAction('dive');
    rig.phase.handleAction('repair');

    expect(rig.perform).toHaveBeenCalledOnce();
    expect(rig.deny).toHaveBeenCalledOnce();
    rig.phase.dispose();
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

  it('opens the recovered barrel before showing its reward', async () => {
    const played: SoundId[] = [];
    const backend: AudioBackend = {
      acquire: vi.fn(() => Promise.resolve()),
      release: vi.fn(),
      unlock: vi.fn(() => Promise.resolve()),
      play: vi.fn((id: SoundId): AudioVoice => {
        played.push(id);
        return {
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
    const rig = createDriftingItemRig('drifting-supplies', {
      audio: AudioSystem.forTest(backend),
    });
    const rewardHold = deferred();
    const rewardSummary = {
      kind: 'resource',
      id: 'food',
      quantity: 1,
    } as const;
    const showRewardResult = vi.fn(() => {
      rig.calls.push('show-reward');
      return rewardHold.promise;
    });
    rig.ui.showRewardResult = showRewardResult;
    await revealDriftingItem(rig);
    await enterDriftingItemFocus(rig);

    rig.ui.onFocusedEventChoice?.({ id: 'retrieve', instanceId: null });
    await flushPromises();
    expect(rig.hideFocusedEvent).toHaveBeenCalledOnce();
    rig.animations.retrieve.resolve();
    await flushPromises();

    expect(played).toContain('chest');
    expect(showRewardResult).toHaveBeenCalledExactlyOnceWith({
      title: 'SALVAGE',
      reward: rewardSummary,
      lines: [],
    });
    expect(rig.world.exitFocusedEventView).not.toHaveBeenCalled();
    expect(rig.calls.indexOf('retrieve:drifting-supplies'))
      .toBeLessThan(rig.calls.indexOf('show-reward'));
    expect(rig.calls.indexOf('hide-focus'))
      .toBeLessThan(rig.calls.indexOf('show-reward'));

    rewardHold.resolve();
    await flushPromises();
    expect(rig.world.exitFocusedEventView).toHaveBeenCalledOnce();
    rig.animations.exit.resolve();
    await flushPromises();
    rig.phase.dispose();
  });

  it.each([
    'drifting-supplies',
    'drifting-chest',
  ] as const)('returns from %s automatically after pickup', async (eventId) => {
    const rig = createDriftingItemRig(eventId);
    await revealDriftingItem(rig);
    await enterDriftingItemFocus(rig);

    rig.ui.onFocusedEventChoice?.({ id: 'retrieve', instanceId: null });
    rig.ui.onFocusedEventChoice?.({ id: 'retrieve', instanceId: null });
    await flushPromises();
    expect(rig.resolveEvent).toHaveBeenCalledOnce();
    expect(rig.world.retrieveDriftingItem).toHaveBeenCalledOnce();
    expect(rig.world.retrieveDriftingItem).toHaveBeenCalledWith(eventId);
    expect(rig.world.exitFocusedEventView).not.toHaveBeenCalled();

    rig.animations.retrieve.resolve();
    await flushPromises();
    expect(rig.world.exitFocusedEventView).toHaveBeenCalledOnce();
    expect(rig.world.clearEvent).not.toHaveBeenCalled();
    expect(rig.eventBundles.releaseActive).not.toHaveBeenCalled();
    rig.animations.exit.resolve();
    await flushPromises();
    expect(rig.calls.indexOf('exit')).toBeLessThan(rig.calls.indexOf('clear-world'));
    expect(rig.calls.indexOf('clear-world')).toBeLessThan(rig.calls.indexOf('release-bundle'));
    expect(rig.calls.indexOf('release-bundle')).toBeLessThan(rig.calls.indexOf('restore-focus'));
    rig.phase.dispose();
  });

  it('shows the chest icon after a menu-launched Drifting Chest pickup', async () => {
    const rig = createDriftingItemRig('drifting-chest');
    const showRewardResult = vi.fn(() => Promise.resolve());
    rig.ui.showRewardResult = showRewardResult;
    await revealDriftingItem(rig);
    await enterDriftingItemFocus(rig);

    rig.ui.onFocusedEventChoice?.({ id: 'retrieve', instanceId: null });
    await flushPromises();
    expect(rig.realSession.snapshot().chest).toMatchObject({ state: 'closed' });

    rig.animations.retrieve.resolve();
    await flushPromises();
    rig.animations.exit.resolve();
    await flushPromises();

    expect(rig.setCameraTurnState).toHaveBeenLastCalledWith(true, false);
    expect(showRewardResult).not.toHaveBeenCalled();
    rig.phase.dispose();
  });

  it('waits for visibility before resolving a settled drifting item choice beat', async () => {
    const listeners = new Map<string, EventListener>();
    const fakeDocument = {
      hidden: false,
      addEventListener: vi.fn((type: string, listener: EventListener) => listeners.set(type, listener)),
      removeEventListener: vi.fn((type: string) => listeners.delete(type)),
    };
    vi.stubGlobal('document', fakeDocument);
    const choiceBeat = deferred();
    const rig = createDriftingItemRig('drifting-supplies');
    rig.ui.playEventChoiceBeat = vi.fn(() => choiceBeat.promise);
    await revealDriftingItem(rig);
    await enterDriftingItemFocus(rig);
    rig.ui.onFocusedEventChoice?.({ id: 'retrieve', instanceId: null });

    fakeDocument.hidden = true;
    listeners.get('visibilitychange')!(new Event('visibilitychange'));
    choiceBeat.resolve();
    await flushPromises();
    expect(rig.resolveEvent).not.toHaveBeenCalled();

    fakeDocument.hidden = false;
    listeners.get('visibilitychange')!(new Event('visibilitychange'));
    await flushPromises();
    expect(rig.resolveEvent).toHaveBeenCalledOnce();
    expect(rig.world.retrieveDriftingItem).toHaveBeenCalledOnce();
    rig.phase.dispose();
  });

  it('settles hidden drifting item retrieval and defers camera return until resume', async () => {
    const listeners = new Map<string, EventListener>();
    const fakeDocument = {
      hidden: false,
      addEventListener: vi.fn((type: string, listener: EventListener) => listeners.set(type, listener)),
      removeEventListener: vi.fn((type: string) => listeners.delete(type)),
    };
    vi.stubGlobal('document', fakeDocument);
    const rig = createDriftingItemRig('drifting-supplies');
    rig.world.setDocumentHidden.mockImplementation((hidden: boolean) => {
      if (hidden) rig.animations.retrieve.resolve();
    });
    await revealDriftingItem(rig);
    await enterDriftingItemFocus(rig);
    rig.ui.onFocusedEventChoice?.({ id: 'retrieve', instanceId: null });
    await flushPromises();
    expect(rig.resolveEvent).toHaveBeenCalledOnce();

    fakeDocument.hidden = true;
    listeners.get('visibilitychange')!(new Event('visibilitychange'));
    await flushPromises();
    expect(rig.world.exitFocusedEventView).not.toHaveBeenCalled();
    fakeDocument.hidden = false;
    listeners.get('visibilitychange')!(new Event('visibilitychange'));
    await flushPromises();
    expect(rig.resolveEvent).toHaveBeenCalledOnce();
    expect(rig.world.exitFocusedEventView).toHaveBeenCalledOnce();
    rig.phase.dispose();
  });

  it('settles hidden explicit drift choice and defers camera return until resume', async () => {
    const listeners = new Map<string, EventListener>();
    const fakeDocument = {
      hidden: false,
      addEventListener: vi.fn((type: string, listener: EventListener) => listeners.set(type, listener)),
      removeEventListener: vi.fn((type: string) => listeners.delete(type)),
    };
    vi.stubGlobal('document', fakeDocument);
    const rig = createDriftingItemRig('drifting-supplies');
    rig.world.setDocumentHidden.mockImplementation((hidden: boolean) => {
      if (hidden) rig.animations.recede.resolve();
    });
    await revealDriftingItem(rig);
    await enterDriftingItemFocus(rig);
    rig.ui.onFocusedEventChoice?.({ id: 'sleep', instanceId: null });
    await flushPromises();
    expect(rig.resolveEvent).toHaveBeenCalledOnce();
    expect(rig.world.recedeDriftingItem).toHaveBeenCalledOnce();

    fakeDocument.hidden = true;
    listeners.get('visibilitychange')!(new Event('visibilitychange'));
    await flushPromises();
    expect(rig.world.exitFocusedEventView).not.toHaveBeenCalled();

    fakeDocument.hidden = false;
    listeners.get('visibilitychange')!(new Event('visibilitychange'));
    await flushPromises();
    expect(rig.world.exitFocusedEventView).toHaveBeenCalledOnce();
    rig.animations.exit.resolve();
    await flushPromises();
    rig.phase.dispose();
  });

  it('lets Drifting Cargo recede without a result and resumes the same day', async () => {
    let current = snapshot({
      state: 'dayEvent',
      day: 4,
      pendingEventId: 'drifting-supplies',
    });
    const recedeDriftingItem = vi.fn(() => Promise.resolve());
    const clearEvent = vi.fn();
    const restoreCommandFocus = vi.fn();
    const ui: Partial<SurvivalUI> = {
      setSleepCovered: vi.fn(() => Promise.resolve()),
      showEventReveal: vi.fn(() => Promise.resolve()),
      setEventSelection: vi.fn(),
      playEventChoiceBeat: vi.fn(() => Promise.resolve()),
      clearEventPresentation: vi.fn(),
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
        enterFocusedEventView: vi.fn(() => Promise.resolve()),
        exitFocusedEventView: vi.fn(() => Promise.resolve()),
        recedeDriftingItem,
        clearEvent,
        dispose: vi.fn(),
      },
      ui,
    });

    phase.start();
    await flushPromises();
    ui.onFocusedEventSelect?.('drifting-supplies');
    await flushPromises();
    ui.onFocusedEventChoice?.({ id: 'sleep', instanceId: null });
    await flushPromises();
    await flushPromises();

    expect(recedeDriftingItem).toHaveBeenCalledOnce();
    expect(clearEvent).toHaveBeenCalledOnce();
    expect(restoreCommandFocus).toHaveBeenCalledOnce();
    expect(current).toMatchObject({ state: 'day', day: 4 });
  });

  it('keeps a real insufficient-energy Drifting Cargo encounter choosing without mutation', async () => {
    const realSession = new SurvivalSession([], {
      seed: 28,
      random: sequenceRandom([0]),
      initial: { day: 3, energy: 2 },
      initialEventId: 'drifting-supplies',
    });
    const before = realSession.snapshot();
    const retrieveDriftingItem = vi.fn(() => Promise.resolve());
    const setEventSelection = vi.fn();
    const ui: Partial<SurvivalUI> = {
      setSleepCovered: vi.fn(() => Promise.resolve()),
      showEventReveal: vi.fn(() => Promise.resolve()),
      setEventSelection,
      playEventChoiceBeat: vi.fn(() => Promise.resolve()),
      showFeedback: vi.fn(),
      setBusy: vi.fn(),
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
        enterFocusedEventView: vi.fn(() => Promise.resolve()),
        retrieveDriftingItem,
        dispose: vi.fn(),
      },
      ui,
    });

    phase.start();
    await flushPromises();
    ui.onFocusedEventSelect?.('drifting-supplies');
    await flushPromises();
    ui.onFocusedEventChoice?.({ id: 'retrieve', instanceId: null });
    await flushPromises();

    expect(realSession.snapshot()).toMatchObject({
      state: before.state,
      day: before.day,
      energy: before.energy,
      food: before.food,
      bait: before.bait,
      repairMaterial: before.repairMaterial,
      inventory: before.inventory,
      pendingEventId: 'drifting-supplies',
    });
    expect(setEventSelection).toHaveBeenCalledTimes(3);
    expect(retrieveDriftingItem).not.toHaveBeenCalled();
  });

  it('reveals Drifting Cargo after resolving a non-terminal night event', async () => {
    let current = snapshot({
      state: 'nightEvent',
      day: 2,
      pendingEventId: 'drifting-supplies',
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
            pendingEventId: 'drifting-supplies',
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

    expect(stageEvent).toHaveBeenCalledWith('drifting-supplies', expect.any(Number));
    expect(current).toMatchObject({ state: 'dayEvent', day: 3 });
  });

  it.each(['dispose', 'restart'] as const)(
    'cancels a stale Drifting Cargo retrieval after %s',
    async (teardown) => {
      let current = snapshot({
        state: 'dayEvent',
        day: 3,
        energy: 3,
        pendingEventId: 'drifting-supplies',
      });
      const retrieval = deferred();
      const restoreCommandFocus = vi.fn();
      const onRestart = vi.fn();
      const ui: Partial<SurvivalUI> = {
        setSleepCovered: vi.fn(() => Promise.resolve()),
        showEventReveal: vi.fn(() => Promise.resolve()),
        setEventSelection: vi.fn(),
        playEventChoiceBeat: vi.fn(() => Promise.resolve()),
        clearEventPresentation: vi.fn(),
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
          enterFocusedEventView: vi.fn(() => Promise.resolve()),
          retrieveDriftingItem: vi.fn(() => retrieval.promise),
          clearEvent: vi.fn(() => retrieval.resolve()),
          dispose: vi.fn(() => retrieval.resolve()),
        },
        ui,
        onRestart,
      });

      phase.start();
      await flushPromises();
      ui.onFocusedEventSelect?.('drifting-supplies');
      await flushPromises();
      ui.onFocusedEventChoice?.({ id: 'retrieve', instanceId: null });
      await flushPromises();
      if (teardown === 'dispose') phase.dispose();
      else phase.requestRestart();
      await flushPromises();

      expect(restoreCommandFocus).not.toHaveBeenCalled();
      expect(onRestart).toHaveBeenCalledTimes(teardown === 'restart' ? 1 : 0);
    },
  );

  it.each(['dispose', 'restart'] as const)(
    'cancels a Drifting Cargo dawn reveal after %s without stale continuation',
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
        pendingEventId: 'drifting-supplies',
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
    ['receding', 'dispose'],
    ['receding', 'restart'],
  ] as const)(
    'cancels Drifting Cargo %s wait after %s without stale cleanup',
    async (stage, teardown) => {
      const realSession = new SurvivalSession([], {
        seed: 30,
        random: sequenceRandom([0]),
        initial: { day: 3, energy: 3 },
        initialEventId: 'drifting-supplies',
      });
      const recession = deferred();
      const clearEvent = vi.fn(() => recession.resolve());
      const setBusy = vi.fn();
      const restoreCommandFocus = vi.fn();
      const onRestart = vi.fn();
      const ui: Partial<SurvivalUI> = {
        setSleepCovered: vi.fn(() => Promise.resolve()),
        showEventReveal: vi.fn(() => Promise.resolve()),
        setEventSelection: vi.fn(),
        playEventChoiceBeat: vi.fn(() => Promise.resolve()),
        clearEventPresentation: vi.fn(),
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
          enterFocusedEventView: vi.fn(() => Promise.resolve()),
          retrieveDriftingItem: vi.fn(() => Promise.resolve()),
          recedeDriftingItem: vi.fn(() => recession.promise),
          clearEvent,
          dispose: vi.fn(() => recession.resolve()),
        },
        ui,
        onRestart,
      });

      phase.start();
      await flushPromises();
      ui.onFocusedEventSelect?.('drifting-supplies');
      await flushPromises();
      setBusy.mockClear();
      restoreCommandFocus.mockClear();
      clearEvent.mockClear();
      ui.onFocusedEventChoice?.({ id: 'sleep', instanceId: null });
      await flushPromises();
      expect(recession.isSettled()).toBe(false);

      if (teardown === 'dispose') phase.dispose();
      else phase.requestRestart();
      const clearCount = clearEvent.mock.calls.length;
      expect(clearCount).toBe(1);
      await flushPromises();

      expect(clearEvent).toHaveBeenCalledTimes(clearCount);
      expect(setBusy).not.toHaveBeenCalledWith(false);
      expect(restoreCommandFocus).not.toHaveBeenCalled();
      expect(onRestart).toHaveBeenCalledTimes(teardown === 'restart' ? 1 : 0);
    },
  );

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

  it('toggles the rear camera and resets it outside the normal day view', () => {
    let current = snapshot();
    const setRearCameraView = vi.fn();
    const setCameraTurnState = vi.fn();
    const ui: Partial<SurvivalUI> = {
      render: vi.fn(),
      setCameraTurnState,
      setJournalUnread: vi.fn(),
      dispose: vi.fn(),
    };
    const phase = SurvivalPhase.forTest({
      session: { snapshot: vi.fn(() => current) },
      world: { setRearCameraView, dispose: vi.fn() },
      ui,
    });

    phase.start();
    expect(setCameraTurnState).toHaveBeenLastCalledWith(false, false);

    current = snapshot({ chest: { state: 'closed', acquiredDay: 1 } });
    phase.update(1, 0.016);
    expect(setCameraTurnState).toHaveBeenLastCalledWith(true, false);

    ui.onCameraTurn?.();
    expect(setRearCameraView).toHaveBeenLastCalledWith(true);
    expect(setCameraTurnState).toHaveBeenLastCalledWith(true, true);

    ui.onCameraTurn?.();
    expect(setRearCameraView).toHaveBeenLastCalledWith(false);
    expect(setCameraTurnState).toHaveBeenLastCalledWith(true, false);

    ui.onCameraTurn?.();
    phase.setTimeOfDayOverride('night');
    expect(setRearCameraView).toHaveBeenLastCalledWith(false, true);
    expect(setCameraTurnState).toHaveBeenLastCalledWith(false, false);

    phase.setTimeOfDayOverride(null);
    expect(setCameraTurnState).toHaveBeenLastCalledWith(true, false);
    phase.dispose();
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
    await settleFishingEntry(rig);

    expect(rig.ui.setFishingState).toHaveBeenLastCalledWith({
      mode: 'aiming',
      message: 'CLICK THE WATER TO CAST',
      biteTarget: null,
    });
    expect(rig.ui.setFishingViewExitVisible).toHaveBeenLastCalledWith(true);
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

  it('routes rod activation after Continue and refunds a cancelled new attempt', async () => {
    const rig = createFishingRig();
    rig.phase.start();
    rig.ui.onAction?.('fish');
    await settleFishingEntry(rig);
    expect(fishingCastCallback(rig)(null)).toBe(true);
    await completeFishingCast(rig);
    rig.phase.update(3, 3);
    expect(fishingReelCallback(rig)()).toBe(true);
    rig.animations.reel[0]!.resolve();
    await flushPromises();
    rig.ui.onFishingResultContinue?.();
    rig.ui.onFishingResultContinue?.();

    rig.ui.onAction?.('fish');
    rig.ui.onAction?.('fish');

    expect(rig.session.beginFishing).toHaveBeenCalledTimes(2);
    expect(rig.realSession.snapshot()).toMatchObject({ energy: 1, food: 1 });
    expect(rig.world.exitFishingView).not.toHaveBeenCalled();
    rig.animations.enter.at(-1)!.resolve();
    await flushPromises();
    expect(rig.ui.setFishingState).toHaveBeenLastCalledWith({
      mode: 'aiming', message: 'CLICK THE WATER TO CAST', biteTarget: null,
    });

    rig.ui.onFishingViewExit?.();
    rig.ui.onFishingViewExit?.();

    expect(rig.session.cancelFishing).toHaveBeenCalledOnce();
    expect(rig.session.finishFishing).toHaveBeenCalledOnce();
    expect(rig.realSession.snapshot()).toMatchObject({ energy: 2, food: 1, actedToday: true });
    expect(rig.world.exitFishingView).toHaveBeenCalledOnce();
    rig.animations.exit[0]!.resolve();
    await flushPromises();
    expect(rig.ui.setBusy).toHaveBeenLastCalledWith(false);
    expect(rig.ui.restoreCommandFocus).toHaveBeenCalledOnce();

    rig.ui.onAction?.('fish');
    expect(rig.session.beginFishing).toHaveBeenCalledTimes(3);
    rig.animations.enter.at(-1)!.resolve();
    await flushPromises();
    expect(rig.ui.setFishingState).toHaveBeenLastCalledWith({
      mode: 'aiming', message: 'CLICK THE WATER TO CAST', biteTarget: null,
    });
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

  it('starts event loading before cover and holds black until activation', async () => {
    const loading = deferred();
    const calls: string[] = [];
    const phase = SurvivalPhase.forTest({
      session: {
        snapshot: vi.fn(() => snapshot({
          state: 'nightEvent',
          pendingEventId: 'shower-night',
        })),
      },
      eventBundles: {
        beginLoad: vi.fn(() => {
          calls.push('load');
          return loading.promise;
        }),
        activate: vi.fn(async () => {
          calls.push('activate');
          await loading.promise;
          calls.push('active');
        }),
        cancelPendingActivation: vi.fn(),
        releaseActive: vi.fn(),
        dispose: vi.fn(),
      },
      world: {
        scene: new Scene(),
        stageEvent: vi.fn(() => calls.push('stage')),
        revealEvent: vi.fn(async () => { calls.push('reveal'); }),
        dispose: vi.fn(),
      },
      ui: {
        beginEventPresentation: vi.fn(),
        setSleepCovered: vi.fn(async (covered) => {
          calls.push(covered ? 'cover' : 'uncover');
        }),
        settleCoveredScene: vi.fn(async () => { calls.push('settle'); }),
        showEventReveal: vi.fn(async () => { calls.push('caption'); }),
        setEventSelection: vi.fn(() => calls.push('selection')),
        setBusy: vi.fn(),
        render: vi.fn(),
        setJournalUnread: vi.fn(),
        dispose: vi.fn(),
      },
    });

    phase.start();
    await flushPromises();
    expect(calls).toEqual(['load', 'cover', 'activate']);

    loading.resolve();
    await flushPromises();
    expect(calls).toEqual([
      'load', 'cover', 'activate', 'active', 'stage', 'settle',
      'uncover', 'reveal', 'caption', 'selection',
    ]);
    phase.dispose();
  });

  it('keeps the cover closed and reports a fatal bundle load error', async () => {
    const failure = new Error('event model failed');
    const onFatalError = vi.fn();
    const setSleepCovered = vi.fn(async () => undefined);
    const stageEvent = vi.fn();
    const phase = SurvivalPhase.forTest({
      session: {
        snapshot: vi.fn(() => snapshot({
          state: 'nightEvent',
          pendingEventId: 'shower-night',
        })),
      },
      eventBundles: {
        beginLoad: vi.fn(() => Promise.reject(failure)),
        activate: vi.fn(() => Promise.reject(failure)),
        cancelPendingActivation: vi.fn(),
        releaseActive: vi.fn(),
        dispose: vi.fn(),
      },
      world: { stageEvent, dispose: vi.fn() },
      ui: {
        beginEventPresentation: vi.fn(),
        setSleepCovered,
        setBusy: vi.fn(),
        render: vi.fn(),
        setJournalUnread: vi.fn(),
        dispose: vi.fn(),
      },
      onFatalError,
    });

    phase.start();
    await flushPromises();

    expect(setSleepCovered).toHaveBeenCalledExactlyOnceWith(true);
    expect(onFatalError).toHaveBeenCalledExactlyOnceWith(failure);
    expect(stageEvent).not.toHaveBeenCalled();
    phase.dispose();
  });

  it('releases the active event only after the exit cover closes', async () => {
    const session = new SurvivalSession([], {
      seed: 41,
      initialEventId: 'shower-night',
    });
    const calls: string[] = [];
    const releaseActive = vi.fn(() => calls.push('release'));
    const phase = SurvivalPhase.forTest({
      session,
      eventBundles: {
        beginLoad: vi.fn(() => undefined),
        activate: vi.fn(() => undefined),
        cancelPendingActivation: vi.fn(),
        releaseActive,
        dispose: vi.fn(),
      },
      world: {
        scene: new Scene(),
        stageEvent: vi.fn(),
        revealEvent: vi.fn(() => Promise.resolve()),
        play: vi.fn(() => Promise.resolve()),
        reactToEventOutcome: vi.fn(() => Promise.resolve()),
        clearEvent: vi.fn(),
        dispose: vi.fn(),
      },
      ui: {
        beginEventPresentation: vi.fn(),
        setSleepCovered: vi.fn(async (covered) => {
          calls.push(covered ? 'cover' : 'uncover');
        }),
        settleCoveredScene: vi.fn(() => Promise.resolve()),
        showEventReveal: vi.fn(() => Promise.resolve()),
        holdEventOutcome: vi.fn(() => Promise.resolve()),
        setEventSelection: vi.fn(),
        setBusy: vi.fn(),
        render: vi.fn(),
        setJournalUnread: vi.fn(),
        dispose: vi.fn(),
      },
    });

    phase.start();
    await flushPromises();

    calls.length = 0;

    phase.handleEndure();
    await flushPromises();

    expect(calls.indexOf('cover')).toBeGreaterThanOrEqual(0);
    expect(calls.indexOf('cover')).toBeLessThan(calls.indexOf('release'));
    expect(releaseActive).toHaveBeenCalledOnce();
    phase.dispose();
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

  it('opens the internal quiet night through the real BoatWorld path', async () => {
    const propModels = createTestPropModels();
    const world = new BoatWorld(
      new PerspectiveCamera(65, 16 / 9, 0.08, 220),
      propModels,
      createTestMoonTexture(),
    );
    const setEventSelection = vi.fn();
    const phase = SurvivalPhase.forTest({
      session: {
        snapshot: vi.fn(() => snapshot({
          state: 'nightEvent',
          pendingEventId: 'night-calm-fallback',
        })),
      },
      world,
      ui: {
        showEventReveal: vi.fn(() => Promise.resolve()),
        setEventSelection,
        dispose: vi.fn(),
      },
    });

    try {
      phase.start();
      await flushPromises();

      expect(setEventSelection).toHaveBeenCalledOnce();
    } finally {
      phase.dispose();
      propModels.dispose();
    }
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
  });

  it('passes the selected Midnight Tour test result to the session', async () => {
    let current = snapshot({
      state: 'nightEvent',
      pendingEventId: 'midnight-tour',
      pressure: 1,
    });
    const reaction = deferred();
    const resolveEvent = vi.fn(() => {
      current = snapshot({
        state: 'nightEvent',
        pendingEventId: null,
        pressure: 1,
        health: 65,
      });
      return accepted({
        code: 'event-resolved',
        cue: 'none',
        deltas: { health: -35 },
        eventResult: {
          eventId: 'midnight-tour',
          choiceId: 'visit',
          resultId: 'tour-attack',
        },
      });
    });
    const ui: Partial<SurvivalUI> = {
      beginEventPresentation: vi.fn(),
      setSleepCoverProfile: vi.fn(() => Promise.resolve()),
      setSleepCovered: vi.fn(() => Promise.resolve()),
      showEventReveal: vi.fn(() => Promise.resolve()),
      setEventSelection: vi.fn(),
      playEventChoiceBeat: vi.fn(() => Promise.resolve()),
      setBusy: vi.fn(),
      render: vi.fn(),
      setJournalUnread: vi.fn(),
      clearEventPresentation: vi.fn(),
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
        playEventChoice: vi.fn(() => Promise.resolve()),
        reactToEventOutcome: vi.fn(() => reaction.promise),
        play: vi.fn(() => Promise.resolve()),
        dispose: vi.fn(),
      },
      ui,
    }, 'midnight-tour', 'tour-attack');

    phase.start();
    await flushPromises();
    ui.onEventChoice?.('visit');
    await flushPromises();

    expect(resolveEvent).toHaveBeenCalledWith({
      kind: 'choice',
      choiceId: 'visit',
      resultId: 'tour-attack',
    });
    phase.dispose();
    reaction.resolve();
  });

  it('orders the surviving midnight tour under two covers and stays busy through dawn', async () => {
    let current = snapshot({
      state: 'nightEvent',
      pendingEventId: 'midnight-tour',
      pressure: 1,
    });
    const calls: string[] = [];
    const profile = deferred();
    const firstCover = deferred();
    const choice = deferred();
    const reaction = deferred();
    const firstUncover = deferred();
    const secondCover = deferred();
    const solidProfile = deferred();
    const dawnCue = deferred();
    const finalUncover = deferred();
    let coverCalls = 0;
    let trackTour = false;
    const outcome = accepted({
      code: 'event-resolved',
      cue: 'none',
      message: 'You find a chest.',
      deltas: {},
      eventResult: {
        eventId: 'midnight-tour',
        choiceId: 'visit',
        resultId: 'tour-chest',
      },
    });
    const setBusy = vi.fn();
    const ui = {
      beginEventPresentation: vi.fn(),
      setSleepCoverProfile: vi.fn((value: string) => {
        calls.push(`profile:${value}`);
        return value === 'midnight-tour' ? profile.promise : solidProfile.promise;
      }),
      setSleepCovered: vi.fn((covered: boolean) => {
        if (!trackTour) return Promise.resolve();
        calls.push(`fade:${covered}`);
        coverCalls += 1;
        if (coverCalls === 1) return firstCover.promise;
        if (coverCalls === 2) return firstUncover.promise;
        if (coverCalls === 3) return secondCover.promise;
        return finalUncover.promise;
      }),
      settleCoveredScene: vi.fn(() => Promise.resolve()),
      showEventReveal: vi.fn(() => Promise.resolve()),
      setEventSelection: vi.fn(),
      playEventChoiceBeat: vi.fn(() => Promise.resolve()),
      setBusy,
      showFeedback: vi.fn(),
      holdEventOutcome: vi.fn(() => Promise.resolve()),
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
          calls.push('resolve:visit');
          current = snapshot({
            state: 'nightEvent',
            pendingEventId: null,
            pressure: 1,
            chest: { state: 'closed', acquiredDay: 1 },
          });
          return outcome;
        }),
        beginDawn: vi.fn(() => {
          calls.push('dawn');
          current = snapshot({
            state: 'day',
            day: 2,
            pressure: 1,
            chest: { state: 'closed', acquiredDay: 1 },
          });
          return accepted({ code: 'dawn', cue: 'dawn', deltas: {} });
        }),
      },
      world: {
        stageEvent: vi.fn(),
        revealEvent: vi.fn(() => Promise.resolve()),
        playEventChoice: vi.fn((_eventId, receivedChoice) => {
          calls.push('choice:visit');
          expect(receivedChoice).toEqual({
            choiceId: 'visit',
            instanceId: null,
            condition: null,
          });
          return choice.promise;
        }),
        reactToEventOutcome: vi.fn((_eventId, received, receivedChoice) => {
          calls.push('react:tour-chest');
          expect(received).toBe(outcome);
          expect(receivedChoice).toEqual({
            choiceId: 'visit',
            instanceId: null,
            condition: null,
          });
          return reaction.promise;
        }),
        syncInventory: vi.fn(),
        play: vi.fn((cue) => {
          if (cue === 'dawn') return dawnCue.promise;
          calls.push(`cue:${cue}`);
          return Promise.resolve();
        }),
        clearEvent: vi.fn(() => { calls.push('clear-event'); }),
        dispose: vi.fn(),
      },
      ui,
    });

    phase.start();
    await flushPromises();
    calls.length = 0;
    setBusy.mockClear();
    trackTour = true;

    (ui as Partial<SurvivalUI>).onEventChoice?.('visit');
    await flushPromises();
    expect(calls).toEqual(['profile:midnight-tour']);
    expect(setBusy).toHaveBeenLastCalledWith(true);

    profile.resolve();
    await flushPromises();
    expect(calls).toEqual(['profile:midnight-tour', 'fade:true']);

    firstCover.resolve();
    await flushPromises();
    expect(calls).toEqual(['profile:midnight-tour', 'fade:true', 'choice:visit']);

    choice.resolve();
    await flushPromises();
    expect(calls).toEqual([
      'profile:midnight-tour', 'fade:true', 'choice:visit',
      'resolve:visit', 'fade:false',
    ]);
    expect(reaction.isSettled()).toBe(false);
    expect(setBusy).not.toHaveBeenCalledWith(false);

    firstUncover.resolve();
    await flushPromises();
    expect(calls).toEqual([
      'profile:midnight-tour', 'fade:true', 'choice:visit',
      'resolve:visit', 'fade:false', 'cue:none', 'react:tour-chest',
    ]);

    reaction.resolve();
    await flushPromises();
    expect(calls.at(-1)).toBe('fade:true');

    secondCover.resolve();
    await flushPromises();
    expect(calls.slice(-2)).toEqual(['clear-event', 'profile:solid']);

    solidProfile.resolve();
    await flushPromises();
    expect(calls.at(-1)).toBe('dawn');

    dawnCue.resolve();
    await flushPromises();
    expect(calls.at(-1)).toBe('fade:false');
    expect(setBusy).not.toHaveBeenCalledWith(false);

    finalUncover.resolve();
    await flushPromises();
    expect(calls).toEqual([
      'profile:midnight-tour',
      'fade:true',
      'choice:visit',
      'resolve:visit',
      'fade:false',
      'cue:none',
      'react:tour-chest',
      'fade:true',
      'clear-event',
      'profile:solid',
      'dawn',
      'fade:false',
    ]);
    expect(setBusy).toHaveBeenLastCalledWith(false);
    phase.dispose();
  });

  it.each([
    {
      label: 'chest',
      resultId: 'tour-chest',
      deltas: {},
      resolved: { chest: { state: 'closed' as const, acquiredDay: 1 } },
    },
    {
      label: 'monster',
      resultId: 'tour-attack',
      deltas: { health: -35 },
      resolved: { health: 65 },
    },
  ])('restores the daytime boat after the midnight tour $label branch', async ({
    resultId,
    deltas,
    resolved,
  }) => {
    let current = snapshot({
      state: 'nightEvent',
      pendingEventId: 'midnight-tour',
      pressure: 1,
      health: 100,
    });
    const calls: string[] = [];
    let branchFinished = false;
    const snapshotAfterUncover: { value: SurvivalSnapshot | null } = { value: null };
    const outcome = accepted({
      code: 'event-resolved',
      cue: 'none',
      message: resultId === 'tour-chest'
        ? 'You find a chest.'
        : 'Something jumps from the palms.',
      deltas,
      eventResult: {
        eventId: 'midnight-tour',
        choiceId: 'visit',
        resultId,
      },
    });
    const ui: Partial<SurvivalUI> = {
      beginEventPresentation: vi.fn(),
      setSleepCoverProfile: vi.fn(() => Promise.resolve()),
      setSleepCovered: vi.fn(async (covered) => {
        if (!branchFinished) return;
        calls.push(`ui:cover:${covered}:start`);
        await Promise.resolve();
        calls.push(`ui:cover:${covered}:end`);
        if (!covered) snapshotAfterUncover.value = current;
      }),
      settleCoveredScene: vi.fn(async () => {
        if (branchFinished) calls.push('world:settle-covered');
      }),
      showEventReveal: vi.fn(() => Promise.resolve()),
      setEventSelection: vi.fn(),
      playEventChoiceBeat: vi.fn(() => Promise.resolve()),
      holdEventOutcome: vi.fn(() => Promise.resolve()),
      setBusy: vi.fn(),
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
          current = snapshot({
            state: 'nightEvent',
            pendingEventId: null,
            pressure: 1,
            health: 100,
            ...resolved,
          });
          return outcome;
        }),
        beginDawn: vi.fn(() => {
          calls.push('session:begin-dawn');
          current = snapshot({
            state: 'day',
            day: 2,
            pressure: 1,
            health: 100,
            ...resolved,
          });
          return accepted({ code: 'dawn', cue: 'none', deltas: {} });
        }),
      },
      world: {
        setPhase: vi.fn((phase) => { calls.push(`world:phase:${phase}`); }),
        stageEvent: vi.fn(),
        revealEvent: vi.fn(() => Promise.resolve()),
        playEventChoice: vi.fn(() => Promise.resolve()),
        reactToEventOutcome: vi.fn(async () => {
          calls.push('world:react:start');
          await Promise.resolve();
          calls.push('world:react:end');
          branchFinished = true;
        }),
        syncInventory: vi.fn((synced) => {
          if (synced.chest.state === 'closed') {
            calls.push("world:syncChest('closed')");
          }
        }),
        play: vi.fn(() => Promise.resolve()),
        clearEvent: vi.fn(() => { calls.push('world:clear-event'); }),
        dispose: vi.fn(),
      },
      ui,
    });
    const phaseAudio = (phase as unknown as { audio: SurvivalAudio }).audio;
    vi.spyOn(phaseAudio, 'finishEventReaction').mockImplementation(() => {
      calls.push('audio:finish-reaction');
    });
    vi.spyOn(phaseAudio, 'clearMidnightTour').mockImplementation(() => {
      calls.push('audio:clear-tour');
    });

    phase.start();
    await flushPromises();
    ui.onEventChoice?.('visit');
    await flushPromises();
    await flushPromises();
    await vi.waitFor(() => {
      expect(snapshotAfterUncover.value).not.toBeNull();
    });

    const orderedCalls = [
      'world:react:start',
      'world:react:end',
      'ui:cover:true:start',
      'ui:cover:true:end',
      'world:clear-event',
      'session:begin-dawn',
      'world:phase:day',
      'world:settle-covered',
      'ui:cover:false:start',
      'ui:cover:false:end',
    ];
    expect(calls).toEqual(expect.arrayContaining(orderedCalls));
    for (let index = 1; index < orderedCalls.length; index += 1) {
      expect(calls.indexOf(orderedCalls[index - 1]!))
        .toBeLessThan(calls.indexOf(orderedCalls[index]!));
    }
    expect(calls.indexOf('world:phase:night'))
      .toBeLessThan(calls.indexOf('world:react:start'));
    expect(calls.lastIndexOf('world:phase:night'))
      .toBeLessThan(calls.indexOf('ui:cover:true:end'));
    expect(snapshotAfterUncover.value?.state).toBe('day');
    expect(calls.indexOf('audio:finish-reaction'))
      .toBeLessThan(calls.indexOf('ui:cover:true:start'));
    const completionAudioClear = calls.findIndex((call, index) => (
      call === 'audio:clear-tour'
      && index > calls.indexOf('ui:cover:true:end')
    ));
    expect(completionAudioClear)
      .toBeGreaterThan(calls.indexOf('ui:cover:true:end'));
    expect(completionAudioClear)
      .toBeLessThan(calls.indexOf('world:clear-event'));
    if (resultId === 'tour-chest') {
      const chestSync = calls.indexOf("world:syncChest('closed')");
      expect(chestSync).toBeGreaterThan(calls.indexOf('session:begin-dawn'));
      expect(chestSync).toBeLessThan(calls.indexOf('ui:cover:false:start'));
    } else {
      const healthLoss = typeof deltas.health === 'number' ? -deltas.health : 0;
      expect(healthLoss).toBeGreaterThanOrEqual(25);
      expect(healthLoss).toBeLessThanOrEqual(45);
    }
    phase.dispose();
  });

  it('uses the normal ending after a fatal midnight tour attack and skips dawn', async () => {
    let current = snapshot({
      state: 'nightEvent',
      pendingEventId: 'midnight-tour',
      pressure: 1,
      health: 25,
    });
    const calls: string[] = [];
    let covered = false;
    const setBusy = vi.fn((busy: boolean) => calls.push(busy ? 'busy' : 'ready'));
    const beginDawn = vi.fn();
    const showEnding = vi.fn(() => {
      expect(setBusy).toHaveBeenLastCalledWith(true);
      calls.push('ending');
    });
    const outcome = accepted({
      code: 'event-resolved',
      cue: 'impact',
      message: 'Something jumps from the palms.',
      deltas: { health: -25 },
      eventResult: {
        eventId: 'midnight-tour',
        choiceId: 'visit',
        resultId: 'tour-attack',
      },
    });
    const ui: Partial<SurvivalUI> = {
      beginEventPresentation: vi.fn(),
      setSleepCoverProfile: vi.fn(async (profile) => { calls.push(`profile:${profile}`); }),
      setSleepCovered: vi.fn(async (value) => {
        covered = value;
        calls.push(`fade:${value}`);
      }),
      settleCoveredScene: vi.fn(() => Promise.resolve()),
      showEventReveal: vi.fn(() => Promise.resolve()),
      setEventSelection: vi.fn(),
      playEventChoiceBeat: vi.fn(() => Promise.resolve()),
      setBusy,
      showEnding,
      render: vi.fn(),
      setJournalUnread: vi.fn(),
      clearEventPresentation: vi.fn(),
      dispose: vi.fn(),
    };
    const phase = SurvivalPhase.forTest({
      session: {
        snapshot: vi.fn(() => current),
        resolveEvent: vi.fn(() => {
          calls.push('resolve:visit');
          current = snapshot({
            state: 'dead',
            ending: { id: 'death', day: 1, savedPickupCount: 0, cause: { kind: 'event', eventId: 'midnight-tour' } },
            pendingEventId: null,
            pressure: 1,
            health: 0,
          });
          return outcome;
        }),
        beginDawn,
      },
      world: {
        stageEvent: vi.fn(),
        revealEvent: vi.fn(() => Promise.resolve()),
        playEventChoice: vi.fn(async () => { calls.push('choice:visit'); }),
        reactToEventOutcome: vi.fn(async () => { calls.push('react:tour-attack'); }),
        play: vi.fn(() => Promise.resolve()),
        clearEvent: vi.fn(() => {
          expect(covered).toBe(true);
          calls.push('clear-event');
        }),
        dispose: vi.fn(),
      },
      ui,
    });

    phase.start();
    await flushPromises();
    calls.length = 0;
    setBusy.mockClear();
    ui.onEventChoice?.('visit');
    await flushPromises();
    await flushPromises();

    expect(beginDawn).not.toHaveBeenCalled();
    expect(calls).toEqual([
      'busy',
      'profile:midnight-tour',
      'fade:true',
      'choice:visit',
      'resolve:visit',
      'busy',
      'fade:false',
      'react:tour-attack',
      'profile:midnight-attack',
      'fade:true',
      'clear-event',
      'profile:solid',
      'ending',
      'ready',
    ]);
    expect(setBusy).toHaveBeenLastCalledWith(false);
    expect(showEnding).toHaveBeenCalledOnce();
    phase.dispose();
  });

  it('defers a fatal midnight tour state through reaction and final cover', async () => {
    let current = snapshot({
      state: 'nightEvent',
      pendingEventId: 'midnight-tour',
      health: 25,
    });
    const reaction = deferred();
    const finalCover = deferred();
    let holdFinalCover = false;
    const showEnding = vi.fn();
    const syncInventory = vi.fn();
    const clearEvent = vi.fn();
    const ui: Partial<SurvivalUI> = {
      beginEventPresentation: vi.fn(),
      setSleepCoverProfile: vi.fn(() => Promise.resolve()),
      setSleepCovered: vi.fn((covered) => (
        holdFinalCover && covered ? finalCover.promise : Promise.resolve()
      )),
      settleCoveredScene: vi.fn(() => Promise.resolve()),
      showEventReveal: vi.fn(() => Promise.resolve()),
      setEventSelection: vi.fn(),
      playEventChoiceBeat: vi.fn(() => Promise.resolve()),
      setBusy: vi.fn(),
      showEnding,
      render: vi.fn(),
      setJournalUnread: vi.fn(),
      clearEventPresentation: vi.fn(),
      dispose: vi.fn(),
    };
    const phase = SurvivalPhase.forTest({
      session: {
        snapshot: vi.fn(() => current),
        resolveEvent: vi.fn(() => {
          current = snapshot({
            state: 'dead',
            ending: { id: 'death', day: 1, savedPickupCount: 0, cause: { kind: 'event', eventId: 'midnight-tour' } },
            pendingEventId: null,
            health: 0,
          });
          return accepted({
            code: 'event-resolved',
            cue: 'impact',
            deltas: { health: -25 },
            eventResult: {
              eventId: 'midnight-tour',
              choiceId: 'visit',
              resultId: 'tour-attack',
            },
          });
        }),
        beginDawn: vi.fn(),
      },
      world: {
        stageEvent: vi.fn(),
        revealEvent: vi.fn(() => Promise.resolve()),
        playEventChoice: vi.fn(() => Promise.resolve()),
        reactToEventOutcome: vi.fn(() => reaction.promise),
        syncInventory,
        play: vi.fn(() => Promise.resolve()),
        clearEvent,
        dispose: vi.fn(),
      },
      ui,
    });

    phase.start();
    await flushPromises();
    await flushPromises();
    syncInventory.mockClear();
    ui.onEventChoice?.('visit');
    await flushPromises();
    await flushPromises();

    phase.update(1, 0.016);
    expect(showEnding).not.toHaveBeenCalled();
    expect(syncInventory).not.toHaveBeenCalledWith(current);
    expect(clearEvent).not.toHaveBeenCalled();

    holdFinalCover = true;
    reaction.resolve();
    await flushPromises();
    phase.update(2, 0.016);
    expect(showEnding).not.toHaveBeenCalled();
    expect(syncInventory).not.toHaveBeenCalledWith(current);
    expect(clearEvent).not.toHaveBeenCalled();

    finalCover.resolve();
    await flushPromises();
    await flushPromises();
    expect(clearEvent).toHaveBeenCalledOnce();
    expect(syncInventory).toHaveBeenCalledWith(current);
    expect(showEnding).toHaveBeenCalledOnce();
    phase.dispose();
  });

  it('keeps Midnight Tour Sail On on the normal event route', async () => {
    let current = snapshot({
      state: 'nightEvent',
      pendingEventId: 'midnight-tour',
      pressure: 1,
    });
    const calls: string[] = [];
    const setSleepCoverProfile = vi.fn();
    const ui: Partial<SurvivalUI> = {
      beginEventPresentation: vi.fn(),
      setSleepCoverProfile,
      setSleepCovered: vi.fn(async (covered) => { calls.push(`fade:${covered}`); }),
      settleCoveredScene: vi.fn(() => Promise.resolve()),
      showEventReveal: vi.fn(() => Promise.resolve()),
      setEventSelection: vi.fn(),
      playEventChoiceBeat: vi.fn(() => Promise.resolve()),
      setBusy: vi.fn(),
      render: vi.fn(),
      setJournalUnread: vi.fn(),
      clearEventPresentation: vi.fn(),
      dispose: vi.fn(),
    };
    const phase = SurvivalPhase.forTest({
      session: {
        snapshot: vi.fn(() => current),
        resolveEvent: vi.fn(() => {
          calls.push('resolve:sleep');
          current = snapshot({ state: 'nightEvent', pendingEventId: null, pressure: 1 });
          return accepted({
            code: 'event-resolved',
            cue: 'impact',
            eventResult: {
              eventId: 'midnight-tour',
              choiceId: 'sleep',
              resultId: 'tour-pass',
            },
          });
        }),
        beginDawn: vi.fn(() => {
          calls.push('dawn');
          current = snapshot({ state: 'day', day: 2, pressure: 1 });
          return accepted({ code: 'dawn', cue: 'none' });
        }),
      },
      world: {
        stageEvent: vi.fn(),
        revealEvent: vi.fn(() => Promise.resolve()),
        playEventChoice: vi.fn(async () => { calls.push('choice:sleep'); }),
        reactToEventOutcome: vi.fn(async () => { calls.push('react:tour-pass'); }),
        play: vi.fn((cue) => {
          if (cue === 'impact') calls.push('cue:impact');
          return Promise.resolve();
        }),
        clearEvent: vi.fn(() => { calls.push('clear-event'); }),
        dispose: vi.fn(),
      },
      ui,
    });

    phase.start();
    await flushPromises();
    calls.length = 0;
    ui.onEventChoice?.('sleep');
    await flushPromises();
    await flushPromises();

    expect(setSleepCoverProfile).not.toHaveBeenCalled();
    expect(calls).toEqual([
      'choice:sleep',
      'resolve:sleep',
      'cue:impact',
      'react:tour-pass',
      'fade:true',
      'clear-event',
      'dawn',
      'fade:false',
    ]);
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
    const setEventEligibleItems = vi.fn();
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
        setEventEligibleItems,
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
    expect(setEventEligibleItems).toHaveBeenLastCalledWith(new Set());
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
        resultId: 'tour-chest',
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
      if (route !== 'context') {
        expect(syncInventory).not.toHaveBeenCalledWith(resolvedSnapshot);
      }
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
    expect(calls).toEqual(route === 'context'
      ? ['clear-world', 'clear-ui', 'sync', 'error', 'focus']
      : ['clear-world', 'clear-ui', 'error', 'sync', 'focus']);
    expect(reactToEventOutcome).not.toHaveBeenCalled();
    if (route === 'context') {
      expect(play).not.toHaveBeenCalled();
    } else {
      expect(play).toHaveBeenCalledOnce();
      expect(play).toHaveBeenCalledWith('none');
    }
    if (route === 'context') {
      expect(calls.indexOf('sync')).toBeLessThan(calls.indexOf('error'));
    } else {
      expect(calls.indexOf('error')).toBeLessThan(calls.indexOf('sync'));
    }
    expect(syncInventory).toHaveBeenCalledWith(current);
    expect(ui.showFeedback).not.toHaveBeenCalled();
    expect(setBusy).toHaveBeenLastCalledWith(false);
    expect(current.state).toBe(route === 'context' ? 'nightEvent' : 'day');
    phase.dispose();
  });

  it('recovers a rejected midnight tour visit under cover before unlocking', async () => {
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
    const calls: string[] = [];
    let trackTour = false;
    const showFeedback = vi.fn(() => { calls.push('feedback'); });
    const reactToEventOutcome = vi.fn();
    const setBusy = vi.fn((busy: boolean) => {
      if (trackTour) calls.push(busy ? 'busy' : 'ready');
    });
    const beginDawn = vi.fn();
    const ui = {
      beginEventPresentation: vi.fn(),
      setSleepCoverProfile: vi.fn(async (profile: string) => {
        calls.push(`profile:${profile}`);
      }),
      setSleepCovered: vi.fn(async (covered: boolean) => {
        if (trackTour) calls.push(`fade:${covered}`);
      }),
      settleCoveredScene: vi.fn(async () => { calls.push('settle'); }),
      showEventReveal: vi.fn(() => Promise.resolve()),
      setEventSelection: vi.fn(),
      playEventChoiceBeat: vi.fn(() => Promise.resolve()),
      setBusy,
      showFeedback,
      render: vi.fn(),
      setJournalUnread: vi.fn(),
      clearEventPresentation: vi.fn(),
      restoreCommandFocus: vi.fn(() => { calls.push('focus'); }),
      dispose: vi.fn(),
    };
    const phase = SurvivalPhase.forTest({
      session: {
        snapshot: vi.fn(() => current),
        resolveEvent: vi.fn(() => {
          calls.push('resolve:visit');
          return rejected;
        }),
        beginDawn,
      },
      world: {
        stageEvent: vi.fn(),
        revealEvent: vi.fn(() => Promise.resolve()),
        playEventChoice: vi.fn(async () => { calls.push('choice:visit'); }),
        reactToEventOutcome,
        clearEvent: vi.fn(() => { calls.push('clear-event'); }),
        dispose: vi.fn(),
      },
      ui,
    });

    phase.start();
    await flushPromises();
    calls.length = 0;
    trackTour = true;
    (ui as Partial<SurvivalUI>).onEventChoice?.('visit');
    await flushPromises();
    await flushPromises();

    expect(calls).toEqual([
      'busy',
      'profile:midnight-tour',
      'fade:true',
      'choice:visit',
      'resolve:visit',
      'fade:true',
      'clear-event',
      'profile:solid',
      'settle',
      'fade:false',
      'feedback',
      'ready',
      'focus',
    ]);
    expect(showFeedback).toHaveBeenCalledWith(rejected);
    expect(reactToEventOutcome).not.toHaveBeenCalled();
    expect(beginDawn).not.toHaveBeenCalled();
    expect(setBusy).toHaveBeenLastCalledWith(false);
    phase.dispose();
  });

  it.each(['reaction', 'cover'] as const)(
    'recovers a rejected midnight tour %s promise before reporting the failure',
    async (failedStep) => {
      let current = snapshot({
        state: 'nightEvent',
        pendingEventId: 'midnight-tour',
        pressure: 1,
      });
      const failure = new Error(`${failedStep} failed`);
      const calls: string[] = [];
      let trackTour = false;
      let coverCalls = 0;
      const setBusy = vi.fn((busy: boolean) => {
        if (trackTour) calls.push(busy ? 'busy' : 'ready');
      });
      const beginDawn = vi.fn();
      const onFatalError = vi.fn((error: unknown) => {
        expect(error).toBe(failure);
        expect(setBusy).toHaveBeenLastCalledWith(true);
        calls.push('fatal');
      });
      const outcome = accepted({
        code: 'event-resolved',
        cue: 'none',
        eventResult: {
          eventId: 'midnight-tour',
          choiceId: 'visit',
          resultId: 'tour-chest',
        },
      });
      const ui: Partial<SurvivalUI> = {
        beginEventPresentation: vi.fn(),
        setSleepCoverProfile: vi.fn(async (profile) => {
          calls.push(`profile:${profile}`);
        }),
        setSleepCovered: vi.fn((covered) => {
          if (!trackTour) return Promise.resolve();
          calls.push(`fade:${covered}`);
          coverCalls += 1;
          if (failedStep === 'cover' && coverCalls === 3) {
            return Promise.reject(failure);
          }
          return Promise.resolve();
        }),
        settleCoveredScene: vi.fn(async () => { calls.push('settle'); }),
        showEventReveal: vi.fn(() => Promise.resolve()),
        setEventSelection: vi.fn(),
        playEventChoiceBeat: vi.fn(() => Promise.resolve()),
        holdEventOutcome: vi.fn(() => Promise.resolve()),
        setBusy,
        render: vi.fn(),
        setJournalUnread: vi.fn(),
        clearEventPresentation: vi.fn(),
        restoreCommandFocus: vi.fn(() => { calls.push('focus'); }),
        dispose: vi.fn(),
      };
      const phase = SurvivalPhase.forTest({
        session: {
          snapshot: vi.fn(() => current),
          resolveEvent: vi.fn(() => {
            calls.push('resolve:visit');
            current = snapshot({ state: 'nightEvent', pendingEventId: null, pressure: 1 });
            return outcome;
          }),
          beginDawn,
        },
        world: {
          stageEvent: vi.fn(),
          revealEvent: vi.fn(() => Promise.resolve()),
          playEventChoice: vi.fn(async () => { calls.push('choice:visit'); }),
          reactToEventOutcome: vi.fn(() => {
            calls.push('react:tour-chest');
            return failedStep === 'reaction'
              ? Promise.reject(failure)
              : Promise.resolve();
          }),
          play: vi.fn(() => Promise.resolve()),
          clearEvent: vi.fn(() => { calls.push('clear-event'); }),
          dispose: vi.fn(),
        },
        ui,
        onFatalError,
      });

      phase.start();
      await flushPromises();
      calls.length = 0;
      trackTour = true;
      ui.onEventChoice?.('visit');
      await flushPromises();
      await flushPromises();

      expect(beginDawn).not.toHaveBeenCalled();
      expect(calls).toContain('fade:false');
      expect(calls.lastIndexOf('fade:true')).toBeLessThan(calls.indexOf('clear-event'));
      expect(calls.indexOf('clear-event')).toBeLessThan(calls.indexOf('profile:solid'));
      expect(calls.indexOf('profile:solid')).toBeLessThan(calls.indexOf('settle'));
      expect(calls.indexOf('settle')).toBeLessThan(calls.lastIndexOf('fade:false'));
      expect(calls.lastIndexOf('fade:false')).toBeLessThan(calls.indexOf('fatal'));
      expect(calls.indexOf('fatal')).toBeLessThan(calls.indexOf('ready'));
      expect(onFatalError).toHaveBeenCalledExactlyOnceWith(failure);
      expect(setBusy).toHaveBeenLastCalledWith(false);
      phase.dispose();
    },
  );

  it.each(['settle', 'uncover'] as const)(
    'keeps recovering after the midnight tour recovery %s promise rejects',
    async (failedStep) => {
      let current = snapshot({
        state: 'nightEvent',
        pendingEventId: 'midnight-tour',
        pressure: 1,
      });
      const originalFailure = new Error('reaction failed');
      const cleanupFailure = new Error(`${failedStep} failed`);
      const calls: string[] = [];
      let trackTour = false;
      let uncoverCalls = 0;
      const setBusy = vi.fn((busy: boolean) => {
        if (trackTour) calls.push(busy ? 'busy' : 'ready');
      });
      const onFatalError = vi.fn((error: unknown) => {
        expect(error).toBe(originalFailure);
        expect(setBusy).toHaveBeenLastCalledWith(true);
        calls.push('fatal:original');
      });
      const beginDawn = vi.fn();
      const ui: Partial<SurvivalUI> = {
        beginEventPresentation: vi.fn(),
        setSleepCoverProfile: vi.fn(async (profile) => {
          calls.push(`profile:${profile}`);
        }),
        setSleepCovered: vi.fn((covered) => {
          if (!trackTour) return Promise.resolve();
          calls.push(`fade:${covered}`);
          if (!covered) {
            uncoverCalls += 1;
            if (failedStep === 'uncover' && uncoverCalls === 2) {
              return Promise.reject(cleanupFailure);
            }
          }
          return Promise.resolve();
        }),
        settleCoveredScene: vi.fn(() => {
          calls.push('settle');
          return trackTour && failedStep === 'settle'
            ? Promise.reject(cleanupFailure)
            : Promise.resolve();
        }),
        showEventReveal: vi.fn(() => Promise.resolve()),
        setEventSelection: vi.fn(),
        playEventChoiceBeat: vi.fn(() => Promise.resolve()),
        setBusy,
        render: vi.fn(),
        setJournalUnread: vi.fn(),
        clearEventPresentation: vi.fn(),
        restoreCommandFocus: vi.fn(() => { calls.push('focus'); }),
        dispose: vi.fn(),
      };
      const phase = SurvivalPhase.forTest({
        session: {
          snapshot: vi.fn(() => current),
          resolveEvent: vi.fn(() => {
            current = snapshot({ state: 'nightEvent', pendingEventId: null, pressure: 1 });
            return accepted({
              code: 'event-resolved',
              cue: 'none',
              eventResult: {
                eventId: 'midnight-tour',
                choiceId: 'visit',
                resultId: 'tour-chest',
              },
            });
          }),
          beginDawn,
        },
        world: {
          stageEvent: vi.fn(),
          revealEvent: vi.fn(() => Promise.resolve()),
          playEventChoice: vi.fn(() => Promise.resolve()),
          reactToEventOutcome: vi.fn(() => Promise.reject(originalFailure)),
          play: vi.fn(() => Promise.resolve()),
          clearEvent: vi.fn(() => { calls.push('clear-event'); }),
          dispose: vi.fn(),
        },
        ui,
        onFatalError,
      });

      phase.start();
      await flushPromises();
      trackTour = true;
      ui.onEventChoice?.('visit');
      await flushPromises();
      await flushPromises();

      expect(beginDawn).not.toHaveBeenCalled();
      expect(calls).toContain('settle');
      expect(uncoverCalls).toBe(2);
      expect(calls.lastIndexOf('fade:false')).toBeLessThan(calls.indexOf('fatal:original'));
      expect(calls.indexOf('fatal:original')).toBeLessThan(calls.indexOf('ready'));
      expect(onFatalError).toHaveBeenCalledExactlyOnceWith(originalFailure);
      expect(setBusy).toHaveBeenLastCalledWith(false);
      phase.dispose();
    },
  );

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
      const setBusy = vi.fn();
      const syncInventory = vi.fn();
      const onRestart = vi.fn();
      const outcome = accepted({
        code: 'event-resolved',
        cue: 'none',
        eventResult: {
          eventId: 'midnight-tour',
          choiceId: 'visit',
          resultId: 'tour-chest',
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
      expect(setBusy).not.toHaveBeenCalledWith(false);
      expect(onRestart).toHaveBeenCalledTimes(teardown === 'restart' ? 1 : 0);
    },
  );

  it('does not resolve after disposal cancels a pending contextual press beat', async () => {
    const event = SURVIVAL_EVENTS.find(({ id }) => id === 'drifting-supplies')!;
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
      world: {
        revealEvent: vi.fn(() => Promise.resolve()),
        enterFocusedEventView: vi.fn(() => Promise.resolve()),
        dispose: vi.fn(),
      },
      ui,
    });
    phase.start();
    await flushPromises();
    ui.onFocusedEventSelect?.('drifting-supplies');
    await flushPromises();
    ui.onFocusedEventChoice?.({ id: 'retrieve', instanceId: null });
    await flushPromises();

    phase.dispose();
    beat.resolve();
    await flushPromises();

    expect(resolveEvent).not.toHaveBeenCalled();
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
      const event = SURVIVAL_EVENTS.find(({ id }) => id === 'drifting-supplies')!;
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
    const event = SURVIVAL_EVENTS.find(({ id }) => id === 'drifting-supplies')!;
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

  it('resolves Flowers after its collection animation', async () => {
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
    phase.dispose();
  });

  it('continues after an Other People flare without showing rescue', async () => {
    const session = new SurvivalSession(
      [{ instanceId: 'flareGun-1', type: 'flareGun' }],
      {
        seed: 202,
        random: sequenceRandom([0, 0.99, 0.99]),
        initial: { day: 15, rescueLead: 2 },
        initialEventId: 'other-people',
      },
    );
    let rescueTableauVisible = false;
    const clearEvent = vi.fn(() => {
      rescueTableauVisible = false;
    });
    const showEnding = vi.fn();
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
        expect(syncInventory).not.toHaveBeenLastCalledWith(session.snapshot());
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
    await flushPromises();

    expect(session.snapshot()).toMatchObject({
      rescueLead: 8,
      inventory: { 'flareGun-1': { condition: 'consumed' } },
    });
    expect(session.snapshot().state).not.toBe('rescued');
    expect(showEnding).not.toHaveBeenCalled();
    expect(showFeedback).not.toHaveBeenCalled();
    expect(rescueTableauVisible).toBe(false);
    expect(clearEvent).toHaveBeenCalledOnce();
    expect(holdEventOutcome).toHaveBeenCalledOnce();
    expect(setSleepCovered).toHaveBeenCalledWith(true);

    phase.dispose();

    expect(clearEvent).toHaveBeenCalledTimes(2);
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
      expect.any(Function),
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
      gainedInstanceIds: [],
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
      eventId: 'tornado',
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
      const resolveEvent = vi.fn(() => {
        current = snapshot({
          state: terminalState,
          ending: terminalState === 'dead'
            ? { id: 'death', day: 6, savedPickupCount: 0, cause: { kind: 'event', eventId } }
            : { id: 'sinking', day: 6, savedPickupCount: 0, cause: { eventId } },
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
      });
      const showEnding = vi.fn(() => {
        calls.push('ending');
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
      expect(showEnding).toHaveBeenCalledOnce();
      expect(setBusy).toHaveBeenLastCalledWith(false);
    },
  );

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
      session: { snapshot: vi.fn(() => snapshot({
        state: 'sunk', day: 6, seed: 8,
        ending: { id: 'sinking', day: 6, savedPickupCount: 0, cause: { eventId: null } },
      })) },
      world: { update: vi.fn(), dispose: vi.fn() },
      ui: { render: vi.fn(), showEnding, dispose: vi.fn() },
      onRestart: restart,
    });

    phase.update(1, 0.016);
    phase.update(2, 0.016);

    expect(showEnding).toHaveBeenCalledOnce();
    expect(showEnding).toHaveBeenCalledWith({
      id: 'sinking', day: 6, savedPickupCount: 0, cause: { eventId: null },
    });
    phase.requestRestart();
    phase.requestRestart();
    expect(restart).toHaveBeenCalledOnce();
  });

  it('delegates Drifting Cargo through Carlitos and returns automatically', async () => {
    let current = snapshot({
      state: 'dayEvent',
      day: 3,
      pendingEventId: 'drifting-supplies',
      carlitos: {
        alive: true, energy: 3, hunger: 5, sickness: 0, unhappiness: 0,
        pettedToday: false, deathCause: null,
      },
    });
    const delegateDriftingItem = vi.fn(() => Promise.resolve());
    const retrieveDriftingItem = vi.fn(() => Promise.resolve());
    const ui: Partial<SurvivalUI> = {
      setSleepCovered: vi.fn(() => Promise.resolve()),
      showEventReveal: vi.fn(() => Promise.resolve()),
      setEventSelection: vi.fn(),
      playEventChoiceBeat: vi.fn(() => Promise.resolve()),
      clearEventPresentation: vi.fn(),
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
        enterFocusedEventView: vi.fn(() => Promise.resolve()),
        delegateDriftingItem,
        retrieveDriftingItem,
        exitFocusedEventView: vi.fn(() => Promise.resolve()),
        dispose: vi.fn(),
      },
      ui,
    });

    phase.start();
    await flushPromises();
    ui.onFocusedEventSelect?.('drifting-supplies');
    await flushPromises();
    ui.onFocusedEventChoice?.({ id: 'delegate-carlitos', instanceId: null });
    await flushPromises();

    expect(delegateDriftingItem).toHaveBeenCalledOnce();
    expect(retrieveDriftingItem).not.toHaveBeenCalled();
    phase.dispose();
  });

  it('does not animate Carlitos when Drifting Cargo delegation is rejected', async () => {
    const current = snapshot({
      state: 'dayEvent',
      pendingEventId: 'drifting-supplies',
      carlitos: {
        alive: true,
        energy: 3,
        hunger: 3,
        sickness: 0,
        unhappiness: 0,
        pettedToday: false,
        deathCause: null,
      },
    });
    const rejected = accepted({
      accepted: false,
      code: 'carlitos-unavailable',
      message: 'Carlitos is too hungry to help.',
    });
    const delegateDriftingItem = vi.fn(() => Promise.resolve());
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
        enterFocusedEventView: vi.fn(() => Promise.resolve()),
        delegateDriftingItem,
        dispose: vi.fn(),
      },
      ui,
    });

    phase.start();
    await flushPromises();
    ui.onFocusedEventSelect?.('drifting-supplies');
    await flushPromises();
    ui.onFocusedEventChoice?.({ id: 'delegate-carlitos', instanceId: null });
    await flushPromises();

    expect(showFeedback).toHaveBeenCalledWith(rejected);
    expect(delegateDriftingItem).not.toHaveBeenCalled();
    phase.dispose();
  });

  it.each([
    ['Sleep Normally', 'sleep', [0, 0, 0.99, 0.99, 0.99]],
    ['Watch at the exact 0.85 boundary', 'watch', [0.85, 0, 0.99, 0.99, 0.99]],
  ] as const)(
    'reveals and resolves the Guarded Sleep follow-up before day two for %s',
    async (_label, choiceId, rolls) => {
      const session = new SurvivalSession([{
        instanceId: 'carlitos-1',
        type: 'carlitos',
      }], {
        seed: 91,
        random: sequenceRandom(rolls),
        initial: { day: 1 },
        initialEventId: 'guarded-sleep',
      });
      const beginDawn = vi.spyOn(session, 'beginDawn');
      const calls: string[] = [];
      const setEventSelection = vi.fn((
        _eligible: ReadonlyMap<ItemInstanceId, string>,
        _choices: readonly EventContextChoice[],
      ) => {
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
      const guardedChoices = setEventSelection.mock.calls.at(-1)?.[1] ?? [];
      expect(guardedChoices).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'watch' }),
      ]));
      expect(guardedChoices.find(({ id }) => id === 'watch'))
        .not.toHaveProperty('anchorId');
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

  it('shows a terminal daytime ending only after its cue completes', async () => {
    let current = snapshot();
    const cue = deferred();
    const showEnding = vi.fn();
    const phase = SurvivalPhase.forTest({
      session: {
        snapshot: vi.fn(() => current),
        perform: vi.fn(() => {
          current = snapshot({
            state: 'sunk', day: 4,
            ending: { id: 'sinking', day: 4, savedPickupCount: 0, cause: { eventId: null } },
          });
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
          current = snapshot({
            state: 'sunk', day: 5, journalEntries: [completedEntry(5)],
            ending: { id: 'sinking', day: 5, savedPickupCount: 0, cause: { eventId: event.id } },
          });
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

  it.each([
    ['other-people', 'people-pass'],
    ['plane', 'plane-pass'],
  ] as const)('routes %s Let It Pass with a usable signal item', async (
    eventId,
    resultId,
  ) => {
    const session = new SurvivalSession(
      [{ instanceId: 'flashlight-1', type: 'flashlight' }],
      {
        seed: 204,
        random: sequenceRandom([0, 0.99, 0.99]),
        initial: { day: 15, rescueLead: 2 },
        initialEventId: eventId,
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

    expect(playEventChoice).toHaveBeenCalledWith(eventId, {
      choiceId: 'sleep',
      instanceId: null,
      condition: null,
    });
    expect(reactToEventOutcome).toHaveBeenCalledWith(
      eventId,
      expect.objectContaining({
        eventResult: {
          eventId,
          choiceId: 'sleep',
          resultId,
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

  it('lets the Plane pass when its item window expires', async () => {
    const session = new SurvivalSession([
      { instanceId: 'flareGun-1', type: 'flareGun' },
      { instanceId: 'flashlight-1', type: 'flashlight' },
    ], {
      seed: 206,
      random: sequenceRandom([0.99]),
      initial: { day: 15, rescueLead: 2 },
      initialEventId: 'plane',
    });
    const resolveEvent = vi.spyOn(session, 'resolveEvent');
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
        setSleepCovered: vi.fn(() => Promise.resolve()),
        settleCoveredScene: vi.fn(() => Promise.resolve()),
        showEventReveal: vi.fn(() => Promise.resolve()),
        setEventSelection: vi.fn(),
        setBusy: vi.fn(),
        holdEventOutcome: vi.fn(() => Promise.resolve()),
        clearEventPresentation: vi.fn(),
        render: vi.fn(),
        setJournalUnread: vi.fn(),
        dispose: vi.fn(),
      },
    });
    phase.start();
    await flushPromises();

    expect(session.snapshot().inventory).toMatchObject({
      'flareGun-1': { condition: 'usable' },
      'flashlight-1': { condition: 'usable' },
    });

    phase.update(0, 0);
    phase.update(PLANE_CHOICE_WINDOW_SECONDS - 0.1, PLANE_CHOICE_WINDOW_SECONDS - 0.1);
    await flushPromises();
    expect(resolveEvent).not.toHaveBeenCalled();

    phase.update(PLANE_CHOICE_WINDOW_SECONDS, 0.1);
    await flushPromises();
    await flushPromises();
    expect(resolveEvent).toHaveBeenCalledOnce();
    expect(resolveEvent).toHaveBeenCalledWith({ kind: 'endure' });
    expect(playEventChoice).toHaveBeenCalledWith('plane', {
      choiceId: 'sleep',
      instanceId: null,
      condition: null,
    });
    expect(reactToEventOutcome).toHaveBeenCalledWith(
      'plane',
      expect.objectContaining({
        eventResult: {
          eventId: 'plane',
          choiceId: 'sleep',
          resultId: 'plane-pass',
        },
      }),
      expect.anything(),
      expect.anything(),
    );
    phase.dispose();
  });

  it('keeps the Other People Flashlight signal choice usable', async () => {
    const session = new SurvivalSession(
      [{ instanceId: 'flashlight-1', type: 'flashlight' }],
      {
        seed: 205,
        random: sequenceRandom([0]),
        initial: { day: 15, rescueLead: 2 },
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
          resultId: 'people-signaled',
        },
      }),
      expect.anything(),
      expect.anything(),
    );
    expect(session.snapshot()).toMatchObject({
      state: 'dayEvent',
      rescueLead: 6,
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
        resultId: 'tour-chest',
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

    fakeDocument.hidden = true;
    listeners.get('visibilitychange')!(new Event('visibilitychange'));
    await flushPromises();
    expect(setDocumentHidden).toHaveBeenCalledWith(true);
    expect(syncInventory).not.toHaveBeenCalledWith(resolvedSnapshot);

    fakeDocument.hidden = false;
    phase.setPaused(false);
    await flushPromises();
    expect(syncInventory).toHaveBeenCalledWith(resolvedSnapshot);

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

    fakeDocument.hidden = true;
    listeners.get('visibilitychange')!(new Event('visibilitychange'));
    await flushPromises();

    fakeDocument.hidden = false;
    listeners.get('visibilitychange')!(new Event('visibilitychange'));
    await flushPromises();
    hold.resolve();
    phase.dispose();
  });

  it.each([
    ['death-stare', 'flashlight', 'flashlight-1', 'flashlight'],
    ['swarm-of-sharks', 'flashlight', 'flashlight-1', 'flashlight'],
    ['swarm-of-sharks', 'baitTin', 'baitTin-1', 'baitTin'],
    ['tornado', 'swimRing', 'swimRing-1', 'swimRing'],
  ] as const)(
    'resolves %s %s only after hide and restore',
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
          holdEventOutcome: vi.fn(() => new Promise<void>(() => undefined)),
          dispose: vi.fn(),
        },
      });
      phase.start();
      await flushPromises();
      phase.handleEventItem(choiceId, instanceId);
      phase.update(0.2, 0.2);

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
      phase.dispose();
    },
  );

  it('shows Attack and waits for explicit selection', async () => {
    const calls: string[] = [];
    let current = snapshot({
      state: 'nightEvent',
      pendingEventId: 'chest-attack',
      chest: { state: 'mimic', acquiredDay: 1 },
    });
    const resolveEvent = vi.fn(() => {
      current = snapshot({
        state: 'nightEvent',
        pendingEventId: null,
        health: 60,
        chest: { state: 'none', acquiredDay: null },
      });
      return accepted({
        code: 'event-resolved',
        cue: 'impact',
        deltas: { health: -40 },
        eventResult: {
          eventId: 'chest-attack',
          choiceId: 'attack',
          resultId: 'chest-attack',
        },
      });
    });
    const beginDawn = vi.fn(() => {
      current = snapshot({
        state: 'day',
        day: 2,
        health: 60,
        chest: { state: 'none', acquiredDay: null },
      });
      return accepted({ code: 'dawn', cue: 'dawn', deltas: {} });
    });
    const playEventChoice = vi.fn(async (
      _eventId: string,
      choice: string | EventChoicePresentation,
    ) => {
      calls.push(`choice:${typeof choice === 'string' ? choice : choice.choiceId}`);
    });
    const setSleepCoverProfile = vi.fn(async (profile: string) => {
      calls.push(`profile:${profile}`);
    });
    const setSleepCovered = vi.fn(async (covered: boolean) => {
      calls.push(`cover:${covered}`);
    });
    const setEventSelection = vi.fn();
    const ui: Partial<SurvivalUI> = {
      beginEventPresentation: vi.fn(),
      showEventReveal: vi.fn(() => Promise.resolve()),
      setEventSelection,
      setSleepCoverProfile,
      setSleepCovered,
      settleCoveredScene: vi.fn(() => Promise.resolve()),
      setBusy: vi.fn(),
      render: vi.fn(),
      setJournalUnread: vi.fn(),
      clearEventPresentation: vi.fn(),
      restoreCommandFocus: vi.fn(),
      dispose: vi.fn(),
    };
    const phase = SurvivalPhase.forTest({
      session: {
        snapshot: vi.fn(() => current),
        resolveEvent,
        beginDawn,
      },
      world: {
        stageEvent: vi.fn(),
        revealEvent: vi.fn(async () => { calls.push('reveal'); }),
        playEventChoice,
        play: vi.fn(() => Promise.resolve()),
        clearEvent: vi.fn(() => { calls.push('clear-event'); }),
        dispose: vi.fn(),
      },
      ui,
    });

    phase.start();
    for (let index = 0; index < 8; index += 1) await flushPromises();

    expect(setEventSelection).toHaveBeenLastCalledWith(
      new Map(),
      [expect.objectContaining({ id: 'attack', label: 'Attack' })],
    );
    expect(resolveEvent).not.toHaveBeenCalled();

    ui.onEventChoice?.('attack');
    for (let index = 0; index < 8; index += 1) await flushPromises();

    expect(resolveEvent).toHaveBeenCalledExactlyOnceWith({
      kind: 'choice',
      choiceId: 'attack',
    });
    expect(playEventChoice).toHaveBeenCalledWith('chest-attack', {
      choiceId: 'attack',
      instanceId: null,
      condition: null,
    });
    expect(calls.indexOf('reveal')).toBeLessThan(calls.indexOf('choice:attack'));
    expect(calls.indexOf('choice:attack')).toBeLessThan(calls.indexOf('profile:midnight-attack'));
    expect(calls.indexOf('profile:midnight-attack')).toBeLessThan(
      calls.lastIndexOf('cover:true'),
    );
    expect(beginDawn).toHaveBeenCalledOnce();
    expect(current).toMatchObject({ state: 'day', day: 2, health: 60 });
    phase.dispose();
  });

  it('accepts Fishing Net during the warning and prevents the automatic bite', async () => {
    const reveal = deferred();
    const inventoryState = inventory({
      'fishingNet-1': {
        instanceId: 'fishingNet-1',
        type: 'fishingNet',
        condition: 'usable',
      },
    });
    let current = snapshot({
      state: 'nightEvent',
      pendingEventId: 'chest-attack',
      chest: { state: 'mimic', acquiredDay: 1 },
      inventory: inventoryState,
    });
    const resolveEvent = vi.fn(() => {
      current = snapshot({
        state: 'nightEvent',
        pendingEventId: null,
        chest: { state: 'closed', acquiredDay: 1 },
        inventory: inventoryState,
      });
      return accepted({
        code: 'event-resolved',
        cue: 'impact',
        deltas: {},
        eventResult: {
          eventId: 'chest-attack',
          choiceId: 'fishingNet',
          resultId: 'chest-bound',
        },
      });
    });
    const beginDawn = vi.fn(() => {
      current = snapshot({
        state: 'day',
        day: 2,
        chest: { state: 'closed', acquiredDay: 1 },
        inventory: inventoryState,
      });
      return accepted({ code: 'dawn', cue: 'dawn', deltas: {} });
    });
    const playEventItemUse = vi.fn(() => Promise.resolve());
    const playEventChoice = vi.fn(async (
      _eventId: string,
      choice: string | EventChoicePresentation,
    ) => {
      if (typeof choice !== 'string' && choice.choiceId === 'fishingNet') reveal.resolve();
    });
    const setEventSelection = vi.fn();
    const reactToEventOutcome = vi.fn(() => Promise.resolve());
    const phase = SurvivalPhase.forTest({
      session: {
        snapshot: vi.fn(() => current),
        resolveEvent,
        beginDawn,
      },
      world: {
        stageEvent: vi.fn(),
        revealEvent: vi.fn(() => reveal.promise),
        playEventItemUse,
        playEventChoice,
        reactToEventOutcome,
        play: vi.fn(() => Promise.resolve()),
        clearEvent: vi.fn(),
        dispose: vi.fn(),
      },
      ui: {
        beginEventPresentation: vi.fn(),
        showEventReveal: vi.fn(() => Promise.resolve()),
        setEventSelection,
        setEventUsing: vi.fn(),
        setSleepCovered: vi.fn(() => Promise.resolve()),
        settleCoveredScene: vi.fn(() => Promise.resolve()),
        holdEventOutcome: vi.fn(() => Promise.resolve()),
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
    await flushPromises();
    expect(setEventSelection).toHaveBeenCalledWith(
      new Map([['fishingNet-1', 'fishingNet']]),
      [{ id: 'attack', label: 'Attack', unavailableReason: null }],
    );

    phase.handleEventItem('fishingNet', 'fishingNet-1');
    for (let index = 0; index < 8; index += 1) await flushPromises();

    expect(playEventItemUse).not.toHaveBeenCalled();
    expect(playEventChoice).toHaveBeenCalledExactlyOnceWith('chest-attack', {
      choiceId: 'fishingNet',
      instanceId: 'fishingNet-1',
      condition: 'usable',
    });
    expect(resolveEvent).toHaveBeenCalledExactlyOnceWith({
      kind: 'item',
      choiceId: 'fishingNet',
      instanceId: 'fishingNet-1',
    });
    expect(reactToEventOutcome).toHaveBeenCalledOnce();
    expect(beginDawn).toHaveBeenCalledOnce();
    expect(current).toMatchObject({
      state: 'day',
      day: 2,
      health: 100,
      chest: { state: 'closed' },
    });
    phase.dispose();
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
