import { PerspectiveCamera } from 'three';
import type { PhaseContext, GamePhase } from '../app/GamePhase';
import { AudioSystem } from '../audio/AudioSystem';
import { SurvivalAudio } from '../audio/SurvivalAudio';
import type { SurvivalEndingId } from '../game/ending';
import {
  type ItemInstance,
  type ItemInstanceId,
} from '../game/ItemState';
import type { SceneRenderer, SurvivalVisualState } from '../rendering/SceneRenderer';
import {
  createVisualQualityPreference,
  type VisualQuality,
} from '../rendering/visualQuality';
import {
  createWaterQualityPreference,
  type WaterQuality,
} from '../rendering/waterQuality';
import type { PhysicsRuntime } from '../physics/PhysicsRuntime';
import { SurvivalUI } from '../ui/SurvivalUI';
import type { PropModelLibrary } from '../world/PropModelLibrary';
import type { ShipFurnitureLibrary } from '../world/ShipFurnitureLibrary';
import type { SkyAssets } from '../world/SkyAssets';
import type { LifeboatAssets } from '../world/LifeboatAssets';
import type { ShipAssets } from '../world/ShipAssets';
import { runCleanupSteps } from '../world/SceneResources';
import type { SkyPhase } from '../world/skyPalette';
import {
  presentationWeatherForEvent,
  resolvePresentationWeather,
  type PresentationWeatherId,
} from '../weather/presentationWeather';
import { BoatWorld } from './BoatWorld';
import {
  ITEM_ANIMATION_LAB_INITIAL_CHEST,
  ITEM_ANIMATION_LAB_INITIAL_RESOURCES,
  isItemAnimationLabId,
} from './ItemAnimationLab';
import {
  ItemAnimationLabFlow,
  type ItemAnimationLabBundlePort,
  type ItemAnimationLabSessionPort,
  type ItemAnimationLabUiPort,
  type ItemAnimationLabWorldPort,
} from './ItemAnimationLabFlow';
import { ItemAnimationLabCameraControls } from './ItemAnimationLabCameraControls';
import {
  FocusedEventFlow,
  type FocusedEventUiPort,
  type FocusedEventWorldPort,
} from './FocusedEventFlow';
import {
  SurvivalFishingFlow,
  type FishingSessionPort,
  type FishingUiPort,
  type FishingWorldPort,
} from './SurvivalFishingFlow';
import {
  SurvivalDayActionFlow,
  type DayActionEventPort,
  type DayActionSessionPort,
  type DayActionUiPort,
  type DayActionWorldPort,
} from './SurvivalDayActionFlow';
import { SurvivalSession } from './SurvivalSession';
import { EventBundleLoader } from './EventBundle';
import { EventBundleManager } from './EventBundleManager';
import { isInspectableEventId } from './eventCatalog';
import {
  SurvivalEventFlow,
  type EventBundleManagerLike,
  type EventSessionPort,
  type EventUiPort,
  type EventWorldPort,
} from './SurvivalEventFlow';
import { SurvivalVisibilityController } from './SurvivalVisibilityController';
import type {
  DayActionId,
  DayActionOption,
  EventResponseId,
  SurvivalState,
} from './survivalTypes';
import type { SurvivalSnapshot } from './survivalSnapshot';
import type { SurvivalRunCheckpoint } from './SurvivalCheckpoint';

export type SurvivalPhaseStart =
  | {
      readonly kind: 'fresh';
      readonly savedItems: readonly ItemInstance[];
      readonly seed: number;
      readonly scavengeElapsedSeconds: number;
      readonly initialEventId?: string;
      readonly initialEventResultId?: string;
    }
  | {
      readonly kind: 'ending-preview';
      readonly endingId: SurvivalEndingId;
      readonly savedItems: readonly ItemInstance[];
      readonly seed: number;
      readonly scavengeElapsedSeconds: number;
    }
  | {
      readonly kind: 'restored';
      readonly checkpoint: SurvivalRunCheckpoint;
    };

export type SurvivalCheckpointChange = (
  checkpoint: SurvivalRunCheckpoint | null,
) => void;

