import { PerspectiveCamera } from 'three';
import type { PhaseContext, GamePhase } from '../app/GamePhase';
import { AudioSystem } from '../audio/AudioSystem';
import { SurvivalAudio } from '../audio/SurvivalAudio';
import {
  ITEM_DEFINITIONS,
  type ItemId,
  type ItemInstance,
  type ItemInstanceId,
} from '../game/ItemState';
import type { SceneRenderer, SurvivalVisualState } from '../rendering/SceneRenderer';
import { createVisualQualityPreference } from '../rendering/visualQuality';
import {
  createWaterQualityPreference,
  type WaterQuality,
} from '../rendering/waterQuality';
import type { PhysicsRuntime } from '../physics/PhysicsRuntime';
import {
  SurvivalUI,
  type RewardResultView,
  type EventContextChoice,
} from '../ui/SurvivalUI';
import type { PropModelLibrary } from '../world/PropModelLibrary';
import type { ShipFurnitureLibrary } from '../world/ShipFurnitureLibrary';
import type { SkyAssets } from '../world/SkyAssets';
import type { LifeboatAssets } from '../world/LifeboatAssets';
import type { ShipAssets } from '../world/ShipAssets';
import type { SkyPhase } from '../world/skyPalette';
import {
  presentationWeatherForEvent,
  resolvePresentationWeather,
  type PresentationWeatherId,
} from '../weather/presentationWeather';
import { BoatWorld } from './BoatWorld';
import {
  type EventChoicePresentation,
} from './FocusedEventPresentation';
import {
  isDriftingItemEventId,
  survivalEventById,
} from './eventCatalog';
import {
  deriveEventOutcomePresentation,
  deriveEventVariantSeed,
} from './eventPresentationOutcome';
import { isEventPresentationRoute } from './eventPresentationRoutes';
import type { EventOutcomePresentation } from './eventPresentationTypes';
import {
  CARLITOS_LAB_CHOICE_ID,
  CARLITOS_LAB_INSTANCE_ID,
  ITEM_ANIMATION_LAB_INITIAL_CHEST,
  ITEM_ANIMATION_LAB_INITIAL_RESOURCES,
  ITEM_ANIMATION_LAB_USES,
  REPAIR_TOOLBOX_LAB_CHOICE_ID,
  REPAIR_TOOLBOX_LAB_INSTANCE_ID,
  isItemAnimationLabId,
} from './ItemAnimationLab';
import {
  deriveEventPhysicalResponse,
  type EventPhysicalResponsePresentation,
} from './EventPhysicalResponse';
import {
  DriftingItemFlow,
  type DriftingItemChoiceResolution,
  type DriftingItemUiPort,
  type DriftingItemWorldPort,
} from './DriftingItemFlow';
import {
  SurvivalFishingFlow,
  type FishingSessionPort,
  type FishingUiPort,
  type FishingWorldPort,
} from './SurvivalFishingFlow';
import { SurvivalSession } from './SurvivalSession';
import { EventBundleLoader } from './EventBundle';
import { EventBundleManager } from './EventBundleManager';
import type { SurvivalEventId } from './eventCatalog';
import type {
  ActionOutcome,
  DayActionId,
  DayActionOption,
  EventResponse,
  EventResponseId,
  SurvivalSnapshot,
  SurvivalState,
} from './survivalTypes';

export interface SurvivalPhaseTestDependencies {
  session: Partial<SurvivalSession> & Pick<SurvivalSession, 'snapshot'>;
  world: Partial<Omit<BoatWorld, 'stageEvent'>> & {
    stageEvent?: (...args: any[]) => void;
  };
  ui: Partial<SurvivalUI>;
  audio?: AudioSystem;
  onRestart?: () => void;
  onInvariantError?: (error: Error) => void;
  onFatalError?: (error: unknown) => void;
  eventBundles?: EventBundleManagerLike;
  sceneRenderer?: SceneRenderer;
}

export interface EventBundleManagerLike {
  beginLoad(eventId: SurvivalEventId): Promise<unknown> | undefined;
  activate(eventId: SurvivalEventId): Promise<unknown> | undefined;
  releaseActive(): void;
  dispose(): void;
}

function createTestEventBundleManager(): EventBundleManagerLike {
  return {
    beginLoad: () => undefined,
    activate: () => undefined,
    releaseActive: () => undefined,
    dispose: () => undefined,
  };
}

const TERMINAL_STATES: readonly SurvivalState[] = ['rescued', 'dead', 'sunk'];
type EventPresentationState =
  | 'idle'
  | 'sleeping'
  | 'transitioning'
  | 'revealing'
  | 'choosing'
  | 'using'
  | 'resolving';

function isTerminal(state: SurvivalState): state is 'rescued' | 'dead' | 'sunk' {
  return TERMINAL_STATES.includes(state);
}

function reportInvariantError(error: Error): void {
  console.error(error);
}

export function formatDiveResult(outcome: ActionOutcome): RewardResultView {
  const lines: string[] = [];
  let reward = outcome.rewardSummary ?? null;
  const itemRewards = [
    ['food', 'food'],
    ['bait', 'bait'],
    ['repairMaterial', 'repairMaterial'],
  ] as const;
  if (reward === null) {
    for (const [resource, id] of itemRewards) {
      const delta = outcome.deltas[resource];
      if (delta !== undefined && delta > 0) {
        reward = { kind: 'resource', id, quantity: delta };
        break;
      }
    }
  }
  const textRewards = [
    ['rescueProgress', 'RESCUE PROGRESS'],
  ] as const;
  for (const [resource, label] of textRewards) {
    const delta = outcome.deltas[resource];
    if (delta !== undefined && delta !== 0) {
      lines.push(`${label} ${delta > 0 ? '+' : ''}${delta}`);
    }
  }
  if (reward === null && lines.length === 0) lines.push('NOTHING FOUND');
  const appliedHealthDelta = outcome.deltas.health;
  if (appliedHealthDelta !== undefined && appliedHealthDelta < 0) {
    lines.push('YOU SUFFERED SOME INJURIES');
  }
  return { title: 'DIVE RESULT', reward, lines };
}

function testContext(
  sceneRenderer: SceneRenderer = {
    render: () => undefined,
    resize: () => undefined,
    dispose: () => undefined,
  },
  audio: AudioSystem = AudioSystem.silent(),
): PhaseContext {
  const mount = {
    clientWidth: 1,
    clientHeight: 1,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1, height: 1 }),
  } as unknown as HTMLElement;
  return {
    mount,
    renderer: { render: () => undefined } as unknown as PhaseContext['renderer'],
    sceneRenderer,
    visualQuality: createVisualQualityPreference(() => undefined, null),
    waterQuality: createWaterQualityPreference(() => undefined, null),
    camera: new PerspectiveCamera(),
    propModels: {} as PropModelLibrary,
    menuModels: { dispose: () => undefined } as unknown as PhaseContext['menuModels'],
    menuSandAssets: {} as PhaseContext['menuSandAssets'],
    shipFurniture: {} as ShipFurnitureLibrary,
    maxTextureAnisotropy: 1,
    skyAssets: {} as SkyAssets,
    lifeboatAssets: {} as LifeboatAssets,
    shipAssets: {} as ShipAssets,
    physicsRuntime: {} as PhysicsRuntime,
    physicsMode: 'enabled',
    audio,
    onFatalError: () => undefined,
  };
}

export class SurvivalPhase implements GamePhase {
  private context!: PhaseContext;
  private session!: Partial<SurvivalSession> & Pick<SurvivalSession, 'snapshot'>;
  private world!: SurvivalPhaseTestDependencies['world'];
  private ui!: Partial<SurvivalUI>;
  private onRestart!: () => void;
  private scavengeElapsedSeconds = 0;
  private elapsedSeconds = 0;
  private simulationTimeInitialized = false;
  private readonly visualState: SurvivalVisualState = {
    kind: 'survival',
    elapsedSeconds: 0,
    phase: 'day',
    weather: 'calm',
  };
  private busy = false;
  private paused = false;
  private visibilityPauseActive = false;
  private disposed = false;
  private started = false;
  private restartRequested = false;
  private presentedTerminalState: SurvivalState | null = null;
  private presentedInventorySnapshot: SurvivalSnapshot | null = null;
  private lastReadJournalDay = 0;
  private visibilityDocument: Document | null = null;
  private viewportWidth = 1;
  private viewportHeight = 1;
  private fishingFlow!: SurvivalFishingFlow;
  private driftingItemFlow!: DriftingItemFlow;
  private eventPresentation: EventPresentationState = 'idle';
  private deferredPresentationSync: {
    readonly generation: number;
    readonly before: SurvivalSnapshot;
  } | null = null;
  private eventEligibility = new Map<ItemInstanceId, EventResponseId>();
  private automaticWeather: PresentationWeatherId | null = null;
  private forcedWeather: PresentationWeatherId | null = null;
  private forcedPresentationPhase: SkyPhase | null = null;
  private effectivePresentationWeather: PresentationWeatherId = 'calm';
  private lifecycleGeneration = 0;
  private readonly visibilityResumeWaiters = new Set<() => void>();
  private audio!: SurvivalAudio;
  private onInvariantError: (error: Error) => void = reportInvariantError;
  private onFatalError: (error: unknown) => void = (error) => reportInvariantError(
    error instanceof Error ? error : new Error(String(error)),
  );
  private eventBundles!: EventBundleManagerLike;
  private itemAnimationLab = false;
  private rearCameraView = false;
  private initialEventResultId: string | undefined;

