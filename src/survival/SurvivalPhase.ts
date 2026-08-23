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
  DriftingItemFlow,
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
import {
  SurvivalEventFlow,
  type EventBundleManagerLike,
  type EventSessionPort,
  type EventUiPort,
  type EventWorldPort,
} from './SurvivalEventFlow';
import type {
  ActionOutcome,
  DayActionId,
  DayActionOption,
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

function createTestEventBundleManager(): EventBundleManagerLike {
  return {
    beginLoad: () => undefined,
    activate: () => undefined,
    releaseActive: () => undefined,
    dispose: () => undefined,
  };
}

const TERMINAL_STATES: readonly SurvivalState[] = ['rescued', 'dead', 'sunk'];

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
  private eventFlow!: SurvivalEventFlow;
  private itemAnimationLabEligibilityMap = new Map<ItemInstanceId, EventResponseId>();
  private itemAnimationLabUsing = false;
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
        initialEventResultId,
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
      initialEventResultId,
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
      void this.eventFlow.revealPending(snapshot);
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
    const presentationSnapshot = this.eventFlow.presentationSnapshot(snapshot);
    this.audio.update(deltaSeconds);
    this.syncVisualState(presentationSnapshot);
    this.eventFlow.sync(snapshot);
    if (this.started) this.fishingFlow.update(deltaSeconds);
    this.presentTerminalOnce(snapshot);
  }

  resize(width: number, height: number): void {
    if (this.disposed || width <= 0 || height <= 0) return;
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.context.camera.aspect = width / height;
    this.context.camera.updateProjectionMatrix();
    this.eventFlow.sync(this.session.snapshot());
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
      this.eventFlow.sync(this.session.snapshot());
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
    if (this.itemAnimationLab) {
      if (
        this.itemAnimationLabUsing
        || this.itemAnimationLabEligibilityMap.get(instanceId) !== choiceId
      ) return;
      void this.playItemAnimationLab(instanceId, this.lifecycleGeneration);
      return;
    }
    this.eventFlow.resolveItem(choiceId, instanceId);
  }

  handleEndure(): void {
    this.eventFlow.resolveEndure();
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
    this.eventFlow.clear();
    this.driftingItemFlow.dispose();
    this.audio.cancelDive();
    this.restartRequested = true;
    this.lifecycleGeneration += 1;
    this.releaseVisibilityResumeWaiters();
    this.onRestart();
  }

  dispose(): void {
    if (this.disposed) return;
    this.eventFlow.dispose();
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
    initialEventResultId?: string,
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
      setEventResolutionActive: (active) => this.eventFlow.setDriftingResolutionActive(active),
      isPendingEvent: (eventId) => this.eventFlow.isPendingEvent(eventId),
      resolveChoice: (choiceId) => this.eventFlow.resolveDriftingItemChoice(choiceId),
      waitForVisibilityResume: (generation) => this.waitForVisibilityResume(generation),
      captureLifecycleGeneration: () => this.lifecycleGeneration,
      isLifecycleGenerationCurrent: (generation) => this.isContinuationActive(generation),
    });
    this.eventFlow = new SurvivalEventFlow({
      session: session as EventSessionPort,
      world: world as EventWorldPort,
      ui: ui as EventUiPort,
      audio: this.audio,
      bundles: eventBundles,
      drifting: this.driftingItemFlow,
      renderSnapshot: () => this.renderSnapshot(false, false),
      renderAndSettleCoveredScene: (generation) => (
        this.renderAndSettleCoveredScene(generation)
      ),
      presentTerminal: (snapshot, allowBusy) => (
        this.presentTerminalOnce(snapshot, allowBusy)
      ),
      setBusy: (busy) => this.setBusy(busy),
      setAutomaticWeather: (eventId) => this.setAutomaticWeather(
        eventId === null ? null : presentationWeatherForEvent(eventId),
      ),
      isVisibilityBlocked: () => (
        this.visibilityPauseActive || this.documentIsHidden()
      ),
      waitForVisibilityResume: (generation) => this.waitForVisibilityResume(generation),
      getViewport: () => ({ width: this.viewportWidth, height: this.viewportHeight }),
      captureLifecycleGeneration: () => this.lifecycleGeneration,
      isLifecycleGenerationCurrent: (generation) => this.isContinuationActive(generation),
      onInvariantError: (error) => this.onInvariantError(error),
      onFatalError: (error) => this.onFatalError(error),
      initialEventResultId,
    });
    this.world.setEventCueHandler?.(({ eventId, cue }) => {
      if (eventId === 'midnight-tour') this.audio.midnightTourCue(cue);
    });
    this.world.setLightningStrikeListener?.(() => this.audio.thunder());
    this.wireUI();
  }

  private enterItemAnimationLab(snapshot: SurvivalSnapshot): void {
    this.itemAnimationLabEligibilityMap = this.itemAnimationLabEligibility(snapshot);
    this.itemAnimationLabUsing = false;
    this.ui.beginEventPresentation?.();
    this.ui.showItemAnimationLab?.();
    this.world.setEventSelectedItem?.(null);
    this.world.setEventEligibleItems?.(new Set(this.itemAnimationLabEligibilityMap.keys()));
    this.ui.setEventSelection?.(this.itemAnimationLabEligibilityMap);
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
      || this.itemAnimationLabUsing
      || !this.isContinuationActive(generation)
    ) return;

    const itemType = inventoryItem.type;
    const use = ITEM_ANIMATION_LAB_USES[itemType];
    if (use === undefined) return;
    this.itemAnimationLabUsing = true;
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
      this.world.setEventEligibleItems?.(new Set(this.itemAnimationLabEligibilityMap.keys()));
      this.ui.setEventSelection?.(this.itemAnimationLabEligibilityMap);
      this.itemAnimationLabUsing = false;
      this.setBusy(false);
    }
  }

  private async playRepairToolboxLab(generation: number): Promise<void> {
    if (
      this.itemAnimationLabUsing
      || !this.isContinuationActive(generation)
    ) return;
    this.itemAnimationLabUsing = true;
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
      this.world.setEventEligibleItems?.(new Set(this.itemAnimationLabEligibilityMap.keys()));
      this.ui.setEventSelection?.(this.itemAnimationLabEligibilityMap);
      this.itemAnimationLabUsing = false;
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
    this.ui.onEventChoice = (choiceId) => this.eventFlow.resolveContextual(choiceId);
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
      void this.eventFlow.focusDriftingItem(eventId);
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
    this.eventFlow.beginDeferredSync(beforeAction, generation);
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
    this.eventFlow.cancelDeferredSync(generation);
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
    if (!this.eventFlow.beginNightTransition(this.session.snapshot(), opensEvent)) return;
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
      snapshot = await this.eventFlow.beginDawn();
      if (!this.isContinuationActive(generation)) return;
      if (snapshot.state === 'dayEvent' && snapshot.pendingEventId !== null) {
        this.ui.beginEventPresentation?.();
        await this.eventFlow.revealPending(snapshot, true);
        return;
      }
      if (!await this.renderAndSettleCoveredScene(generation)) return;
      await (this.ui.setSleepCovered?.(false) ?? Promise.resolve());
      if (!this.isContinuationActive(generation)) return;
      this.eventFlow.finishQuietNight();
      this.presentTerminalOnce(snapshot);
      this.ui.restoreCommandFocus?.();
      return;
    }

    await this.eventFlow.revealPending(snapshot, true);
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
    this.eventFlow.sync(snapshot);
    if (presentTerminal) this.presentTerminalOnce(snapshot);
    if (openPendingEvent && !isTerminal(snapshot.state)) {
      void this.eventFlow.revealPending(snapshot);
    }
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
      && this.eventFlow.isIdle()
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
      || this.eventFlow.hasDeferredSync()
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
      this.eventFlow.settleForVisibilityChange();
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