export interface SurvivalPhaseTestDependencies {
  session?: Partial<SurvivalSession> & Pick<SurvivalSession, 'snapshot'>;
  world: Partial<Omit<BoatWorld, 'stageEvent'>> & {
    stageEvent?: (...args: any[]) => void;
  };
  ui: Partial<SurvivalUI>;
  audio?: AudioSystem;
  onRestart?: () => void;
  onReturnToMenu?: () => void;
  onInvariantError?: (error: Error) => void;
  onFatalError?: (error: unknown) => void;
  eventBundles?: SurvivalPhaseBundleManager;
  sceneRenderer?: SceneRenderer;
  onCheckpointChange?: SurvivalCheckpointChange;
  scavengeElapsedSeconds?: number;
}

type SurvivalPhaseBundleManager = EventBundleManagerLike
  & ItemAnimationLabBundlePort
  & Pick<EventBundleManager, 'dispose'>;

function createTestEventBundleManager(): SurvivalPhaseBundleManager {
  return {
    beginLoad: () => undefined,
    activate: () => undefined,
    cancelPendingActivation: () => undefined,
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

function createSession(
  start: SurvivalPhaseStart,
  itemAnimationLab: boolean,
  initialEventId: string | undefined,
): SurvivalSession {
  if (start.kind === 'restored') return SurvivalSession.restore(start.checkpoint.session);
  if (start.kind === 'ending-preview') {
    return SurvivalSession.createEndingPreview(start.savedItems, start.seed, start.endingId);
  }
  return new SurvivalSession(start.savedItems, {
    seed: start.seed,
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
  private onReturnToMenu!: () => void;
  private onCheckpointChange!: SurvivalCheckpointChange;
  private checkpointingEnabled = false;
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
  private transitionRequested = false;
  private presentedTerminalState: SurvivalState | null = null;
  private terminalCheckpointCleared = false;
  private lastReadJournalDay = 0;
  private viewportWidth = 1;
  private viewportHeight = 1;
  private fishingFlow!: SurvivalFishingFlow;
  private dayActionFlow!: SurvivalDayActionFlow;
  private focusedEventFlow!: FocusedEventFlow;
  private eventFlow!: SurvivalEventFlow;
  private itemAnimationLabFlow!: ItemAnimationLabFlow;
  private visibilityController: SurvivalVisibilityController | null = null;
  private automaticWeather: PresentationWeatherId | null = null;
  private forcedWeather: PresentationWeatherId | null = null;
  private forcedPresentationPhase: SkyPhase | null = null;
  private effectivePresentationWeather: PresentationWeatherId = 'calm';
  private lifecycleGeneration = 0;
  private audio!: SurvivalAudio;
  private onInvariantError: (error: Error) => void = reportInvariantError;
  private onFatalError: (error: unknown) => void = (error) => reportInvariantError(
    error instanceof Error ? error : new Error(String(error)),
  );
  private eventBundles!: SurvivalPhaseBundleManager;
  private itemAnimationLab = false;
  private itemAnimationLabCameraControls: ItemAnimationLabCameraControls | null = null;
  private rearCameraView = false;

  constructor(
    context: PhaseContext,
    start: SurvivalPhaseStart,
    onRestart: () => void,
    onCheckpointChange: SurvivalCheckpointChange,
    onReturnToMenu: () => void,
  );
  constructor(
    context: PhaseContext,
    start: SurvivalPhaseStart,
    onRestart: () => void,
    onCheckpointChange: SurvivalCheckpointChange,
    onReturnToMenu: () => void,
    testDependencies?: SurvivalPhaseTestDependencies,
  ) {
    const initialEventId = start.kind === 'fresh' ? start.initialEventId : undefined;
    const initialEventResultId = start.kind === 'fresh'
      ? start.initialEventResultId
      : undefined;
    const itemAnimationLab = isItemAnimationLabId(initialEventId);
    if (testDependencies === undefined) {
      const session = createSession(start, itemAnimationLab, initialEventId);
      this.initializeProduction(
        context,
        session,
        start,
        onRestart,
        onCheckpointChange,
        onReturnToMenu,
        itemAnimationLab,
        initialEventResultId,
      );
      return;
    }
    const session = testDependencies.session
      ?? createSession(start, itemAnimationLab, initialEventId);
    this.initializeTest(
      context,
      session,
      start,
      onRestart,
      onCheckpointChange,
      onReturnToMenu,
      itemAnimationLab,
      initialEventResultId,
      testDependencies,
    );
  }

  private initializeProduction(
    context: PhaseContext,
    session: SurvivalSession,
    start: SurvivalPhaseStart,
    onRestart: () => void,
    onCheckpointChange: SurvivalCheckpointChange,
    onReturnToMenu: () => void,
    itemAnimationLab: boolean,
    initialEventResultId: string | undefined,
  ): void {
    const world = new BoatWorld(
      context.camera,
      context.propModels,
      context.skyAssets.moonTexture,
      session.snapshot().savedItems,
      context.lifeboatAssets,
      context.shipFurniture,
      context.waterQuality?.get() ?? 'low',
      undefined,
      undefined,
      {},
      context.visualQuality.get(),
    );
    this.initialize(
      context,
      session,
      world,
      new SurvivalUI(context.mount),
      start.kind === 'restored'
        ? start.checkpoint.scavengeElapsedSeconds
        : start.scavengeElapsedSeconds,
      onRestart,
      onReturnToMenu,
      start.kind === 'ending-preview' ? undefined : onCheckpointChange,
      reportInvariantError,
      itemAnimationLab,
      new EventBundleManager(new EventBundleLoader({ audio: context.audio, host: world })),
      context.onFatalError,
      initialEventResultId,
    );
  }

  private initializeTest(
    context: PhaseContext,
    session: Partial<SurvivalSession> & Pick<SurvivalSession, 'snapshot'>,
    start: SurvivalPhaseStart,
    onRestart: () => void,
    onCheckpointChange: SurvivalCheckpointChange,
    onReturnToMenu: () => void,
    itemAnimationLab: boolean,
    initialEventResultId: string | undefined,
    dependencies: SurvivalPhaseTestDependencies,
  ): void {
    const scavengeElapsedSeconds = dependencies.scavengeElapsedSeconds ?? (
      start.kind === 'restored'
        ? start.checkpoint.scavengeElapsedSeconds
        : start.scavengeElapsedSeconds
    );
    this.initialize(
      context,
      session,
      dependencies.world,
      dependencies.ui,
      scavengeElapsedSeconds,
      dependencies.onRestart ?? onRestart,
      dependencies.onReturnToMenu ?? onReturnToMenu,
      start.kind === 'ending-preview'
        ? undefined
        : dependencies.onCheckpointChange ?? onCheckpointChange,
      dependencies.onInvariantError,
      itemAnimationLab,
      dependencies.eventBundles ?? createTestEventBundleManager(),
      dependencies.onFatalError ?? context.onFatalError,
      initialEventResultId,
    );
  }

  static forTest(
    dependencies: SurvivalPhaseTestDependencies,
    initialEventId?: string,
    initialEventResultId?: string,
  ): SurvivalPhase {
    return SurvivalPhase.forTestStart(dependencies, {
      kind: 'fresh',
      savedItems: [],
      seed: 0,
      scavengeElapsedSeconds: dependencies.scavengeElapsedSeconds ?? 0,
      ...(initialEventId === undefined ? {} : { initialEventId }),
      ...(initialEventResultId === undefined ? {} : { initialEventResultId }),
    });
  }

  static forTestStart(
    dependencies: SurvivalPhaseTestDependencies,
    start: SurvivalPhaseStart,
  ): SurvivalPhase {
    const TestConstructor = SurvivalPhase as unknown as new (
      context: PhaseContext,
      start: SurvivalPhaseStart,
      onRestart: () => void,
      onCheckpointChange: SurvivalCheckpointChange | undefined,
      onReturnToMenu: () => void,
      dependencies: SurvivalPhaseTestDependencies,
    ) => SurvivalPhase;
    return new TestConstructor(
      testContext(dependencies.sceneRenderer, dependencies.audio),
      start,
      dependencies.onRestart ?? (() => undefined),
      dependencies.onCheckpointChange,
      dependencies.onReturnToMenu ?? (() => undefined),
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
      this.itemAnimationLabFlow.enter(snapshot);
      if (typeof this.context.mount.addEventListener === 'function') {
        this.itemAnimationLabCameraControls = new ItemAnimationLabCameraControls(
          this.context.mount,
          (yaw, pitch) => this.world.setItemAnimationLabCameraLook?.(yaw, pitch),
        );
      }
    } else if (snapshot.pendingEventId !== null && !isTerminal(snapshot.state)) {
      void this.eventFlow.revealPending(snapshot);
    } else if (!isTerminal(snapshot.state)) {
      this.emitStableCheckpoint();
    }

    if (typeof document !== 'undefined') {
      this.visibilityController = new SurvivalVisibilityController(
        document,
        this.handleDocumentHidden,
        this.handleDocumentVisible,
        () => !this.paused,
      );
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
    if (this.started) this.fishingFlow.update(deltaSeconds);
    if (this.started) this.eventFlow.update(deltaSeconds);
    const snapshot = this.session.snapshot();
    this.syncCameraTurnControl(snapshot);
    const presentationSnapshot = this.eventFlow.presentationSnapshot(snapshot);
    this.audio.update(deltaSeconds);
    this.syncVisualState(presentationSnapshot);
    this.eventFlow.sync(snapshot);
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
    this.focusedEventFlow.syncTarget(width, height);
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
    if (action === 'fish') {
      void this.fishingFlow.begin();
      return;
    }
    void this.dayActionFlow.run(action, option);
  }

  handleEventItem(choiceId: EventResponseId, instanceId: ItemInstanceId): void {
    if (this.itemAnimationLab) {
      void this.itemAnimationLabFlow.play(instanceId, choiceId);
      return;
    }
    if (isInspectableEventId(this.session.snapshot().pendingEventId ?? '')) {
      void this.focusedEventFlow.choose({ id: choiceId, instanceId });
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
    this.itemAnimationLabCameraControls?.setEnabled(!paused);
    this.syncCameraTurnControl(this.session.snapshot());
    if (!paused) this.visibilityController?.releaseResumeWaiters();
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

  setVisualQuality(value: VisualQuality): void {
    if (this.disposed) return;
    this.world.setVisualQuality?.(value);
  }

  setVolumetricCloudsEnabled(enabled: boolean): void {
    if (this.disposed) return;
    this.world.setVolumetricCloudsEnabled?.(enabled);
  }

  getVolumetricCloudsAvailable(): boolean {
    return !this.disposed && (this.world.volumetricCloudsAvailable?.() ?? false);
  }

  getPresentationWeather(): PresentationWeatherId {
    return this.effectivePresentationWeather;
  }

  getPresentationPhase(): SkyPhase {
    return this.forcedPresentationPhase ?? this.visualState.phase;
  }

  getSurvivalCheckpoint(): SurvivalRunCheckpoint | null {
    const snapshot = this.session.snapshot();
    const stablePresentation = snapshot.pendingEventId === null
      ? this.eventFlow.isIdle()
      : this.eventFlow.isStableChoice();
    if (
      this.disposed
      || this.busy
      || this.itemAnimationLab
      || isTerminal(snapshot.state)
      || !stablePresentation
      || this.fishingFlow.hasActiveAttempt()
      || this.session.exportCheckpoint === undefined
    ) return null;
    try {
      return Object.freeze({
        scavengeElapsedSeconds: this.scavengeElapsedSeconds,
        session: this.session.exportCheckpoint(),
      });
    } catch {
      return null;
    }
  }

  requestRestart(): void {
    this.requestTransition(this.onRestart);
  }

  requestReturnToMenu(): void {
    this.requestTransition(this.onReturnToMenu);
  }

  private requestTransition(complete: () => void): void {
    if (this.disposed || this.transitionRequested) return;
    this.transitionRequested = true;
    this.lifecycleGeneration += 1;
    runCleanupSteps([
      () => this.itemAnimationLabFlow.dispose(),
      () => this.eventFlow.clear(),
      () => this.focusedEventFlow.dispose(),
      () => this.dayActionFlow.settleForVisibilityChange(),
      () => this.dayActionFlow.dispose(),
      () => this.visibilityController?.cancelResumeWaiters(),
      complete,
    ]);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.lifecycleGeneration += 1;
    runCleanupSteps([
      () => this.itemAnimationLabFlow.dispose(),
      () => this.eventFlow.dispose(),
      () => this.focusedEventFlow.dispose(),
      () => this.dayActionFlow.dispose(),
      () => this.visibilityController?.cancelResumeWaiters(),
      () => this.fishingFlow.dispose(),
      () => { this.ui.onFishingResultContinue = null; },
      () => { this.ui.onFishingViewExit = null; },
      () => { this.ui.onFocusedEventSelect = null; },
      () => { this.ui.onFocusedEventChoice = null; },
      () => { this.ui.onFocusedEventBack = null; },
      () => this.itemAnimationLabCameraControls?.dispose(),
      () => { this.itemAnimationLabCameraControls = null; },
      () => this.visibilityController?.dispose(),
      () => { this.visibilityController = null; },
      () => this.eventBundles.dispose(),
      () => this.audio.dispose(),
      () => this.world.dispose?.(),
      () => this.ui.dispose?.(),
    ]);
  }

  private initialize(
    context: PhaseContext,
    session: Partial<SurvivalSession> & Pick<SurvivalSession, 'snapshot'>,
    world: SurvivalPhaseTestDependencies['world'],
    ui: Partial<SurvivalUI>,
    scavengeElapsedSeconds: number,
    onRestart: () => void,
    onReturnToMenu: () => void,
    onCheckpointChange: SurvivalCheckpointChange | undefined,
    onInvariantError: (error: Error) => void = reportInvariantError,
    itemAnimationLab = false,
    eventBundles: SurvivalPhaseBundleManager = createTestEventBundleManager(),
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
    this.onReturnToMenu = onReturnToMenu;
    this.checkpointingEnabled = onCheckpointChange !== undefined;
    this.onCheckpointChange = onCheckpointChange ?? (() => undefined);
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
    this.focusedEventFlow = new FocusedEventFlow({
      world: world as FocusedEventWorldPort,
      ui: ui as FocusedEventUiPort,
      audio: this.audio,
      setBusy: (busy) => this.setBusy(busy),
      setEventResolutionActive: (active) => this.eventFlow.setFocusedResolutionActive(active),
      isPendingEvent: (eventId) => this.eventFlow.isPendingEvent(eventId),
      resolveChoice: (choice) => this.eventFlow.resolveFocusedEventChoice(choice),
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
      focused: this.focusedEventFlow,
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
      getViewportWidth: () => this.viewportWidth,
      getViewportHeight: () => this.viewportHeight,
      captureLifecycleGeneration: () => this.lifecycleGeneration,
      isLifecycleGenerationCurrent: (generation) => this.isContinuationActive(generation),
      onInvariantError: (error) => this.onInvariantError(error),
      onFatalError: (error) => this.onFatalError(error),
      onDawnSnapshot: (snapshot, generation) => this.beginRadioSignal(snapshot, generation),
      initialEventResultId,
    });
    this.dayActionFlow = new SurvivalDayActionFlow({
      session: session as DayActionSessionPort,
      world: world as DayActionWorldPort,
      ui: ui as DayActionUiPort,
      audio: this.audio,
      events: this.eventFlow as DayActionEventPort,
      renderSnapshot: () => this.renderSnapshot(false, false),
      renderAndSettleCoveredScene: (generation) => (
        this.renderAndSettleCoveredScene(generation)
      ),
      presentTerminal: (snapshot) => this.presentTerminalOnce(snapshot),
      setBusy: (busy) => this.setBusy(busy),
      waitForVisibilityResume: (generation) => this.waitForVisibilityResume(generation),
      captureLifecycleGeneration: () => this.lifecycleGeneration,
      advanceLifecycleGeneration: () => ++this.lifecycleGeneration,
      isLifecycleGenerationCurrent: (generation) => this.isContinuationActive(generation),
      onInvariantError: (error) => this.onInvariantError(error),
      onFatalError: (error) => this.onFatalError(error),
    });
    this.itemAnimationLabFlow = new ItemAnimationLabFlow({
      session: session as ItemAnimationLabSessionPort,
      world: world as ItemAnimationLabWorldPort,
      ui: ui as ItemAnimationLabUiPort,
      audio: this.audio,
      bundles: eventBundles,
      setBusy: (busy) => this.setBusy(busy),
      renderSnapshot: () => this.renderSnapshot(false, false),
      playFishing: () => this.fishingFlow.begin(),
      setAutomaticWeather: (eventId) => this.setAutomaticWeather(
        eventId === null ? null : presentationWeatherForEvent(eventId),
      ),
      captureLifecycleGeneration: () => this.lifecycleGeneration,
      isLifecycleGenerationCurrent: (generation) => this.isContinuationActive(generation),
      onInvariantError: (error) => this.onInvariantError(error),
      onFatalError: (error) => this.onFatalError(error),
    });
    this.world.setEventCueHandler?.(({ eventId, cue }) => {
      if (eventId === 'midnight-tour') this.audio.midnightTourCue(cue);
      else if (eventId === 'chest-attack') this.audio.chestAttackCue(cue);
      else this.audio.checkBackCue(cue);
    });
    this.world.setLightningStrikeListener?.(() => this.audio.thunder());
    this.wireUI();
  }

  private wireUI(): void {
    this.ui.onAction = (action, option) => this.handleAction(action, option);
    this.ui.onEventItem = (choiceId, instanceId) => this.handleEventItem(choiceId, instanceId);
    this.ui.onEventChoice = (choiceId) => {
      if (this.itemAnimationLab) this.itemAnimationLabFlow.choose(choiceId);
      else this.eventFlow.resolveContextual(choiceId);
    };
    this.ui.onRestart = () => this.requestRestart();
    this.ui.onReturnToMenu = () => this.requestReturnToMenu();
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
    this.ui.onFocusedEventSelect = (eventId) => { void this.eventFlow.focusEvent(eventId); };
    this.ui.onFocusedEventChoice = (choice) => {
      this.reportFocusedError(this.focusedEventFlow.choose(choice));
    };
    this.ui.onFocusedEventBack = () => {
      this.reportFocusedError(this.focusedEventFlow.back());
    };
    this.ui.onCameraTurn = () => this.handleCameraTurn();
  }

  private reportFocusedError(work: Promise<void>): void {
    void work.catch((error) => {
      try {
        this.onFatalError(error);
      } catch {
        // The focused action error stays primary.
      }
    });
  }

  private canAcceptCommand(): boolean {
    if (
      this.disposed
      || this.transitionRequested
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
    if (!busy) this.emitStableCheckpoint();
  }

  private emitStableCheckpoint(): void {
    if (!this.checkpointingEnabled) return;
    const snapshot = this.session.snapshot();
    if (isTerminal(snapshot.state)) {
      this.clearTerminalCheckpoint();
      return;
    }
    const checkpoint = this.getSurvivalCheckpoint();
    if (checkpoint !== null) this.onCheckpointChange(checkpoint);
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
      && !this.transitionRequested
      && (generation === undefined || generation === this.lifecycleGeneration);
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
    this.ui.render?.(snapshot, (action) => (
      this.dayActionFlow.unavailableReason(snapshot, action)
    ));
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
    this.clearTerminalCheckpoint();
    if (snapshot.ending !== null && snapshot.ending.id !== 'dorothy') {
      this.audio.ending(snapshot.ending.id);
      this.ui.showEnding?.(snapshot.ending);
    }
  }

  private beginRadioSignal(snapshot: SurvivalSnapshot, generation: number): void {
    if (!snapshot.radioSignalAvailable) return;
    const started = this.audio.beginRadioSignal(() => {
      if (!this.isContinuationActive(generation)) return;
      if (this.session.expireRadioSignal?.() !== true) return;
      this.renderSnapshot(false, false);
    });
    if (started) return;
    if (this.session.expireRadioSignal?.() === true) this.renderSnapshot(false, false);
  }

  private clearTerminalCheckpoint(): void {
    if (!this.checkpointingEnabled || this.terminalCheckpointCleared) return;
    this.terminalCheckpointCleared = true;
    this.onCheckpointChange(null);
  }

  private documentIsHidden(): boolean {
    return this.visibilityController?.isHidden()
      ?? (typeof document !== 'undefined' && document.hidden);
  }

  private readonly handleDocumentHidden = (): void => {
    runCleanupSteps([
      () => this.dayActionFlow.settleForVisibilityChange(),
      () => this.ui.settleForVisibilityChange?.(),
      () => {
        if (this.paused) return;
        this.visibilityPauseActive = true;
        this.setPaused(true);
      },
      () => this.world.setDocumentHidden?.(true),
      () => this.fishingFlow.settleForVisibilityChange(),
      () => this.eventFlow.settleForVisibilityChange(),
      () => this.itemAnimationLabFlow.settleForVisibilityChange(),
    ]);
  };

  private readonly handleDocumentVisible = (): void => {
    if (this.visibilityPauseActive) this.setPaused(false);
    this.world.setDocumentHidden?.(false);
  };

  private waitForVisibilityResume(generation: number): Promise<boolean> {
    if (!this.isContinuationActive(generation)) return Promise.resolve(false);
    if (this.visibilityController === null) {
      return Promise.resolve(!this.documentIsHidden());
    }
    return this.visibilityController.waitForResume(
      () => this.isContinuationActive(generation),
    );
  }
}