  constructor(
    context: PhaseContext,
    savedItems: readonly ItemInstance[],
    seed: number,
    scavengeElapsedSeconds: number,
    onRestart: () => void,
    initialEventId?: string,
    initialEventResultId?: string,
  );
  constructor(
    context: PhaseContext,
    savedItems: readonly ItemInstance[],
    seed: number,
    scavengeElapsedSeconds: number,
    onRestart: () => void,
    initialEventId: string | undefined,
    initialEventResultId: string | undefined,
    testDependencies?: SurvivalPhaseTestDependencies,
  ) {
    this.initialEventResultId = initialEventResultId;
    const itemAnimationLab = isItemAnimationLabId(initialEventId);
    if (testDependencies === undefined) {
      const session = new SurvivalSession(savedItems, {
        seed,
        ...(itemAnimationLab
          ? {
              initial: ITEM_ANIMATION_LAB_INITIAL_RESOURCES,
              initialChest: ITEM_ANIMATION_LAB_INITIAL_CHEST,
            }
          : {}),
        ...(
          initialEventId === undefined || itemAnimationLab
            ? {}
            : { initialEventId }
        ),
      });
      const world = new BoatWorld(
        context.camera,
        context.propModels,
        context.skyAssets.moonTexture,
        session.snapshot().savedItems,
        context.lifeboatAssets,
        context.shipFurniture,
        context.waterQuality?.get() ?? 'low',
      );
      this.initialize(
        context,
        session,
        world,
        new SurvivalUI(context.mount),
        scavengeElapsedSeconds,
        onRestart,
        reportInvariantError,
        itemAnimationLab,
        new EventBundleManager(new EventBundleLoader({
          audio: context.audio,
          host: world,
        })),
        context.onFatalError,
      );
      return;
    }
    this.initialize(
      context,
      testDependencies.session,
      testDependencies.world,
      testDependencies.ui,
      scavengeElapsedSeconds,
      testDependencies.onRestart ?? onRestart,
      testDependencies.onInvariantError,
      itemAnimationLab,
      testDependencies.eventBundles ?? createTestEventBundleManager(),
      testDependencies.onFatalError ?? context.onFatalError,
    );
  }

  static forTest(
    dependencies: SurvivalPhaseTestDependencies,
    initialEventId?: string,
    initialEventResultId?: string,
  ): SurvivalPhase {
    const TestConstructor = SurvivalPhase as unknown as new (
      context: PhaseContext,
      savedItems: readonly ItemInstance[],
      seed: number,
      scavengeElapsedSeconds: number,
      onRestart: () => void,
      initialEventId: string | undefined,
      initialEventResultId: string | undefined,
      dependencies: SurvivalPhaseTestDependencies,
    ) => SurvivalPhase;
    return new TestConstructor(
      testContext(dependencies.sceneRenderer, dependencies.audio),
      [],
      0,
      0,
      dependencies.onRestart ?? (() => undefined),
      initialEventId,
      initialEventResultId,
      dependencies,
    );
  }

  start(): void {
    if (this.disposed || this.started) return;
    this.started = true;
    this.audio.start();
    this.audio.setWeather(this.effectivePresentationWeather, 0);
    const snapshot = this.renderSnapshot(false);
    if (this.itemAnimationLab) {
      this.enterItemAnimationLab(snapshot);
    } else if (snapshot.pendingEventId !== null && !isTerminal(snapshot.state)) {
      void this.runPendingEventReveal(snapshot, this.lifecycleGeneration);
    }

    if (typeof document !== 'undefined') {
      this.visibilityDocument = document;
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
      if (document.hidden) {
        if (!this.paused) {
          this.visibilityPauseActive = true;
          this.setPaused(true);
        }
        this.world.setDocumentHidden?.(true);
      }
    }
  }

  update(time: number, deltaSeconds: number): void {
    if (this.disposed || this.documentIsHidden()) return;
    if (this.paused) return;
    this.elapsedSeconds = this.simulationTimeInitialized
      ? this.elapsedSeconds + deltaSeconds
      : time;
    this.simulationTimeInitialized = true;
    this.world.update?.(this.elapsedSeconds, deltaSeconds);
    const snapshot = this.session.snapshot();
    this.syncCameraTurnControl(snapshot);
    const presentationSnapshot = this.deferredPresentationSync?.before ?? snapshot;
    this.audio.update(deltaSeconds);
    this.syncVisualState(presentationSnapshot);
    this.syncPresentation(snapshot);
    if (this.started) this.fishingFlow.update(deltaSeconds);
    this.presentTerminalOnce(snapshot);
  }

  resize(width: number, height: number): void {
    if (this.disposed || width <= 0 || height <= 0) return;
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.context.camera.aspect = width / height;
    this.context.camera.updateProjectionMatrix();
    this.syncPresentation(this.session.snapshot());
    this.fishingFlow.resize(width, height);
    this.driftingItemFlow.syncTarget(width, height);
  }

  render(): void {
    if (this.disposed || this.world.scene === undefined) return;
    this.context.sceneRenderer.render(
      this.world.scene,
      this.context.camera,
      this.visualState,
    );
  }

  private async renderAndSettleCoveredScene(generation: number): Promise<boolean> {
    this.render();
    await (this.ui.settleCoveredScene?.() ?? Promise.resolve());
    return this.isContinuationActive(generation);
  }

  handleAction(action: DayActionId, option?: DayActionOption): void {
    if (!this.canAcceptCommand()) {
      this.audio.deny();
      return;
    }
    const beforeAction = this.session.snapshot();
    if (action === 'fish') {
      void this.fishingFlow.begin();
      return;
    }
    const selectedOption = action === 'repair' ? this.repairOption(this.session.snapshot()) : option;
    const outcome = this.session.perform?.(action, selectedOption);
    if (outcome === undefined) return;
    if (!outcome.accepted) {
      this.audio.deny();
      this.ui.showFeedback?.(outcome);
      return;
    }
    if (action === 'endDay') {
      this.audio.sleep();
      void this.runEndDay(outcome);
      return;
    }
    if (action === 'dive') {
      void this.runDiveAction(outcome);
      return;
    }
    this.audio.action(action, selectedOption);
    if (action === 'petCarlitos' || action === 'feedCarlitos') {
      this.syncPresentation(this.session.snapshot());
      void this.runCarlitosAction(action);
      return;
    }
    if (action === 'openChest') {
      void this.runChestAction(outcome, beforeAction);
      return;
    }
    void this.runDayAction(outcome);
  }

  handleEventItem(choiceId: EventResponseId, instanceId: ItemInstanceId): void {
    if (
      this.eventPresentation !== 'choosing'
      || this.eventEligibility.get(instanceId) !== choiceId
    ) return;
    if (this.itemAnimationLab) {
      void this.playItemAnimationLab(instanceId, this.lifecycleGeneration);
      return;
    }
    void this.resolveEventWithItem(choiceId, instanceId, this.lifecycleGeneration);
  }

  handleEndure(): void {
    if (this.eventPresentation !== 'choosing') return;
    if (
      this.eventEligibility.size !== 0
      && this.session.snapshot().pendingEventId !== 'other-people'
    ) return;
    void this.resolveEndure(this.lifecycleGeneration);
  }

  handleJournalOpen(): void {
    if (this.disposed || this.busy || this.paused || this.documentIsHidden()) return;
    const snapshot = this.session.snapshot();
    this.lastReadJournalDay = this.latestJournalDay(snapshot);
    this.audio.journal();
    this.ui.setJournalUnread?.(false);
    this.ui.showJournal?.(snapshot.journalEntries);
  }

  handleJournalClose(): void {
    if (this.disposed) return;
    this.audio.journal();
    this.ui.hideJournal?.();
  }

  setPaused(paused: boolean): void {
    if (this.disposed || (!paused && this.documentIsHidden())) return;
    this.paused = paused;
    this.audio.setPaused(paused);
    if (!paused) this.visibilityPauseActive = false;
    this.ui.setPaused?.(paused);
    this.syncCameraTurnControl(this.session.snapshot());
    if (!paused) this.releaseVisibilityResumeWaiters();
  }

  setWeatherOverride(id: PresentationWeatherId | null): void {
    this.forcedWeather = id;
    this.syncPresentationWeather();
  }

  setTimeOfDayOverride(phase: SkyPhase | null): void {
    this.forcedPresentationPhase = phase;
    this.world.setPresentationPhaseOverride?.(phase);
    this.syncCameraTurnControl(this.session.snapshot());
  }

  setWaterQuality(value: WaterQuality): void {
    if (this.disposed) return;
    this.world.setWaterQuality?.(value);
  }

  getPresentationWeather(): PresentationWeatherId {
    return this.effectivePresentationWeather;
  }

  getPresentationPhase(): SkyPhase {
    return this.forcedPresentationPhase ?? this.visualState.phase;
  }

  requestRestart(): void {
    if (this.disposed || this.restartRequested) return;
    this.clearEventPresentation();
    this.driftingItemFlow.dispose();
    this.audio.cancelDive();
    this.restartRequested = true;
    this.lifecycleGeneration += 1;
    this.releaseVisibilityResumeWaiters();
    this.onRestart();
  }

  dispose(): void {
    if (this.disposed) return;
    this.clearEventPresentation();
    this.driftingItemFlow.dispose();
    this.disposed = true;
    this.lifecycleGeneration += 1;
    this.releaseVisibilityResumeWaiters();
    this.fishingFlow.dispose();
    this.ui.onFishingResultContinue = null;
    this.ui.onFishingViewExit = null;
    this.ui.onDriftingItemSelect = null;
    this.ui.onDriftingItemBack = null;
    if (this.visibilityDocument !== null) {
      this.visibilityDocument.removeEventListener('visibilitychange', this.handleVisibilityChange);
      this.visibilityDocument = null;
    }
    this.eventBundles.dispose();
    this.audio.dispose();
    this.world.dispose?.();
    this.ui.dispose?.();
  }

  private initialize(
    context: PhaseContext,
    session: Partial<SurvivalSession> & Pick<SurvivalSession, 'snapshot'>,
    world: SurvivalPhaseTestDependencies['world'],
    ui: Partial<SurvivalUI>,
    scavengeElapsedSeconds: number,
    onRestart: () => void,
    onInvariantError: (error: Error) => void = reportInvariantError,
    itemAnimationLab = false,
    eventBundles: EventBundleManagerLike = createTestEventBundleManager(),
    onFatalError: (error: unknown) => void = (error) => reportInvariantError(
      error instanceof Error ? error : new Error(String(error)),
    ),
  ): void {
    this.context = context;
    this.session = session;
    this.world = world;
    this.ui = ui;
    this.scavengeElapsedSeconds = scavengeElapsedSeconds;
    this.onRestart = onRestart;
    this.onInvariantError = onInvariantError;
    this.onFatalError = onFatalError;
    this.eventBundles = eventBundles;
    this.itemAnimationLab = itemAnimationLab;
    this.audio = new SurvivalAudio(context.audio.createScope());
    this.fishingFlow = new SurvivalFishingFlow({
      session: session as FishingSessionPort,
      world: world as FishingWorldPort,
      ui: ui as FishingUiPort,
      audio: this.audio,
      renderSnapshot: () => { this.renderSnapshot(false, false); },
      setBusy: (busy) => this.setBusy(busy),
      isPaused: () => this.paused,
      isHidden: () => this.documentIsHidden(),
      isLifecycleActive: () => this.isContinuationActive(),
      captureLifecycleGeneration: () => this.lifecycleGeneration,
      advanceLifecycleGeneration: () => ++this.lifecycleGeneration,
      isLifecycleGenerationCurrent: (generation) => this.isContinuationActive(generation),
    });
    this.driftingItemFlow = new DriftingItemFlow({
      world: world as DriftingItemWorldPort,
      ui: ui as DriftingItemUiPort,
      audio: this.audio,
      setBusy: (busy) => this.setBusy(busy),
      setEventResolutionActive: (active) => {
        if (active && this.eventPresentation === 'choosing') {
          this.eventPresentation = 'resolving';
        } else if (!active && this.eventPresentation === 'resolving') {
          this.eventPresentation = 'choosing';
        }
      },
      isPendingEvent: (eventId) => {
        if (!this.isContinuationActive() || this.eventPresentation !== 'choosing') return false;
        const snapshot = this.session.snapshot();
        return snapshot.pendingEventId === eventId && !isTerminal(snapshot.state);
      },
      resolveChoice: (choiceId) => this.resolveDriftingItemChoice(choiceId),
      waitForVisibilityResume: (generation) => this.waitForVisibilityResume(generation),
      captureLifecycleGeneration: () => this.lifecycleGeneration,
      isLifecycleGenerationCurrent: (generation) => this.isContinuationActive(generation),
    });
    this.world.setEventCueHandler?.(({ eventId, cue }) => {
      if (eventId === 'midnight-tour') this.audio.midnightTourCue(cue);
    });
    this.world.setLightningStrikeListener?.(() => this.audio.thunder());
    this.wireUI();
  }

  private enterItemAnimationLab(snapshot: SurvivalSnapshot): void {
    this.eventEligibility = this.itemAnimationLabEligibility(snapshot);
    this.eventPresentation = 'choosing';
    this.ui.beginEventPresentation?.();
    this.ui.showItemAnimationLab?.();
    this.world.setEventSelectedItem?.(null);
    this.world.setEventEligibleItems?.(new Set(this.eventEligibility.keys()));
    this.ui.setEventSelection?.(this.eventEligibility);
    this.setBusy(false);
  }

  private itemAnimationLabEligibility(
    snapshot: SurvivalSnapshot,
  ): Map<ItemInstanceId, EventResponseId> {
    const eligibility = new Map<ItemInstanceId, EventResponseId>();
    for (const item of Object.values(snapshot.inventory)) {
      if (item === undefined || item.condition !== 'usable') continue;
      const use = ITEM_ANIMATION_LAB_USES[item.type];
      if (use !== undefined) eligibility.set(item.instanceId, use.choiceId);
    }
    if (snapshot.carlitos?.alive) {
      eligibility.set(
        CARLITOS_LAB_INSTANCE_ID,
        CARLITOS_LAB_CHOICE_ID,
      );
    }
    eligibility.set(
      REPAIR_TOOLBOX_LAB_INSTANCE_ID,
      REPAIR_TOOLBOX_LAB_CHOICE_ID,
    );
    return eligibility;
  }

  private async playItemAnimationLab(
    instanceId: ItemInstanceId,
    generation: number,
  ): Promise<void> {
    if (instanceId === REPAIR_TOOLBOX_LAB_INSTANCE_ID) {
      await this.playRepairToolboxLab(generation);
      return;
    }
    const snapshot = this.session.snapshot();
    const inventoryItem = snapshot.inventory[instanceId];
    if (
      inventoryItem === undefined
      || inventoryItem.condition !== 'usable'
      || this.eventPresentation !== 'choosing'
      || !this.isContinuationActive(generation)
    ) return;

    const itemType = inventoryItem.type;
    const use = ITEM_ANIMATION_LAB_USES[itemType];
    if (use === undefined) return;
    this.eventPresentation = 'using';
    this.setBusy(true);
    this.ui.setEventUsing?.(instanceId);
    this.world.setEventEligibleItems?.(new Set());
    this.world.setEventSelectedItem?.(instanceId);
    this.setAutomaticWeather(presentationWeatherForEvent(use.eventId));
    if (!this.beginEventBundleLoad(use.eventId)) return;
    try {
      const activation = this.eventBundles.activate(use.eventId as SurvivalEventId);
      if (activation !== undefined) await activation;
    } catch (error) {
      this.onFatalError(error);
      return;
    }
    if (!this.isContinuationActive(generation)) return;
    this.world.stageEvent?.(use.eventId);

    try {
      await this.playEventItemUseWithSound(
        use.eventId,
        use.choiceId,
        instanceId,
        itemType,
      );
      await this.world.returnEventItemUse?.();
    } catch (error) {
      this.onInvariantError(
        error instanceof Error ? error : new Error(String(error)),
      );
    } finally {
      if (!this.isContinuationActive(generation)) return;
      this.world.clearEvent?.();
      this.eventBundles.releaseActive();
      this.setAutomaticWeather(null);
      this.world.setEventSelectedItem?.(null);
      this.world.setEventEligibleItems?.(new Set(this.eventEligibility.keys()));
      this.ui.setEventSelection?.(this.eventEligibility);
      this.eventPresentation = 'choosing';
      this.setBusy(false);
    }
  }

  private async playRepairToolboxLab(generation: number): Promise<void> {
    if (
      this.eventPresentation !== 'choosing'
      || !this.isContinuationActive(generation)
    ) return;
    this.eventPresentation = 'using';
    this.setBusy(true);
    this.ui.setEventUsing?.(REPAIR_TOOLBOX_LAB_INSTANCE_ID);
    this.world.setEventEligibleItems?.(new Set());
    this.world.setEventSelectedItem?.(REPAIR_TOOLBOX_LAB_INSTANCE_ID);
    try {
      await (this.world.playRepairToolboxAnimation?.(
        () => this.audio.repairToolbox(),
      ) ?? Promise.resolve());
    } catch (error) {
      this.onInvariantError(
        error instanceof Error ? error : new Error(String(error)),
      );
    } finally {
      if (!this.isContinuationActive(generation)) return;
      this.world.setEventSelectedItem?.(null);
      this.world.setEventEligibleItems?.(new Set(this.eventEligibility.keys()));
      this.ui.setEventSelection?.(this.eventEligibility);
      this.eventPresentation = 'choosing';
      this.setBusy(false);
    }
  }

  private playEventItemUseWithSound(
    eventId: string,
    choiceId: string,
    instanceId: ItemInstanceId,
    itemType: ItemId | undefined,
  ): Promise<void> {
    if (
      itemType === 'shotgun'
      || itemType === 'flashlight'
      || itemType === 'flareGun'
      || itemType === 'anchor'
      || itemType === 'ductTape'
    ) {
      if (itemType === 'anchor') this.audio.eventItem(itemType);
      return this.world.playEventItemUse?.(
        eventId,
        choiceId,
        instanceId,
        (cueIndex) => this.audio.eventItemCue(itemType, cueIndex),
      ) ?? Promise.resolve();
    }
    if (itemType === 'umbrella') this.audio.eventItem(itemType);
    return this.world.playEventItemUse?.(
      eventId,
      choiceId,
      instanceId,
    ) ?? Promise.resolve();
  }

  private wireUI(): void {
    this.ui.onAction = (action, option) => this.handleAction(action, option);
    this.ui.onEventItem = (choiceId, instanceId) => this.handleEventItem(choiceId, instanceId);
    this.ui.onEventChoice = (choiceId) =>
      void this.resolveContextualChoice(choiceId, this.lifecycleGeneration);
    this.ui.onRestart = () => this.requestRestart();
    this.ui.onAnchorHighlight = (anchorId) => {
      if (!this.disposed) this.world.setHighlightedItem?.(anchorId);
    };
    this.ui.onPauseChange = (paused) => this.setPaused(paused);
    this.ui.onJournalOpen = () => this.handleJournalOpen();
    this.ui.onJournalClose = () => this.handleJournalClose();
    this.ui.onJournalPage = () => this.audio.journal();
    this.ui.onFishingCast = (point) => this.fishingFlow.cast(
      point?.x ?? null,
      point?.y ?? null,
      this.viewportWidth,
      this.viewportHeight,
    );
    this.ui.onFishingReel = () => this.fishingFlow.reel();
    this.ui.onFishingResultContinue = () => this.fishingFlow.continueResult();
    this.ui.onFishingViewExit = () => this.fishingFlow.exitReadyView();
    this.ui.onDriftingItemSelect = (eventId) => {
      const snapshot = this.session.snapshot();
      const event = snapshot.pendingEventId === eventId
        ? survivalEventById(eventId)
        : undefined;
      if (event === undefined) return;
      void this.driftingItemFlow.enter(
        eventId,
        this.contextualChoicesFor(event, snapshot),
      );
    };
    this.ui.onDriftingItemBack = () => { void this.driftingItemFlow.back(); };
    this.ui.onCameraTurn = () => this.handleCameraTurn();
  }

  private repairOption(snapshot: SurvivalSnapshot): DayActionOption | undefined {
    if (snapshot.repairMaterial > 0) {
      return { kind: 'hullRepair', material: 'repairMaterial' };
    }
    const hasDuctTape = Object.values(snapshot.inventory).some(
      (item) => item?.type === 'ductTape' && item.condition === 'usable',
    );
    if (hasDuctTape) return { kind: 'hullRepair', material: 'ductTape' };
    return undefined;
  }

  private repairItemReason(snapshot: SurvivalSnapshot): string | null {
    const target = Object.values(snapshot.inventory).find(
      (item) => item?.condition === 'broken' && ITEM_DEFINITIONS[item.type].breakable,
    );
    if (target === undefined) return 'No broken repairable item remains.';
    return this.session.availableReason?.('repairItem', {
      kind: 'itemRepair',
      target: target.instanceId,
    }) ?? null;
  }

  private canAcceptCommand(): boolean {
    if (
      this.disposed
      || this.busy
      || this.paused
      || this.documentIsHidden()
    ) return false;
    return !isTerminal(this.session.snapshot().state);
  }

  private setBusy(busy: boolean): void {
    this.busy = busy;
    this.ui.setBusy?.(busy);
    this.syncCameraTurnControl(this.session.snapshot());
  }

  private handleCameraTurn(): void {
    if (!this.canAcceptCommand()) return;
    const snapshot = this.session.snapshot();
    if (!this.cameraTurnAvailable(snapshot)) return;
    this.rearCameraView = !this.rearCameraView;
    this.world.setRearCameraView?.(this.rearCameraView);
    this.ui.setCameraTurnState?.(true, this.rearCameraView);
  }


  private isContinuationActive(generation?: number): boolean {
    return !this.disposed
      && !this.restartRequested
      && (generation === undefined || generation === this.lifecycleGeneration);
  }

  private async runDayAction(outcome: ActionOutcome): Promise<void> {
    this.setBusy(true);
    await (this.world.play?.(outcome.cue) ?? Promise.resolve());
    if (this.disposed) return;
    const snapshot = this.renderSnapshot(false, false);
    if (isTerminal(snapshot.state)) {
      this.setBusy(false);
      this.presentTerminalOnce(snapshot);
      return;
    }
    this.setBusy(false);
    this.ui.restoreCommandFocus?.();
  }

  private async runChestAction(
    outcome: ActionOutcome,
    beforeAction: SurvivalSnapshot,
  ): Promise<void> {
    const generation = ++this.lifecycleGeneration;
    this.beginDeferredPresentationSync(beforeAction, generation);
    this.setBusy(true);
    await (this.world.play?.(outcome.cue) ?? Promise.resolve());
    if (!this.isContinuationActive(generation)) return;
    const resultHold = this.ui.showRewardResult?.({
      title: 'CHEST REWARD',
      reward: outcome.rewardSummary ?? null,
      lines: [],
    }) ?? Promise.resolve();
    await resultHold;
    if (!this.isContinuationActive(generation)) return;
    this.cancelDeferredPresentationSync(generation);
    const snapshot = this.renderSnapshot(false, false);
    this.setBusy(false);
    if (isTerminal(snapshot.state)) this.presentTerminalOnce(snapshot);
    else this.ui.restoreCommandFocus?.();
  }

  private async runCarlitosAction(
    action: 'petCarlitos' | 'feedCarlitos',
  ): Promise<void> {
    this.setBusy(true);
    await (this.world.playCarlitosAction?.(action) ?? Promise.resolve());
    if (this.disposed) return;
    this.renderSnapshot(false, false);
    this.setBusy(false);
    this.ui.restoreCommandFocus?.();
  }

  private async runDiveAction(outcome: ActionOutcome): Promise<void> {
    const generation = ++this.lifecycleGeneration;
    const scuba = Object.values(this.session.snapshot().inventory).find(
      (item) => item?.type === 'scubaSet' && item.condition === 'usable',
    );
    const instanceId = scuba?.instanceId ?? 'scubaSet-1';
    this.setBusy(true);

    await (this.world.playDive?.(instanceId, () => {
      if (this.isContinuationActive(generation)) this.audio.beginDive();
    }) ?? Promise.resolve());
    if (!await this.waitForVisibilityResume(generation)) return;

    await (this.ui.setSleepCoverProfile?.('dive') ?? Promise.resolve());
    if (!await this.waitForVisibilityResume(generation)) return;
    await (this.ui.setSleepCovered?.(true) ?? Promise.resolve());
    if (!await this.waitForVisibilityResume(generation)) return;

    this.world.clearDivePresentation?.();
    this.audio.finishDive();
    const snapshot = this.renderSnapshot(false, false);
    const [coveredSceneSettled] = await Promise.all([
      this.renderAndSettleCoveredScene(generation),
      this.ui.holdDiveCovered?.() ?? Promise.resolve(),
    ]);
    if (!coveredSceneSettled) return;
    if (!await this.waitForVisibilityResume(generation)) return;
    await (this.ui.setSleepCovered?.(false) ?? Promise.resolve());
    if (!await this.waitForVisibilityResume(generation)) return;
    await (this.ui.setSleepCoverProfile?.('solid') ?? Promise.resolve());
    if (!await this.waitForVisibilityResume(generation)) return;

    const resultHold = this.ui.showRewardResult?.(formatDiveResult(outcome)) ?? Promise.resolve();
    await resultHold;
    if (!await this.waitForVisibilityResume(generation)) return;
    this.setBusy(false);
    if (isTerminal(snapshot.state)) this.presentTerminalOnce(snapshot);
    else this.ui.restoreCommandFocus?.();
  }

  private async runEndDay(outcome: ActionOutcome): Promise<void> {
    const generation = this.lifecycleGeneration;
    const opensEvent = outcome.code !== 'quiet-night';
    this.eventPresentation = opensEvent ? 'transitioning' : 'sleeping';
    this.setBusy(true);
    if (opensEvent) this.ui.beginEventPresentation?.();
    const pendingEventId = this.session.snapshot().pendingEventId;
    if (
      opensEvent
      && pendingEventId !== null
      && !this.beginEventBundleLoad(pendingEventId)
    ) return;
    await Promise.all([
      this.world.play?.(outcome.cue) ?? Promise.resolve(),
      this.ui.setSleepCovered?.(true) ?? Promise.resolve(),
    ]);
    if (!this.isContinuationActive(generation)) return;
    this.audio.nightfall();
    let snapshot = this.renderSnapshot(false, false);

    if (outcome.code === 'quiet-night') {
      await (this.ui.holdSleep?.() ?? Promise.resolve());
      if (!this.isContinuationActive(generation)) return;
      snapshot = await this.runDawn(generation);
      if (!this.isContinuationActive(generation)) return;
      if (await this.revealDawnEvent(snapshot, generation)) return;
      if (!await this.renderAndSettleCoveredScene(generation)) return;
      await (this.ui.setSleepCovered?.(false) ?? Promise.resolve());
      if (!this.isContinuationActive(generation)) return;
      this.eventPresentation = 'idle';
      this.setBusy(false);
      this.presentTerminalOnce(snapshot);
      this.ui.restoreCommandFocus?.();
      return;
    }

    await this.runPendingEventReveal(snapshot, generation, true);
  }

  private async resolveEventWithItem(
    choiceId: EventResponseId,
    instanceId: ItemInstanceId,
    generation: number,
  ): Promise<void> {
    const pending = this.session.snapshot();
    const eventId = pending.pendingEventId;
    if (eventId === null) return;
    const itemType = pending.inventory[instanceId]?.type;
    const eventState = pending.state;
    this.eventPresentation = 'using';
    this.setBusy(true);
    this.ui.setEventUsing?.(instanceId);
    this.world.setEventEligibleItems?.(new Set());
    this.world.setEventSelectedItem?.(instanceId);
    await this.playEventItemUseWithSound(
      eventId,
      choiceId,
      instanceId,
      itemType,
    );
    if (!this.isContinuationActive(generation)) return;
    if (
      (this.visibilityPauseActive || this.documentIsHidden())
      && !await this.waitForVisibilityResume(generation)
    ) return;
    if (!this.isContinuationActive(generation)) return;
    const choice: EventChoicePresentation = {
      choiceId,
      instanceId,
      condition: pending.inventory[instanceId]?.condition ?? null,
    };
    await (
      this.world.playEventChoice?.(eventId, choice)
      ?? Promise.resolve()
    );
    if (!this.isContinuationActive(generation)) return;
    if (
      (this.visibilityPauseActive || this.documentIsHidden())
      && !await this.waitForVisibilityResume(generation)
    ) return;
    if (!this.isContinuationActive(generation)) return;
    this.eventPresentation = 'resolving';
    this.beginDeferredPresentationSync(pending, generation);
    const outcome = this.session.resolveEvent?.({ kind: 'item', choiceId, instanceId });
    if (outcome === undefined || !this.isContinuationActive(generation)) {
      this.cancelDeferredPresentationSync(generation);
      return;
    }
    if (!outcome.accepted) {
      this.cancelDeferredPresentationSync(generation);
      this.audio.deny();
      this.ui.showFeedback?.(outcome);
      this.eventPresentation = 'choosing';
      this.world.setEventSelectedItem?.(null);
      this.world.setEventEligibleItems?.(new Set(this.eventEligibility.keys()));
      this.restoreEventSelection();
      this.setBusy(false);
      return;
    }
    const focusedResult = isEventPresentationRoute(eventId, 'focused');
    const invariantError = focusedResult
      ? this.focusedEventResultError(eventId, choiceId, outcome)
      : null;
    if (invariantError !== null) {
      await this.recoverInvalidFocusedEventResult(
        invariantError,
        eventState,
        generation,
      );
      return;
    }
    const resolved = this.session.snapshot();
    const condition = resolved.inventory[instanceId]?.condition ?? 'lost';
    const resolvedChoice: EventChoicePresentation = {
      choiceId,
      instanceId,
      condition,
    };
    if (!focusedResult) {
      this.cancelDeferredPresentationSync(generation);
    } else if (isTerminal(resolved.state)) {
      this.flushDeferredPresentationSync(resolved, generation);
    }
    const response = isEventPresentationRoute(eventId, 'dedicated')
      ? resolvedChoice
      : deriveEventPhysicalResponse(
          choiceId,
          pending.inventory,
          resolved.inventory,
          instanceId,
        );
    const presentation = deriveEventOutcomePresentation(
      pending,
      resolved,
      outcome,
      instanceId,
    );
    await this.runEventResolution(
      eventId,
      outcome,
      eventState,
      generation,
      resolvedChoice,
      response,
      presentation,
      focusedResult,
    );
  }

  private async resolveContextualChoice(
    choiceId: EventResponseId,
    generation: number,
  ): Promise<void> {
    if (this.eventPresentation !== 'choosing' || !this.isContinuationActive(generation)) return;
    const pending = this.session.snapshot();
    const eventId = pending.pendingEventId;
    if (eventId === null) return;
    if (isDriftingItemEventId(eventId)) {
      await this.driftingItemFlow.choose(choiceId);
      return;
    }
    if (eventId === 'midnight-tour' && choiceId === 'visit') {
      await this.resolveMidnightTourVisit(generation);
      return;
    }
    this.ui.setEventSleepMask?.(eventId, choiceId === 'sleep');
    if (choiceId === 'sleep') this.audio.sleep();
    else this.audio.confirm();
    this.eventPresentation = 'using';
    this.setBusy(true);
    const choice: EventChoicePresentation = {
      choiceId,
      instanceId: null,
      condition: null,
    };
    await Promise.all([
      this.ui.playEventChoiceBeat?.(choiceId) ?? Promise.resolve(),
      this.world.playEventChoice?.(
        eventId,
        isEventPresentationRoute(eventId, 'focused') ? choice : choiceId,
      ) ?? Promise.resolve(),
    ]);
    if (!this.isContinuationActive(generation)) return;
    if (
      (this.visibilityPauseActive || this.documentIsHidden())
      && !await this.waitForVisibilityResume(generation)
    ) return;
    if (!this.isContinuationActive(generation)) return;
    this.eventPresentation = 'resolving';
    this.beginDeferredPresentationSync(pending, generation);
    const outcome = this.session.resolveEvent?.({ kind: 'choice', choiceId });
    if (outcome === undefined || !this.isContinuationActive(generation)) {
      this.cancelDeferredPresentationSync(generation);
      return;
    }
    if (!outcome.accepted) {
      this.cancelDeferredPresentationSync(generation);
      this.audio.deny();
      this.ui.setEventSleepMask?.(eventId, false);
      this.ui.showFeedback?.(outcome);
      this.eventPresentation = 'choosing';
      this.restoreEventSelection();
      this.setBusy(false);
      return;
    }
    const focusedResult = isEventPresentationRoute(eventId, 'focused');
    const invariantError = focusedResult
      ? this.focusedEventResultError(eventId, choiceId, outcome)
      : null;
    if (invariantError !== null) {
      await this.recoverInvalidFocusedEventResult(
        invariantError,
        pending.state,
        generation,
      );
      return;
    }
    const resolved = this.session.snapshot();
    if (!focusedResult) {
      this.cancelDeferredPresentationSync(generation);
    } else if (isTerminal(resolved.state)) {
      this.flushDeferredPresentationSync(resolved, generation);
    }
    const presentation = deriveEventOutcomePresentation(
      pending,
      resolved,
      outcome,
      null,
    );
    await this.runEventResolution(
      eventId,
      outcome,
      pending.state,
      generation,
      choice,
      deriveEventPhysicalResponse(
        choiceId,
        pending.inventory,
        resolved.inventory,
        null,
      ),
      presentation,
      focusedResult,
    );
  }

  private async resolveMidnightTourVisit(generation: number): Promise<void> {
    const pending = this.session.snapshot();
    if (
      pending.pendingEventId !== 'midnight-tour'
      || !this.isContinuationActive(generation)
    ) return;
    const eventId = 'midnight-tour';
    const choice: EventChoicePresentation = {
      choiceId: 'visit',
      instanceId: null,
      condition: null,
    };
    this.audio.confirm();
    this.eventPresentation = 'using';
    this.setBusy(true);
    try {
      await (this.ui.setSleepCoverProfile?.('midnight-tour') ?? Promise.resolve());
      if (!this.isContinuationActive(generation)) return;
      await Promise.all([
        this.ui.playEventChoiceBeat?.('visit') ?? Promise.resolve(),
        this.ui.setSleepCovered?.(true) ?? Promise.resolve(),
      ]);
      if (!this.isContinuationActive(generation)) return;
      await (this.world.playEventChoice?.(eventId, choice) ?? Promise.resolve());
      if (!this.isContinuationActive(generation)) return;
      if (
        (this.visibilityPauseActive || this.documentIsHidden())
        && !await this.waitForVisibilityResume(generation)
      ) return;
      if (!this.isContinuationActive(generation)) return;

      this.eventPresentation = 'resolving';
      this.beginDeferredPresentationSync(pending, generation);
      const resultId = this.initialEventResultId;
      this.initialEventResultId = undefined;
      const outcome = this.session.resolveEvent?.({
        kind: 'choice',
        choiceId: 'visit',
        ...(resultId === undefined ? {} : { resultId }),
      });
      if (!this.isContinuationActive(generation)) return;
      if (outcome === undefined) {
        throw new Error('Midnight Tour visit did not return an outcome.');
      }
      if (!outcome.accepted) {
        await this.recoverMidnightTourVisit(
          generation,
          { rejection: outcome },
        );
        return;
      }

      const invariantError = this.focusedEventResultError(eventId, 'visit', outcome);
      if (invariantError !== null) {
        await this.recoverMidnightTourVisit(
          generation,
          { invariantError },
        );
        return;
      }
      const resolved = this.session.snapshot();
      const presentation = deriveEventOutcomePresentation(
        pending,
        resolved,
        outcome,
        null,
      );
      await this.completeMidnightTourVisit(
        eventId,
        outcome,
        generation,
        choice,
        presentation,
      );
    } catch (error) {
      await this.recoverMidnightTourVisit(generation, { fatalError: error });
    }
  }

  private async completeMidnightTourVisit(
    eventId: 'midnight-tour',
    outcome: ActionOutcome,
    generation: number,
    choice: EventChoicePresentation,
    presentation: EventOutcomePresentation,
  ): Promise<void> {
    this.setBusy(true);
    this.ui.hideEventReveal?.();
    await (this.ui.setSleepCovered?.(false) ?? Promise.resolve());
    if (!this.isContinuationActive(generation)) return;
    if (
      (this.visibilityPauseActive || this.documentIsHidden())
      && !await this.waitForVisibilityResume(generation)
    ) return;
    if (!this.isContinuationActive(generation)) return;

    this.audio.beginEventReaction(eventId, outcome);
    await Promise.all([
      this.world.play?.(outcome.cue) ?? Promise.resolve(),
      this.world.reactToEventOutcome?.(
        eventId,
        outcome,
        choice,
        presentation,
      ) ?? Promise.resolve(),
    ]);
    this.audio.finishEventReaction(eventId);
    if (!this.isContinuationActive(generation)) return;
    if (
      (this.visibilityPauseActive || this.documentIsHidden())
      && !await this.waitForVisibilityResume(generation)
    ) return;
    if (!this.isContinuationActive(generation)) return;

    await (this.ui.setSleepCovered?.(true) ?? Promise.resolve());
    if (!this.isContinuationActive(generation)) return;
    this.audio.clearMidnightTour();
    this.clearEventPresentation(true);
    await (this.ui.setSleepCoverProfile?.('solid') ?? Promise.resolve());
    if (!this.isContinuationActive(generation)) return;

    const resolved = this.session.snapshot();
    const snapshot = isTerminal(resolved.state)
      ? this.renderSnapshot(false, false)
      : await this.runDawn(generation);
    if (!this.isContinuationActive(generation)) return;
    if (!await this.renderAndSettleCoveredScene(generation)) return;
    this.flushDeferredPresentationSync(snapshot, generation);

    if (isTerminal(snapshot.state)) {
      this.presentTerminalOnce(snapshot, true);
      this.setBusy(false);
      return;
    }
    if (await this.revealDawnEvent(snapshot, generation)) return;
    await (this.ui.setSleepCovered?.(false) ?? Promise.resolve());
    if (!this.isContinuationActive(generation)) return;

    this.eventPresentation = 'idle';
    this.setBusy(false);
    this.ui.restoreCommandFocus?.();
  }

  private async recoverMidnightTourVisit(
    generation: number,
    reason: {
      readonly rejection?: ActionOutcome;
      readonly invariantError?: Error;
      readonly fatalError?: unknown;
    },
  ): Promise<void> {
    this.cancelDeferredPresentationSync(generation);
    if (!this.isContinuationActive(generation)) return;
    try {
      await (this.ui.setSleepCovered?.(true) ?? Promise.resolve());
    } catch {
      // Preserve the original failure while later cleanup steps continue.
    }
    if (!this.isContinuationActive(generation)) return;
    try {
      this.clearEventPresentation();
    } catch {
      // Continue the remaining cleanup steps.
    }
    if (!this.isContinuationActive(generation)) return;
    try {
      await (this.ui.setSleepCoverProfile?.('solid') ?? Promise.resolve());
    } catch {
      // Continue the remaining cleanup steps.
    }
    if (!this.isContinuationActive(generation)) return;
    try {
      this.renderSnapshot(false, false);
    } catch {
      // Continue the remaining cleanup steps.
    }
    if (!this.isContinuationActive(generation)) return;
    try {
      await this.renderAndSettleCoveredScene(generation);
    } catch {
      // Continue to the final uncover.
    }
    if (!this.isContinuationActive(generation)) return;
    try {
      await (this.ui.setSleepCovered?.(false) ?? Promise.resolve());
    } catch {
      // Continue to error reporting and input unlock.
    }
    if (!this.isContinuationActive(generation)) return;

    try {
      if (reason.rejection !== undefined) {
        this.audio.deny();
        this.ui.showFeedback?.(reason.rejection);
        this.eventPresentation = 'choosing';
        this.restoreEventSelection();
      } else if (reason.invariantError !== undefined) {
        this.onInvariantError(reason.invariantError);
      } else {
        this.onFatalError(reason.fatalError);
      }
    } finally {
      this.setBusy(false);
    }
    this.ui.restoreCommandFocus?.();
  }

  private resolveDriftingItemChoice(
    choiceId: EventResponseId,
  ): DriftingItemChoiceResolution | undefined {
    const generation = this.lifecycleGeneration;
    if (this.eventPresentation !== 'resolving' || !this.isContinuationActive(generation)) {
      return undefined;
    }
    const pending = this.session.snapshot();
    const eventId = pending.pendingEventId;
    if (eventId === null || !isDriftingItemEventId(eventId)) return undefined;

    const outcome = this.session.resolveEvent?.({ kind: 'choice', choiceId });
    if (outcome === undefined || !this.isContinuationActive(generation)) return undefined;
    if (!outcome.accepted) {
      this.audio.deny();
      this.ui.showFeedback?.(outcome);
      return { accepted: false };
    }

    this.renderSnapshot(false, false);
    this.eventEligibility.clear();
    this.world.setEventSelectedItem?.(null);
    this.world.setEventEligibleItems?.(null);
    this.ui.setEventSelection?.(this.eventEligibility, []);

    let animate = true;
    if (choiceId === 'retrieve' || choiceId === 'delegate-carlitos') {
      if (outcome.rewardSummary === undefined) {
        this.onInvariantError(new Error(
          `Drifting item ${eventId}/${choiceId} requires a reward summary.`,
        ));
        this.ui.showFeedback?.({
          accepted: false,
          message: 'The recovered salvage could not be identified.',
        });
        animate = false;
      }
    }

    let terminalSnapshot: SurvivalSnapshot | null = null;
    return {
      accepted: true,
      animate,
      clearEvent: () => {
        if (this.isContinuationActive(generation)) this.clearEventPresentation();
      },
      renderSnapshot: () => {
        if (!this.isContinuationActive(generation)) return false;
        const snapshot = this.renderSnapshot(false, false);
        if (isTerminal(snapshot.state)) terminalSnapshot = snapshot;
        return terminalSnapshot !== null;
      },
      presentTerminal: () => {
        if (
          terminalSnapshot !== null
          && this.isContinuationActive(generation)
        ) this.presentTerminalOnce(terminalSnapshot);
      },
    };
  }

  private async resolveEndure(generation: number): Promise<void> {
    this.eventPresentation = 'resolving';
    this.setBusy(true);
    const pending = this.session.snapshot();
    const eventState = pending.state;
    const eventId = pending.pendingEventId;
    if (eventId === null) return;
    this.audio.confirm();
    const choice: EventChoicePresentation = {
      choiceId: 'sleep',
      instanceId: null,
      condition: null,
    };
    if (eventId === 'other-people') {
      await (this.world.playEventChoice?.(eventId, choice) ?? Promise.resolve());
      if (!this.isContinuationActive(generation)) return;
    }
    this.beginDeferredPresentationSync(pending, generation);
    const outcome = this.session.resolveEvent?.({ kind: 'endure' });
    if (outcome === undefined || !this.isContinuationActive(generation)) {
      this.cancelDeferredPresentationSync(generation);
      return;
    }
    if (!outcome.accepted) {
      this.cancelDeferredPresentationSync(generation);
      this.audio.deny();
      this.ui.showFeedback?.(outcome);
      this.eventPresentation = 'choosing';
      this.setBusy(false);
      return;
    }
    const focusedResult = isEventPresentationRoute(eventId, 'focused');
    const invariantError = focusedResult
      ? this.focusedEventResultError(eventId, choice.choiceId, outcome)
      : null;
    if (invariantError !== null) {
      await this.recoverInvalidFocusedEventResult(
        invariantError,
        eventState,
        generation,
      );
      return;
    }
    const resolved = this.session.snapshot();
    if (!focusedResult) {
      this.cancelDeferredPresentationSync(generation);
    } else if (isTerminal(resolved.state)) {
      this.flushDeferredPresentationSync(resolved, generation);
    }
    const presentation = deriveEventOutcomePresentation(
      pending,
      resolved,
      outcome,
      null,
    );
    await this.runEventResolution(
      eventId,
      outcome,
      eventState,
      generation,
      choice,
      deriveEventPhysicalResponse(
        'endure',
        pending.inventory,
        resolved.inventory,
        null,
      ),
      presentation,
      focusedResult,
    );
  }

  private async runEventResolution(
    eventId: string,
    outcome: ActionOutcome,
    eventState: Extract<SurvivalState, 'dayEvent' | 'nightEvent'> | SurvivalState,
    generation: number,
    choice: EventChoicePresentation,
    physicalResponse: EventPhysicalResponsePresentation | EventChoicePresentation,
    presentation: EventOutcomePresentation,
    focusedResult: boolean,
    revealFromCover = false,
  ): Promise<void> {
    const stationaryHandymanTouch = eventId === 'handyman'
      && choice.choiceId === 'touch';
    this.setBusy(true);
    this.ui.hideEventReveal?.();
    this.audio.beginEventReaction(eventId, outcome);
    if (
      isEventPresentationRoute(eventId, 'dedicated')
      && (
        (presentation.resourceDeltas.hull ?? 0) < 0
        || (presentation.resourceDeltas.health ?? 0) < 0
      )
    ) {
      this.audio.eventAction(eventId, 'damage');
    }
    const response = isEventPresentationRoute(eventId, 'dedicated')
      ? physicalResponse
      : focusedResult ? choice : physicalResponse;
    if (revealFromCover) {
      const reaction = this.world.reactToEventOutcome?.(
        eventId,
        outcome,
        response,
        presentation,
      ) ?? Promise.resolve();
      await Promise.all([
        stationaryHandymanTouch
          ? Promise.resolve()
          : this.world.play?.(outcome.cue) ?? Promise.resolve(),
        reaction,
        this.ui.setSleepCovered?.(false) ?? Promise.resolve(),
      ]);
    } else {
      await Promise.all([
        stationaryHandymanTouch
          ? Promise.resolve()
          : this.world.play?.(outcome.cue) ?? Promise.resolve(),
        this.world.reactToEventOutcome?.(
          eventId,
          outcome,
          response,
          presentation,
        ) ?? Promise.resolve(),
      ]);
    }
    this.audio.finishEventReaction(eventId);
    if (!this.isContinuationActive(generation)) return;
    if (
      (this.visibilityPauseActive || this.documentIsHidden())
      && !await this.waitForVisibilityResume(generation)
    ) return;
    if (!this.isContinuationActive(generation)) return;
    const terminal = this.session.snapshot();
    if (focusedResult && !isTerminal(terminal.state)) {
      this.flushDeferredPresentationSync(terminal, generation);
    }
    const isDedicatedEvent = isEventPresentationRoute(eventId, 'dedicated');
    if (isTerminal(terminal.state)) {
      if (isDedicatedEvent) {
        await (this.ui.holdEventOutcome?.() ?? Promise.resolve());
        if (!this.isContinuationActive(generation)) return;
      }
      if (revealFromCover) {
        await (this.ui.setSleepCovered?.(true) ?? Promise.resolve());
        if (!this.isContinuationActive(generation)) return;
      }
      const snapshot = this.renderSnapshot(false, false);
      if (snapshot.state === 'rescued') this.retainTerminalEventTableau();
      else this.clearEventPresentation();
      if (revealFromCover) {
        await (this.ui.setSleepCoverProfile?.('solid') ?? Promise.resolve());
        if (!this.isContinuationActive(generation)) return;
      }
      this.eventPresentation = 'idle';
      if (revealFromCover) {
        this.presentTerminalOnce(snapshot, true);
        this.setBusy(false);
      } else {
        this.setBusy(false);
        this.presentTerminalOnce(snapshot);
      }
      return;
    }

    await (this.ui.holdEventOutcome?.() ?? Promise.resolve());
    if (!this.isContinuationActive(generation)) return;
    if (
      eventState === 'nightEvent'
      && terminal.state === 'nightEvent'
      && terminal.pendingEventId !== null
      && !this.beginEventBundleLoad(terminal.pendingEventId)
    ) return;
    await (this.ui.setSleepCovered?.(true) ?? Promise.resolve());
    if (!this.isContinuationActive(generation)) return;

    this.clearEventPresentation();
    if (revealFromCover) {
      await (this.ui.setSleepCoverProfile?.('solid') ?? Promise.resolve());
      if (!this.isContinuationActive(generation)) return;
    }
    if (
      eventState === 'nightEvent'
      && terminal.state === 'nightEvent'
      && terminal.pendingEventId !== null
    ) {
      await this.runPendingEventReveal(terminal, generation, true);
      return;
    }
    const snapshot = eventState === 'nightEvent'
      ? await this.runDawn(generation)
      : this.renderSnapshot(false, false);
    if (!this.isContinuationActive(generation)) return;
    if (eventState === 'nightEvent' && await this.revealDawnEvent(snapshot, generation)) return;
    if (!await this.renderAndSettleCoveredScene(generation)) return;
    await (this.ui.setSleepCovered?.(false) ?? Promise.resolve());
    if (!this.isContinuationActive(generation)) return;

    this.eventPresentation = 'idle';
    this.setBusy(false);
    this.presentTerminalOnce(snapshot);
    this.ui.restoreCommandFocus?.();
  }

  private async runDawn(generation: number): Promise<SurvivalSnapshot> {
    const dawn = this.session.beginDawn?.();
    if (dawn?.accepted) {
      this.audio.dawn();
      await (this.world.play?.(dawn.cue) ?? Promise.resolve());
    }
    if (!this.isContinuationActive(generation)) return this.session.snapshot();
    return this.renderSnapshot(false, false);
  }

  private async revealDawnEvent(
    snapshot: SurvivalSnapshot,
    generation: number,
  ): Promise<boolean> {
    if (snapshot.state !== 'dayEvent' || snapshot.pendingEventId === null) {
      return false;
    }
    this.ui.beginEventPresentation?.();
    await this.runPendingEventReveal(snapshot, generation, true);
    return this.isContinuationActive(generation);
  }

  private latestJournalDay(snapshot: SurvivalSnapshot): number {
    return snapshot.journalEntries.at(-1)?.day ?? 0;
  }

  private syncJournalUnread(snapshot: SurvivalSnapshot): void {
    this.ui.setJournalUnread?.(this.latestJournalDay(snapshot) > this.lastReadJournalDay);
  }

  private renderSnapshot(openPendingEvent: boolean, presentTerminal = true): SurvivalSnapshot {
    const snapshot = this.session.snapshot();
    this.syncVisualState(snapshot);
    this.world.setPhase?.(snapshot.state === 'nightEvent' ? 'night' : 'day');
    this.ui.render?.(snapshot, (action) => {
      if (action === 'repairItem') return this.repairItemReason(snapshot);
      return this.session.availableReason?.(
        action,
        action === 'repair' ? this.repairOption(snapshot) : undefined,
      ) ?? null;
    });
    this.syncCameraTurnControl(snapshot);
    this.syncJournalUnread(snapshot);
    this.syncPresentation(snapshot);
    if (presentTerminal) this.presentTerminalOnce(snapshot);
    if (openPendingEvent && !isTerminal(snapshot.state)) this.openPendingEvent(snapshot);
    return snapshot;
  }

  private syncVisualState(snapshot: Readonly<SurvivalSnapshot>): void {
    this.visualState.elapsedSeconds = this.elapsedSeconds;
    this.visualState.phase = snapshot.state === 'nightEvent' ? 'night' : 'day';
    this.visualState.weather = snapshot.weather;
  }

  private cameraTurnAvailable(snapshot: Readonly<SurvivalSnapshot>): boolean {
    const stableDayView = this.itemAnimationLab || (
      snapshot.pendingEventId === null
      && this.eventPresentation === 'idle'
    );
    return !this.busy
      && snapshot.state === 'day'
      && snapshot.chest.state !== 'none'
      && stableDayView
      && !this.fishingFlow.hasActiveAttempt()
      && this.forcedPresentationPhase !== 'night';
  }

  private syncCameraTurnControl(snapshot: Readonly<SurvivalSnapshot>): void {
    const available = this.cameraTurnAvailable(snapshot);
    if (!available && this.rearCameraView && !this.paused) {
      this.rearCameraView = false;
      this.world.setRearCameraView?.(false, true);
    }
    this.ui.setCameraTurnState?.(
      available && !this.paused,
      this.rearCameraView,
    );
  }

  private syncPresentation(snapshot: SurvivalSnapshot): void {
    const presentationSnapshot = this.deferredPresentationSync?.before ?? snapshot;
    if (presentationSnapshot !== this.presentedInventorySnapshot) {
      this.presentedInventorySnapshot = presentationSnapshot;
      this.world.syncInventory?.(presentationSnapshot);
    }
    this.ui.setAnchors?.(
      this.world.projectInteractionAnchors?.(this.viewportWidth, this.viewportHeight) ?? [],
    );
  }

  private beginDeferredPresentationSync(
    snapshot: SurvivalSnapshot,
    generation: number,
  ): void {
    if (!this.isContinuationActive(generation)) return;
    this.syncPresentation(snapshot);
    this.deferredPresentationSync = {
      generation,
      before: snapshot,
    };
  }

  private flushDeferredPresentationSync(
    snapshot: SurvivalSnapshot,
    generation: number,
  ): void {
    if (this.deferredPresentationSync?.generation !== generation) return;
    this.deferredPresentationSync = null;
    this.syncPresentation(snapshot);
  }

  private cancelDeferredPresentationSync(generation?: number): void {
    if (
      this.deferredPresentationSync === null
      || (
        generation !== undefined
        && this.deferredPresentationSync.generation !== generation
      )
    ) return;
    this.deferredPresentationSync = null;
  }

  private focusedEventResultError(
    eventId: string,
    choiceId: string,
    outcome: ActionOutcome,
  ): Error | null {
    const result = outcome.eventResult;
    if (result?.eventId === eventId && result.choiceId === choiceId) return null;
    const received = result === undefined
      ? 'missing'
      : `${result.eventId}/${result.choiceId}`;
    return new Error(
      `Focused event ${eventId} requires result ${eventId}/${choiceId}; `
      + `received ${received}.`,
    );
  }

  private async recoverInvalidFocusedEventResult(
    error: Error,
    eventState: SurvivalState,
    generation: number,
  ): Promise<void> {
    this.cancelDeferredPresentationSync(generation);
    if (!this.isContinuationActive(generation)) return;
    this.clearEventPresentation();
    this.onInvariantError(error);
    const resolved = this.session.snapshot();
    if (isTerminal(resolved.state)) {
      const snapshot = this.renderSnapshot(false, false);
      this.setBusy(false);
      this.presentTerminalOnce(snapshot);
      return;
    }

    await (this.ui.setSleepCovered?.(true) ?? Promise.resolve());
    if (!this.isContinuationActive(generation)) return;
    const snapshot = eventState === 'nightEvent'
      ? await this.runDawn(generation)
      : this.renderSnapshot(false, false);
    if (!this.isContinuationActive(generation)) return;
    if (!await this.renderAndSettleCoveredScene(generation)) return;
    await (this.ui.setSleepCovered?.(false) ?? Promise.resolve());
    if (!this.isContinuationActive(generation)) return;

    this.eventPresentation = 'idle';
    this.setBusy(false);
    this.presentTerminalOnce(snapshot);
    this.ui.restoreCommandFocus?.();
  }

  private openPendingEvent(snapshot: SurvivalSnapshot): void {
    if (
      snapshot.pendingEventId === null
      || isTerminal(snapshot.state)
      || this.eventPresentation !== 'idle'
    ) return;
    void this.runPendingEventReveal(snapshot, this.lifecycleGeneration);
  }

  private async runPendingEventReveal(
    snapshot: SurvivalSnapshot,
    generation: number,
    alreadyCovered = false,
  ): Promise<void> {
    if (snapshot.pendingEventId === null || isTerminal(snapshot.state)) return;
    const event = survivalEventById(snapshot.pendingEventId);
    if (event === undefined) return;
    if (!this.beginEventBundleLoad(event.id)) return;
    this.eventPresentation = 'transitioning';
    this.eventEligibility.clear();
    this.setBusy(true);
    if (!alreadyCovered) this.ui.beginEventPresentation?.();
    this.world.setEventSelectedItem?.(null);
    this.world.setEventEligibleItems?.(new Set());
    if (!alreadyCovered) {
      await (this.ui.setSleepCovered?.(true) ?? Promise.resolve());
      if (!this.isContinuationActive(generation)) return;
    }

    try {
      const activation = this.eventBundles.activate(event.id as SurvivalEventId);
      if (activation !== undefined) await activation;
    } catch (error) {
      this.onFatalError(error);
      return;
    }
    if (!this.isContinuationActive(generation)) return;
    if (event.id !== 'leak') this.audio.beginEvent(event.id);
    if (event.id !== 'bad-sleep') this.audio.eventReveal(event.id);

    const current = this.session.snapshot();
    if (current.pendingEventId !== event.id || isTerminal(current.state)) return;
    this.setAutomaticWeather(presentationWeatherForEvent(event.id));
    const variantSeed = deriveEventVariantSeed(current.seed, current.day, event.id);
    if (isEventPresentationRoute(event.id, 'dedicated')) {
      this.world.stageEvent?.({
        eventId: event.id,
        targetInstanceId: current.pendingEventTargetId,
        variantSeed,
      });
    } else {
      this.world.stageEvent?.(event.id, variantSeed);
    }
    this.eventPresentation = 'revealing';
    if (isEventPresentationRoute(event.id, 'dedicated')) {
      await (this.ui.showEventReveal?.(event) ?? Promise.resolve());
      if (!this.isContinuationActive(generation)) return;
    }
    if (!await this.renderAndSettleCoveredScene(generation)) return;
    await (this.ui.setSleepCovered?.(false) ?? Promise.resolve());
    if (!this.isContinuationActive(generation)) return;
    if (event.id === 'bad-sleep') {
      this.audio.eventReveal(event.id);
      this.ui.setBadSleepCue?.(true);
    }
    try {
      await (this.world.revealEvent?.(event.id) ?? Promise.resolve());
    } finally {
      if (event.id === 'bad-sleep') this.ui.setBadSleepCue?.(false);
    }
    if (!this.isContinuationActive(generation)) return;
    if (event.id === 'leak') this.audio.beginEvent(event.id);
    if (!isEventPresentationRoute(event.id, 'dedicated')) {
      await (this.ui.showEventReveal?.(event) ?? Promise.resolve());
      if (!this.isContinuationActive(generation)) return;
    }
    if (
      (this.visibilityPauseActive || this.documentIsHidden())
      && !await this.waitForVisibilityResume(generation)
    ) return;

    const revealed = this.session.snapshot();
    if (revealed.pendingEventId !== event.id || isTerminal(revealed.state)) return;
    this.eventEligibility = this.eventEligibilityFor(event, revealed);
    this.world.setEventEligibleItems?.(new Set(this.eventEligibility.keys()));
    this.syncPresentation(revealed);
    this.ui.setEventSelection?.(
      this.eventEligibility,
      isDriftingItemEventId(event.id)
        ? []
        : this.contextualChoicesFor(event, revealed),
    );
    this.eventPresentation = 'choosing';
    this.setBusy(false);
  }

  private eventEligibilityFor(
    event: NonNullable<ReturnType<typeof survivalEventById>>,
    snapshot: SurvivalSnapshot,
  ): Map<ItemInstanceId, EventResponseId> {
    const choiceByItem = new Map(
      event.choices
        .filter((choice) => choice.itemId !== undefined
          && (choice.requiredChestState === undefined || choice.requiredChestState === snapshot.chest.state))
        .map((choice) => [choice.itemId!, choice.id] as const),
    );
    const eligibility = new Map<ItemInstanceId, EventResponseId>();
    Object.values(snapshot.inventory).forEach((item) => {
      if (item?.condition !== 'usable') return;
      const choiceId = choiceByItem.get(item.type);
      if (choiceId !== undefined) eligibility.set(item.instanceId, choiceId);
    });
    return eligibility;
  }

  private contextualChoicesFor(
    event: NonNullable<ReturnType<typeof survivalEventById>>,
    snapshot: SurvivalSnapshot,
  ): EventContextChoice[] {
    return event.choices
      .filter((choice) => choice.itemId === undefined)
      .flatMap((choice): EventContextChoice[] => {
        const companionAvailability = choice.companionAction === undefined
          ? undefined
          : this.session.companionEventActionAvailability?.(choice.companionAction);
        if (choice.companionAction !== undefined && companionAvailability?.visible !== true) {
          return [];
        }
        const anchorId = this.contextualEventAnchorId(event.id, choice.id);
        const unmet = choice.requirements?.filter(
          ({ resource, minimum }) => snapshot[resource] < minimum,
        ) ?? [];
        const chestUnavailable = choice.requiredChestState !== undefined
          && choice.requiredChestState !== snapshot.chest.state;
        const unavailableReasons = [
          ...unmet.map(({ resource, minimum }) => (
            `Requires ${minimum} ${resource.replace(/([A-Z])/g, ' $1').toLocaleLowerCase('en-US')}; `
            + `you have ${snapshot[resource]}.`
          )),
          ...(chestUnavailable
            ? [`Requires a ${choice.requiredChestState} chest; you have ${snapshot.chest.state}.`]
            : []),
          ...(companionAvailability?.unavailableReason === null
            || companionAvailability?.unavailableReason === undefined
            ? []
            : [companionAvailability.unavailableReason]),
        ];
        return [{
          id: choice.id,
          label: choice.label,
          unavailableReason: unavailableReasons.length === 0 ? null : unavailableReasons.join(' '),
          ...(anchorId === null
            ? {}
            : { anchorId }),
          ...(isDriftingItemEventId(event.id)
            && choice.id === 'retrieve'
            ? {
                energyCost: choice.requirements?.find(
                  ({ resource }) => resource === 'energy',
                )?.minimum ?? 0,
                energyOwner: 'player' as const,
              }
            : {}),
          ...(choice.companionAction !== undefined && companionAvailability !== undefined
            ? {
                energyCost: companionAvailability.energyCost,
                energyOwner: 'carlitos' as const,
              }
            : {}),
        }];
      });
  }

  private contextualEventAnchorId(
    eventId: string,
    choiceId: string,
  ): string | null {
    if (choiceId === 'delegate-carlitos') return 'carlitos';
    if (isDriftingItemEventId(eventId)
      && choiceId === 'retrieve') {
      return `event:${eventId}`;
    }
    if (eventId === 'guarded-sleep' && choiceId === 'watch') return 'carlitos';
    if (eventId === 'midnight-tour' && choiceId === 'visit') return 'midnight-tour:island';
    if (eventId === 'handyman' && choiceId === 'touch') return 'handyman:hand';
    if (eventId === 'handyman' && choiceId === 'chest') return 'persistent-chest';
    if (eventId === 'flowers' && choiceId === 'sleep') return 'event:flowers';
    return null;
  }

  private restoreEventSelection(): void {
    const snapshot = this.session.snapshot();
    const event = snapshot.pendingEventId === null
      ? undefined
      : survivalEventById(snapshot.pendingEventId);
    this.ui.setEventSelection?.(
      this.eventEligibility,
      event === undefined ? [] : this.contextualChoicesFor(event, snapshot),
    );
  }

  private retainTerminalEventTableau(): void {
    this.cancelDeferredPresentationSync();
    this.eventEligibility.clear();
    this.eventPresentation = 'idle';
    this.world.setEventSelectedItem?.(null);
    this.world.setEventEligibleItems?.(null);
    this.ui.clearEventPresentation?.();
  }

  private clearEventPresentation(preserveDeferredPresentationSync = false): void {
    if (!preserveDeferredPresentationSync) this.cancelDeferredPresentationSync();
    this.driftingItemFlow.clear();
    this.audio.clearEvent();
    this.eventEligibility.clear();
    this.eventPresentation = 'idle';
    this.world.setEventSelectedItem?.(null);
    this.world.setEventEligibleItems?.(null);
    this.world.clearEvent?.();
    this.eventBundles.releaseActive();
    this.ui.clearEventPresentation?.();
    this.setAutomaticWeather(null);
  }

  private beginEventBundleLoad(eventId: string): boolean {
    try {
      const loading = this.eventBundles.beginLoad(eventId as SurvivalEventId);
      if (loading !== undefined) void loading.catch(() => undefined);
      return true;
    } catch (error) {
      this.onFatalError(error);
      return false;
    }
  }

  private setAutomaticWeather(id: PresentationWeatherId | null): void {
    this.automaticWeather = id;
    this.syncPresentationWeather();
  }

  private syncPresentationWeather(): void {
    const resolved = resolvePresentationWeather(this.automaticWeather, this.forcedWeather);
    if (resolved.id === this.effectivePresentationWeather) return;
    this.effectivePresentationWeather = resolved.id;
    this.world.setPresentationWeather?.(resolved.id);
    this.audio.setWeather(resolved.id);
  }

  private presentTerminalOnce(snapshot: SurvivalSnapshot, allowBusy = false): void {
    if (
      (this.busy && !allowBusy)
      || this.deferredPresentationSync !== null
      || !isTerminal(snapshot.state)
      || this.presentedTerminalState !== null
    ) return;
    this.presentedTerminalState = snapshot.state;
    this.audio.ending(snapshot.state);
    this.ui.showEnding?.(
      snapshot.state,
      snapshot.day,
      snapshot.seed,
      this.scavengeElapsedSeconds,
      snapshot.endingReason,
    );
  }

  private documentIsHidden(): boolean {
    return typeof document !== 'undefined' && document.hidden;
  }

  private readonly handleVisibilityChange = (): void => {
    const hidden = this.visibilityDocument?.hidden === true;
    if (hidden) {
      this.audio.cancelDive();
      if (!this.paused) {
        this.visibilityPauseActive = true;
        this.setPaused(true);
      }
    } else if (this.visibilityPauseActive) {
      this.setPaused(false);
    }
    this.world.setDocumentHidden?.(hidden);
    if (hidden) {
      this.fishingFlow.settleForVisibilityChange();
      this.driftingItemFlow.settleForVisibilityChange();
    }
  };

  private waitForVisibilityResume(generation: number): Promise<boolean> {
    if (!this.isContinuationActive(generation)) return Promise.resolve(false);
    if (!this.visibilityPauseActive && !this.documentIsHidden()) {
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      const resume = () => {
        this.visibilityResumeWaiters.delete(resume);
        resolve(
          this.isContinuationActive(generation)
          && !this.visibilityPauseActive
          && !this.documentIsHidden()
        );
      };
      this.visibilityResumeWaiters.add(resume);
    });
  }

  private releaseVisibilityResumeWaiters(): void {
    if (this.visibilityResumeWaiters.size === 0) return;
    const waiters = [...this.visibilityResumeWaiters];
    this.visibilityResumeWaiters.clear();
    for (const resume of waiters) resume();
  }
}
