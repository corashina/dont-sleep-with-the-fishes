import { PerspectiveCamera } from 'three';
import type { PhaseContext, GamePhase } from '../app/GamePhase';
import {
  ITEM_DEFINITIONS,
  type ItemInstance,
  type ItemInstanceId,
} from '../game/ItemState';
import type { SceneRenderer, SurvivalVisualState } from '../rendering/SceneRenderer';
import { createVisualQualityPreference } from '../rendering/visualQuality';
import type { PhysicsRuntime } from '../physics/PhysicsRuntime';
import {
  SurvivalUI,
  type DriftingLootResultView,
  type EventContextChoice,
  type FishingResultView,
} from '../ui/SurvivalUI';
import type { PropModelLibrary } from '../world/PropModelLibrary';
import type { ShipFurnitureLibrary } from '../world/ShipFurnitureLibrary';
import type { SkyAssets } from '../world/SkyAssets';
import type { LifeboatAssets } from '../world/LifeboatAssets';
import type { ShipAssets } from '../world/ShipAssets';
import {
  presentationWeatherForEvent,
  resolvePresentationWeather,
  type PresentationWeatherId,
} from '../weather/presentationWeather';
import { BoatWorld } from './BoatWorld';
import { survivalEventById } from './events';
import { fishingCatchFood } from './fishingCatalog';
import type {
  FishingCastPoint,
  FishingSession,
  FishingTerminalResult,
} from './FishingSession';
import { SurvivalSession } from './SurvivalSession';
import type {
  ActionOutcome,
  DayActionId,
  DayActionOption,
  DriftingLootVariant,
  EventResponse,
  EventResponseId,
  RewardSummary,
  SurvivalSnapshot,
  SurvivalState,
} from './survivalTypes';
import type { EventPhysicalResponsePresentation } from './WeatherEventAnimator';

export interface SurvivalPhaseTestDependencies {
  session: Partial<SurvivalSession> & Pick<SurvivalSession, 'snapshot'>;
  world: Partial<BoatWorld>;
  ui: Partial<SurvivalUI>;
  onRestart?: () => void;
  sceneRenderer?: SceneRenderer;
}

const TERMINAL_STATES: readonly SurvivalState[] = ['rescued', 'dead', 'sunk'];

type FishingPresentationState =
  | 'idle'
  | 'ready'
  | 'entering'
  | 'aiming'
  | 'casting'
  | 'waiting'
  | 'bite'
  | 'settling'
  | 'result'
  | 'returning';

type EventPresentationState =
  | 'idle'
  | 'sleeping'
  | 'transitioning'
  | 'revealing'
  | 'choosing'
  | 'using'
  | 'resolving'
  | 'retrieving'
  | 'result'
  | 'receding';

function isTerminal(state: SurvivalState): state is 'rescued' | 'dead' | 'sunk' {
  return TERMINAL_STATES.includes(state);
}

function isDriftingLootVariant(value: unknown): value is DriftingLootVariant {
  return value === 'barrel' || value === 'crate';
}

export function formatFishingResult(
  result: FishingTerminalResult,
  outcome: ActionOutcome,
): FishingResultView {
  if (result.kind === 'miss') {
    return {
      caption: 'EMPTY HOOK',
      title: 'IT GOT AWAY',
      detail: 'NO CATCH',
      catchTarget: null,
    };
  }
  if (result.catch.kind === 'junk') {
    return {
      caption: 'DRIFTING JUNK',
      title: result.catch.label.toLocaleUpperCase('en-US'),
      detail: 'NO FOOD',
      catchTarget: null,
    };
  }
  if (result.catch.kind === 'utility') {
    const reward = result.catch.reward;
    const detail = reward.kind === 'bait'
      ? 'BAIT +1'
      : reward.kind === 'item' && reward.condition === 'broken'
        ? 'BROKEN — REPAIR WITH DUCT TAPE'
        : reward.kind === 'item' && reward.itemId === 'ductTape'
          ? 'DUCT TAPE RECOVERED'
          : 'ENERGY BAR RECOVERED';
    return {
      caption: 'UTILITY SALVAGE',
      title: result.catch.label.toLocaleUpperCase('en-US'),
      detail,
      catchTarget: null,
    };
  }
  const bait = outcome.deltas.bait === -1 ? ' - 1 BAIT USED' : '';
  return {
    caption: `${result.catch.size.toLocaleUpperCase('en-US')} CATCH`,
    title: result.catch.label.toLocaleUpperCase('en-US'),
    detail: `+${fishingCatchFood(result.catch)} FOOD${bait}`,
    catchTarget: null,
  };
}

export function formatDriftingLootResult(
  reward: RewardSummary,
): DriftingLootResultView {
  const title = reward.kind === 'item'
    ? 'ENERGY BAR'
    : `+${reward.quantity} ${
      reward.id === 'repairMaterial'
        ? 'REPAIR MATERIAL'
        : reward.id.toLocaleUpperCase('en-US')
    }`;
  return {
    caption: 'SALVAGE RECOVERED',
    title,
    detail: '−3 ENERGY',
    target: null,
  };
}

function testContext(
  sceneRenderer: SceneRenderer = {
    render: () => undefined,
    resize: () => undefined,
    dispose: () => undefined,
  },
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
    camera: new PerspectiveCamera(),
    propModels: {} as PropModelLibrary,
    shipFurniture: {} as ShipFurnitureLibrary,
    maxTextureAnisotropy: 1,
    skyAssets: {} as SkyAssets,
    lifeboatAssets: {} as LifeboatAssets,
    shipAssets: {} as ShipAssets,
    physicsRuntime: {} as PhysicsRuntime,
    physicsMode: 'enabled',
  };
}

export class SurvivalPhase implements GamePhase {
  private context!: PhaseContext;
  private session!: Partial<SurvivalSession> & Pick<SurvivalSession, 'snapshot'>;
  private world!: Partial<BoatWorld>;
  private ui!: Partial<SurvivalUI>;
  private onRestart!: () => void;
  private scavengeElapsedSeconds = 0;
  private elapsedSeconds = 0;
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
  private lastReadJournalDay = 0;
  private pendingDayEventDay: number | null = null;
  private readonly requestedDayEventDays = new Set<number>();
  private visibilityDocument: Document | null = null;
  private viewportWidth = 1;
  private viewportHeight = 1;
  private activeFishing: FishingSession | null = null;
  private fishingPresentation: FishingPresentationState = 'idle';
  private fishingSettlementInProgress = false;
  private eventPresentation: EventPresentationState = 'idle';
  private activeDriftingLootVariant: DriftingLootVariant | null = null;
  private eventEligibility = new Map<ItemInstanceId, EventResponseId>();
  private automaticWeather: PresentationWeatherId | null = null;
  private forcedWeather: PresentationWeatherId | null = null;
  private effectivePresentationWeather: PresentationWeatherId = 'calm';
  private lifecycleGeneration = 0;
  private readonly visibilityResumeWaiters = new Set<() => void>();

  constructor(
    context: PhaseContext,
    savedItems: readonly ItemInstance[],
    seed: number,
    scavengeElapsedSeconds: number,
    onRestart: () => void,
    initialEventId?: string,
  );
  constructor(
    context: PhaseContext,
    savedItems: readonly ItemInstance[],
    seed: number,
    scavengeElapsedSeconds: number,
    onRestart: () => void,
    initialEventId: string | undefined,
    testDependencies?: SurvivalPhaseTestDependencies,
  ) {
    if (testDependencies === undefined) {
      this.initialize(
        context,
        new SurvivalSession(savedItems, {
          seed,
          ...(initialEventId === undefined ? {} : { initialEventId }),
        }),
        new BoatWorld(
          context.camera,
          context.propModels,
          context.skyAssets.moonTexture,
          savedItems,
          context.lifeboatAssets,
          context.shipFurniture,
        ),
        new SurvivalUI(context.mount),
        scavengeElapsedSeconds,
        onRestart,
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
    );
  }

  static forTest(dependencies: SurvivalPhaseTestDependencies): SurvivalPhase {
    const TestConstructor = SurvivalPhase as unknown as new (
      context: PhaseContext,
      savedItems: readonly ItemInstance[],
      seed: number,
      scavengeElapsedSeconds: number,
      onRestart: () => void,
      initialEventId: string | undefined,
      dependencies: SurvivalPhaseTestDependencies,
    ) => SurvivalPhase;
    return new TestConstructor(
      testContext(dependencies.sceneRenderer),
      [],
      0,
      0,
      dependencies.onRestart ?? (() => undefined),
      undefined,
      dependencies,
    );
  }

  start(): void {
    if (this.disposed || this.started) return;
    this.started = true;
    const snapshot = this.renderSnapshot(false);
    if (snapshot.pendingEventId !== null && !isTerminal(snapshot.state)) {
      void this.runPendingEventReveal(snapshot, this.lifecycleGeneration);
    }

    if (typeof document !== 'undefined') {
      this.visibilityDocument = document;
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
      if (document.hidden) {
        this.visibilityPauseActive = true;
        this.setPaused(true);
        this.world.setDocumentHidden?.(true);
      }
    }
  }

  update(time: number, deltaSeconds: number): void {
    if (this.disposed || this.paused || this.documentIsHidden()) return;
    this.elapsedSeconds = time;
    this.world.update?.(time, deltaSeconds);
    const snapshot = this.session.snapshot();
    this.syncVisualState(snapshot);
    this.syncPresentation(snapshot);
    if (this.started) this.advanceFishing(deltaSeconds);
    this.presentTerminalOnce(snapshot);
  }

  resize(width: number, height: number): void {
    if (this.disposed || width <= 0 || height <= 0) return;
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.context.camera.aspect = width / height;
    this.context.camera.updateProjectionMatrix();
    this.syncPresentation(this.session.snapshot());
    this.syncFishingBiteTarget();
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
    if (!this.canAcceptCommand()) return;
    if (action === 'fish') {
      void this.beginFishing();
      return;
    }
    const selectedOption = action === 'repair' ? this.repairOption(this.session.snapshot()) : option;
    const outcome = this.session.perform?.(action, selectedOption);
    if (outcome === undefined) return;
    if (!outcome.accepted) {
      this.ui.showFeedback?.(outcome);
      return;
    }
    if (action === 'endDay') {
      void this.runEndDay(outcome);
      return;
    }
    const day = this.session.snapshot().day;
    if (!this.requestedDayEventDays.has(day)) this.pendingDayEventDay = day;
    void this.runDayAction(outcome);
  }

  handleEventItem(choiceId: EventResponseId, instanceId: ItemInstanceId): void {
    if (
      this.eventPresentation !== 'choosing'
      || this.eventEligibility.get(instanceId) !== choiceId
    ) return;
    void this.resolveEventWithItem(choiceId, instanceId, this.lifecycleGeneration);
  }

  handleEndure(): void {
    if (this.eventPresentation !== 'choosing' || this.eventEligibility.size !== 0) return;
    void this.resolveEndure(this.lifecycleGeneration);
  }

  handleJournalOpen(): void {
    if (this.disposed || this.busy || this.paused || this.documentIsHidden()) return;
    const snapshot = this.session.snapshot();
    this.lastReadJournalDay = this.latestJournalDay(snapshot);
    this.ui.setJournalUnread?.(false);
    this.ui.showJournal?.(snapshot.journalEntries);
  }

  handleJournalClose(): void {
    if (this.disposed) return;
    this.ui.hideJournal?.();
  }

  setPaused(paused: boolean): void {
    if (this.disposed || (!paused && this.documentIsHidden())) return;
    this.paused = paused;
    if (!paused) this.visibilityPauseActive = false;
    this.ui.setPaused?.(paused);
    if (!paused) this.releaseVisibilityResumeWaiters();
  }

  setWeatherOverride(id: PresentationWeatherId | null): void {
    this.forcedWeather = id;
    this.syncPresentationWeather();
  }

  getPresentationWeather(): PresentationWeatherId {
    return this.effectivePresentationWeather;
  }

  requestRestart(): void {
    if (this.disposed || this.restartRequested) return;
    this.clearEventPresentation();
    this.restartRequested = true;
    this.lifecycleGeneration += 1;
    this.releaseVisibilityResumeWaiters();
    this.onRestart();
  }

  dispose(): void {
    if (this.disposed) return;
    this.clearEventPresentation();
    this.disposed = true;
    this.lifecycleGeneration += 1;
    this.releaseVisibilityResumeWaiters();
    this.activeFishing = null;
    this.fishingPresentation = 'idle';
    this.fishingSettlementInProgress = false;
    this.ui.hideFishingResult?.();
    this.ui.setFishingViewExitVisible?.(false);
    this.ui.onFishingResultContinue = null;
    this.ui.onFishingViewExit = null;
    this.ui.onDriftingLootContinue = null;
    if (this.visibilityDocument !== null) {
      this.visibilityDocument.removeEventListener('visibilitychange', this.handleVisibilityChange);
      this.visibilityDocument = null;
    }
    this.world.dispose?.();
    this.ui.dispose?.();
  }

  private initialize(
    context: PhaseContext,
    session: Partial<SurvivalSession> & Pick<SurvivalSession, 'snapshot'>,
    world: Partial<BoatWorld>,
    ui: Partial<SurvivalUI>,
    scavengeElapsedSeconds: number,
    onRestart: () => void,
  ): void {
    this.context = context;
    this.session = session;
    this.world = world;
    this.ui = ui;
    this.scavengeElapsedSeconds = scavengeElapsedSeconds;
    this.onRestart = onRestart;
    this.requestedDayEventDays.clear();
    this.wireUI();
  }

  private wireUI(): void {
    this.ui.onAction = (action, option) => this.handleAction(action, option);
    this.ui.onEventItem = (choiceId, instanceId) => this.handleEventItem(choiceId, instanceId);
    this.ui.onEventChoice = (choiceId) =>
      void this.resolveContextualChoice(choiceId, this.lifecycleGeneration);
    this.ui.onEndure = () => this.handleEndure();
    this.ui.onRestart = () => this.requestRestart();
    this.ui.onAnchorHighlight = (anchorId) => {
      if (!this.disposed) this.world.setHighlightedItem?.(anchorId);
    };
    this.ui.onPauseChange = (paused) => this.setPaused(paused);
    this.ui.onJournalOpen = () => this.handleJournalOpen();
    this.ui.onJournalClose = () => this.handleJournalClose();
    this.ui.onFishingCast = (point) => this.handleFishingCast(point);
    this.ui.onFishingReel = () => this.handleFishingReel();
    this.ui.onFishingResultContinue = () => this.continueFishingResult();
    this.ui.onFishingViewExit = () => this.exitReadyFishingView();
    this.ui.onDriftingLootContinue = () => this.continueDriftingLootResult();
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
  }

  private async beginFishing(): Promise<void> {
    const begun = this.session.beginFishing?.();
    if (begun === undefined) return;
    if (!begun.accepted) {
      this.ui.showFeedback?.(begun.outcome);
      return;
    }

    const generation = ++this.lifecycleGeneration;
    const attempt = begun.attempt;
    this.activeFishing = attempt;
    this.fishingPresentation = 'entering';
    this.fishingSettlementInProgress = false;
    this.ui.setFishingViewExitVisible?.(false);
    this.setBusy(true);
    this.renderSnapshot(false, false);
    this.ui.setFishingState?.({
      mode: 'waiting',
      message: 'CLICK THE WATER TO CAST',
      biteTarget: null,
    });

    if (!await this.transitionFishingView('enter', generation)) return;
    if (!this.isCurrentFishing(attempt, generation)) return;
    this.fishingPresentation = 'aiming';
    this.ui.setFishingState?.({
      mode: 'aiming',
      message: 'CLICK THE WATER TO CAST',
      biteTarget: null,
    });
    this.ui.setFishingViewExitVisible?.(true);
  }

  private handleFishingCast(
    screenPoint: { readonly x: number; readonly y: number } | null,
  ): boolean {
    const attempt = this.activeFishing;
    if (
      attempt === null
      || this.fishingPresentation !== 'aiming'
      || this.paused
      || this.documentIsHidden()
      || !this.isContinuationActive(this.lifecycleGeneration)
    ) return false;

    const castPoint = screenPoint === null
      ? this.world.centeredFishingCast?.() ?? null
      : this.world.castFishingAtScreenPoint?.(
        screenPoint.x,
        screenPoint.y,
        this.viewportWidth,
        this.viewportHeight,
      ) ?? null;
    if (castPoint === null || !attempt.cast(castPoint).accepted) return false;

    const storedPoint = attempt.snapshot().castPoint;
    if (storedPoint === null) return false;
    const generation = this.lifecycleGeneration;
    this.ui.setFishingViewExitVisible?.(false);
    this.fishingPresentation = 'casting';
    void this.completeFishingCast(attempt, storedPoint, generation);
    return true;
  }

  private async completeFishingCast(
    attempt: FishingSession,
    point: FishingCastPoint,
    generation: number,
  ): Promise<void> {
    await (this.world.playFishingCast?.(point) ?? Promise.resolve());
    if (!this.isCurrentFishing(attempt, generation)) return;
    if (!attempt.completeCast().accepted) return;
    const storedPoint = attempt.snapshot().castPoint;
    if (storedPoint === null) return;
    this.fishingPresentation = 'waiting';
    this.world.showFishingWaiting?.(storedPoint);
    this.ui.setFishingState?.({
      mode: 'waiting',
      message: 'WAIT FOR A BITE',
      biteTarget: null,
    });
  }

  private advanceFishing(deltaSeconds: number): void {
    const attempt = this.activeFishing;
    if (
      attempt === null
      || this.fishingSettlementInProgress
      || (this.fishingPresentation !== 'waiting' && this.fishingPresentation !== 'bite')
      || !Number.isFinite(deltaSeconds)
      || deltaSeconds < 0
    ) return;

    const current = attempt.view();
    const previousState = current.state;
    attempt.advance(deltaSeconds);
    if (current.castPoint === null) return;
    if (current.state === 'bite') {
      if (this.fishingPresentation !== 'bite') {
        this.enterFishingBite(current.castPoint);
        return;
      }
      this.syncFishingBiteTarget();
      return;
    }
    if (current.state !== 'missed' || current.result === null) return;
    if (previousState === 'waiting' && this.fishingPresentation !== 'bite') {
      this.enterFishingBite(current.castPoint);
    }
    this.settleFishing(attempt, current.result, this.lifecycleGeneration);
  }

  private enterFishingBite(point: FishingCastPoint): void {
    this.fishingPresentation = 'bite';
    this.world.showFishingBite?.(point);
    this.ui.setFishingState?.({
      mode: 'bite',
      message: 'BITE - REEL NOW',
      biteTarget: this.world.projectFishingBite?.(
        this.viewportWidth,
        this.viewportHeight,
      ) ?? null,
    });
  }

  private syncFishingBiteTarget(): void {
    if (this.activeFishing === null || this.fishingPresentation !== 'bite') return;
    this.ui.updateFishingBiteTarget?.(this.world.projectFishingBite?.(
      this.viewportWidth,
      this.viewportHeight,
    ) ?? null);
  }

  private handleFishingReel(): boolean {
    const attempt = this.activeFishing;
    const generation = this.lifecycleGeneration;
    if (
      attempt === null
      || this.fishingPresentation !== 'bite'
      || this.fishingSettlementInProgress
      || this.paused
      || this.documentIsHidden()
      || !this.isContinuationActive(generation)
    ) return false;
    const current = attempt.snapshot();
    if (current.state === 'resolved' && current.result !== null) {
      return this.settleFishing(attempt, current.result, generation);
    }
    const reel = attempt.reel();
    if (!reel.accepted || reel.result === undefined) return false;
    if (!attempt.completeReel().accepted) return false;
    const result = attempt.snapshot().result;
    if (result === null || result !== reel.result) return false;
    return this.settleFishing(attempt, result, generation);
  }

  private settleFishing(
    attempt: FishingSession,
    result: FishingTerminalResult,
    generation: number,
  ): boolean {
    if (!this.isCurrentFishing(attempt, generation) || this.fishingSettlementInProgress) return false;
    this.fishingSettlementInProgress = true;
    this.fishingPresentation = 'settling';
    const outcome = this.session.finishFishing?.(attempt.snapshot().id, result);
    if (outcome === undefined || !outcome.accepted) {
      if (outcome !== undefined) this.ui.showFeedback?.(outcome);
      this.fishingSettlementInProgress = false;
      this.fishingPresentation = 'bite';
      this.syncFishingBiteTarget();
      return false;
    }
    this.renderSnapshot(false, false);
    this.fishingPresentation = 'settling';
    this.ui.setFishingState?.({
      mode: 'waiting',
      message: result.kind === 'catch' ? 'REELING IN' : 'THE LINE WENT SLACK',
      biteTarget: null,
    });
    void this.presentFishingResult(attempt, result, outcome, generation);
    return true;
  }

  private async presentFishingResult(
    attempt: FishingSession,
    result: FishingTerminalResult,
    outcome: ActionOutcome,
    generation: number,
  ): Promise<void> {
    if (result.kind === 'catch') {
      await (this.world.playFishingReel?.(result.catch.id) ?? Promise.resolve());
    } else {
      await (this.world.playFishingMiss?.() ?? Promise.resolve());
    }
    if (!this.isCurrentFishing(attempt, generation)) return;

    this.fishingPresentation = 'result';
    this.ui.setFishingState?.({ mode: 'result', message: '', biteTarget: null });
    const view = formatFishingResult(result, outcome);
    this.ui.showFishingResult?.({
      ...view,
      catchTarget: result.kind === 'catch'
        ? this.world.projectFishingCatch?.(
          this.viewportWidth,
          this.viewportHeight,
        ) ?? null
        : null,
    });
  }

  private continueFishingResult(): void {
    const attempt = this.activeFishing;
    const generation = this.lifecycleGeneration;
    if (
      attempt === null
      || this.fishingPresentation !== 'result'
      || !this.isContinuationActive(generation)
    ) return;
    this.ui.hideFishingResult?.();
    this.world.clearFishingPresentation?.();
    this.fishingSettlementInProgress = false;
    this.fishingPresentation = 'ready';
    this.activeFishing = null;
    this.setBusy(false);
    this.ui.setFishingState?.({ mode: 'hidden', message: '', biteTarget: null });
    this.ui.setFishingViewExitVisible?.(true);
  }

  private exitReadyFishingView(): void {
    if (!this.isContinuationActive()) return;
    if (this.fishingPresentation === 'aiming') {
      const attempt = this.activeFishing;
      if (attempt === null) return;
      const outcome = this.session.cancelFishing?.(attempt.snapshot().id);
      if (outcome === undefined || !outcome.accepted) {
        if (outcome !== undefined) this.ui.showFeedback?.(outcome);
        return;
      }
      this.activeFishing = null;
      this.fishingSettlementInProgress = false;
      this.renderSnapshot(false, false);
      this.ui.setFishingState?.({ mode: 'hidden', message: '', biteTarget: null });
    } else if (
      this.fishingPresentation !== 'ready'
      || this.activeFishing !== null
    ) {
      return;
    }
    const generation = ++this.lifecycleGeneration;
    this.fishingPresentation = 'returning';
    this.ui.setFishingViewExitVisible?.(false);
    this.setBusy(true);
    void this.returnFromFishingView(generation);
  }

  private async returnFromFishingView(generation: number): Promise<void> {
    if (!await this.transitionFishingView('exit', generation)) return;
    if (!this.isContinuationActive(generation)) return;
    this.fishingPresentation = 'idle';
    this.setBusy(false);
    this.ui.restoreCommandFocus?.();
  }

  private async transitionFishingView(
    direction: 'enter' | 'exit',
    generation: number,
  ): Promise<boolean> {
    await (direction === 'enter'
      ? this.world.enterFishingView?.() ?? Promise.resolve()
      : this.world.exitFishingView?.() ?? Promise.resolve());
    return this.isContinuationActive(generation);
  }

  private isCurrentFishing(attempt: FishingSession, generation: number): boolean {
    return this.activeFishing === attempt && this.isContinuationActive(generation);
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
    let snapshot = this.renderSnapshot(false, false);
    this.ui.showFeedback?.(outcome);
    if (isTerminal(snapshot.state)) {
      this.setBusy(false);
      this.presentTerminalOnce(snapshot);
      return;
    }
    snapshot = await this.openScheduledDayEvent(snapshot);
    if (this.disposed) return;
    if (snapshot.pendingEventId !== null) {
      await this.runPendingEventReveal(snapshot, this.lifecycleGeneration);
      return;
    }
    this.setBusy(false);
    this.ui.restoreCommandFocus?.();
  }

  private async openScheduledDayEvent(
    snapshot: SurvivalSnapshot,
    generation?: number,
  ): Promise<SurvivalSnapshot> {
    if (
      this.pendingDayEventDay === null
      || snapshot.day !== this.pendingDayEventDay
      || snapshot.state !== 'day'
    ) return snapshot;

    const eventDay = this.pendingDayEventDay;
    this.pendingDayEventDay = null;
    this.requestedDayEventDays.add(eventDay);
    const eventOutcome = this.session.requestDayEvent?.();
    if (eventOutcome === undefined) return snapshot;
    if (!eventOutcome.accepted) {
      this.ui.showFeedback?.(eventOutcome);
      return this.renderSnapshot(false, false);
    }
    return this.renderSnapshot(false, false);
  }

  private async runEndDay(outcome: ActionOutcome): Promise<void> {
    const generation = this.lifecycleGeneration;
    const opensEvent = outcome.code !== 'quiet-night';
    this.eventPresentation = opensEvent ? 'transitioning' : 'sleeping';
    this.setBusy(true);
    if (opensEvent) this.ui.beginEventPresentation?.();
    await Promise.all([
      this.world.play?.(outcome.cue) ?? Promise.resolve(),
      this.ui.setSleepCovered?.(true) ?? Promise.resolve(),
    ]);
    if (!this.isContinuationActive(generation)) return;
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
    const eventState = pending.state;
    this.eventPresentation = 'using';
    this.setBusy(true);
    this.ui.setEventUsing?.(instanceId);
    this.world.setEventSelectedItem?.(instanceId);
    await (
      this.world.playEventItemUse?.(eventId, choiceId, instanceId)
      ?? Promise.resolve()
    );
    if (!this.isContinuationActive(generation)) return;
    if (
      (this.visibilityPauseActive || this.documentIsHidden())
      && !await this.waitForEventResume(generation)
    ) return;
    this.eventPresentation = 'resolving';
    const outcome = this.session.resolveEvent?.({ kind: 'item', choiceId, instanceId });
    if (outcome === undefined || !this.isContinuationActive(generation)) return;
    if (!outcome.accepted) {
      this.ui.showFeedback?.(outcome);
      this.eventPresentation = 'choosing';
      this.world.setEventSelectedItem?.(null);
      this.restoreEventSelection();
      this.setBusy(false);
      return;
    }
    const resolved = this.session.snapshot();
    const condition = resolved.inventory[instanceId]?.condition ?? 'lost';
    this.syncPresentation(resolved);
    await this.runEventResolution(
      eventId,
      outcome,
      eventState,
      generation,
      { choiceId, instanceId, condition },
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
    if (eventId === 'drifting-loot') {
      await this.resolveDriftingLootChoice(choiceId, generation);
      return;
    }
    this.eventPresentation = 'using';
    this.setBusy(true);
    await (this.ui.playEventChoiceBeat?.(choiceId) ?? Promise.resolve());
    if (!this.isContinuationActive(generation)) return;
    this.eventPresentation = 'resolving';
    const outcome = this.session.resolveEvent?.({ kind: 'choice', choiceId });
    if (outcome === undefined || !this.isContinuationActive(generation)) return;
    if (!outcome.accepted) {
      this.ui.showFeedback?.(outcome);
      this.eventPresentation = 'choosing';
      this.restoreEventSelection();
      this.setBusy(false);
      return;
    }
    await this.runEventResolution(eventId, outcome, pending.state, generation, null);
  }

  private async resolveDriftingLootChoice(
    choiceId: EventResponseId,
    generation: number,
  ): Promise<void> {
    if (this.eventPresentation !== 'choosing' || !this.isContinuationActive(generation)) return;
    const pending = this.session.snapshot();
    if (pending.pendingEventId !== 'drifting-loot') return;
    if (!isDriftingLootVariant(pending.pendingDriftingLootVariant)) {
      this.rejectMissingDriftingLootVariant();
      return;
    }

    this.activeDriftingLootVariant = pending.pendingDriftingLootVariant;
    this.eventPresentation = 'using';
    this.setBusy(true);
    await (this.ui.playEventChoiceBeat?.(choiceId) ?? Promise.resolve());
    if (!this.isContinuationActive(generation)) return;

    this.eventPresentation = 'resolving';
    const outcome = this.session.resolveEvent?.({ kind: 'choice', choiceId });
    if (outcome === undefined || !this.isContinuationActive(generation)) return;
    if (!outcome.accepted) {
      this.ui.showFeedback?.(outcome);
      this.eventPresentation = 'choosing';
      this.restoreEventSelection();
      this.setBusy(false);
      return;
    }

    this.renderSnapshot(false, false);
    this.eventEligibility.clear();
    this.world.setEventSelectedItem?.(null);
    this.world.setEventEligibleItems?.(null);
    this.ui.clearEventPresentation?.();

    if (choiceId === 'retrieve') {
      if (outcome.rewardSummary === undefined) {
        const feedback: ActionOutcome = {
          accepted: false,
          code: 'drifting-loot-reward-missing',
          message: 'The recovered salvage could not be identified.',
          deltas: {},
          cue: 'none',
        };
        this.ui.showFeedback?.(feedback);
        this.finishDriftingLootPresentation();
        return;
      }
      this.eventPresentation = 'retrieving';
      await (this.world.retrieveDriftingLoot?.() ?? Promise.resolve());
      if (!this.isContinuationActive(generation)) return;
      this.eventPresentation = 'result';
      const view = formatDriftingLootResult(outcome.rewardSummary);
      this.ui.showDriftingLootResult?.({
        ...view,
        target: this.world.projectDriftingLoot?.(
          this.viewportWidth,
          this.viewportHeight,
        ) ?? null,
      });
      return;
    }

    this.eventPresentation = 'receding';
    await (this.world.recedeDriftingLoot?.() ?? Promise.resolve());
    if (!this.isContinuationActive(generation)) return;
    this.finishDriftingLootPresentation();
  }

  private async resolveEndure(generation: number): Promise<void> {
    this.eventPresentation = 'resolving';
    this.setBusy(true);
    const pending = this.session.snapshot();
    const eventState = pending.state;
    const eventId = pending.pendingEventId;
    if (eventId === null) return;
    const outcome = this.session.resolveEvent?.({ kind: 'endure' });
    if (outcome === undefined) return;
    if (!outcome.accepted) {
      this.ui.showFeedback?.(outcome);
      this.eventPresentation = 'choosing';
      this.setBusy(false);
      return;
    }
    await this.runEventResolution(eventId, outcome, eventState, generation, null);
  }

  private async runEventResolution(
    eventId: string,
    outcome: ActionOutcome,
    eventState: Extract<SurvivalState, 'dayEvent' | 'nightEvent'> | SurvivalState,
    generation: number,
    physicalResponse: EventPhysicalResponsePresentation | null = null,
  ): Promise<void> {
    this.setBusy(true);
    await Promise.all([
      this.world.play?.(outcome.cue) ?? Promise.resolve(),
      this.world.reactToEventOutcome?.(eventId, outcome, physicalResponse)
        ?? Promise.resolve(),
    ]);
    if (!this.isContinuationActive(generation)) return;
    if (
      (this.visibilityPauseActive || this.documentIsHidden())
      && !await this.waitForEventResume(generation)
    ) return;
    const terminal = this.session.snapshot();
    this.ui.showFeedback?.(outcome);
    if (isTerminal(terminal.state)) {
      const snapshot = this.renderSnapshot(false, false);
      if (snapshot.state === 'rescued') this.retainTerminalEventTableau();
      else this.clearEventPresentation();
      this.eventPresentation = 'idle';
      this.setBusy(false);
      this.presentTerminalOnce(snapshot);
      return;
    }

    await (this.ui.holdEventOutcome?.() ?? Promise.resolve());
    if (!this.isContinuationActive(generation)) return;
    await (this.ui.setSleepCovered?.(true) ?? Promise.resolve());
    if (!this.isContinuationActive(generation)) return;

    this.clearEventPresentation();
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
    if (dawn?.accepted) await (this.world.play?.(dawn.cue) ?? Promise.resolve());
    if (!this.isContinuationActive(generation)) return this.session.snapshot();
    return this.renderSnapshot(false, false);
  }

  private async revealDawnEvent(
    snapshot: SurvivalSnapshot,
    generation: number,
  ): Promise<boolean> {
    if (snapshot.pendingEventId !== 'drifting-loot') return false;
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

  private syncPresentation(snapshot: SurvivalSnapshot): void {
    this.world.syncInventory?.(snapshot);
    this.ui.setAnchors?.(
      this.world.projectInteractionAnchors?.(this.viewportWidth, this.viewportHeight) ?? [],
    );
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

    const current = this.session.snapshot();
    if (current.pendingEventId !== event.id || isTerminal(current.state)) return;
    let driftingLootVariant: DriftingLootVariant | null = null;
    if (event.id === 'drifting-loot') {
      if (!isDriftingLootVariant(current.pendingDriftingLootVariant)) {
        this.rejectMissingDriftingLootVariant();
        return;
      }
      driftingLootVariant = current.pendingDriftingLootVariant;
    }
    this.setAutomaticWeather(presentationWeatherForEvent(event.id));
    this.world.stageEvent?.(event.id, driftingLootVariant);
    this.eventPresentation = 'revealing';
    await (this.ui.showEventReveal?.(event) ?? Promise.resolve());
    if (!this.isContinuationActive(generation)) return;

    if (event.id === 'drifting-loot') {
      await (this.world.revealEvent?.(event.id) ?? Promise.resolve());
      if (!this.isContinuationActive(generation)) return;
    }
    if (!await this.renderAndSettleCoveredScene(generation)) return;
    await (this.ui.setSleepCovered?.(false) ?? Promise.resolve());
    if (!this.isContinuationActive(generation)) return;
    if (event.id !== 'drifting-loot') {
      await (this.world.revealEvent?.(event.id) ?? Promise.resolve());
      if (!this.isContinuationActive(generation)) return;
    }
    if (
      (this.visibilityPauseActive || this.documentIsHidden())
      && !await this.waitForEventResume(generation)
    ) return;

    const revealed = this.session.snapshot();
    if (revealed.pendingEventId !== event.id || isTerminal(revealed.state)) return;
    this.eventEligibility = this.eventEligibilityFor(event, revealed);
    this.world.setEventEligibleItems?.(new Set(this.eventEligibility.keys()));
    this.ui.setEventSelection?.(
      this.eventEligibility,
      this.contextualChoicesFor(event, revealed),
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
        .filter((choice) => choice.itemId !== undefined)
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
      .map((choice) => {
        const unmet = choice.requirements?.filter(
          ({ resource, minimum }) => snapshot[resource] < minimum,
        ) ?? [];
        return {
          id: choice.id,
          label: choice.label,
          unavailableReason: unmet.length === 0
            ? null
            : unmet
                .map(({ resource, minimum }) => (
                  `Requires ${minimum} ${resource.replace(/([A-Z])/g, ' $1').toLocaleLowerCase('en-US')}; `
                  + `you have ${snapshot[resource]}.`
                ))
                .join(' '),
        };
      });
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
    this.eventEligibility.clear();
    this.eventPresentation = 'idle';
    this.world.setEventSelectedItem?.(null);
    this.world.setEventEligibleItems?.(null);
    this.ui.clearEventPresentation?.();
  }

  private clearEventPresentation(): void {
    this.eventEligibility.clear();
    this.eventPresentation = 'idle';
    this.activeDriftingLootVariant = null;
    this.world.setEventSelectedItem?.(null);
    this.world.setEventEligibleItems?.(null);
    this.world.clearEvent?.();
    this.ui.clearEventPresentation?.();
    this.ui.hideDriftingLootResult?.();
    this.setAutomaticWeather(null);
  }

  private finishDriftingLootPresentation(): void {
    if (
      this.activeDriftingLootVariant === null
      || (this.eventPresentation !== 'result' && this.eventPresentation !== 'receding'
        && this.eventPresentation !== 'resolving')
      || !this.isContinuationActive()
    ) return;
    this.eventPresentation = 'idle';
    this.ui.hideDriftingLootResult?.();
    this.eventEligibility.clear();
    this.world.setEventSelectedItem?.(null);
    this.world.setEventEligibleItems?.(null);
    this.world.clearEvent?.();
    this.ui.clearEventPresentation?.();
    this.setAutomaticWeather(null);
    this.activeDriftingLootVariant = null;
    this.renderSnapshot(false, false);
    this.setBusy(false);
    this.ui.restoreCommandFocus?.();
  }

  private continueDriftingLootResult(): void {
    if (this.eventPresentation !== 'result' || !this.isContinuationActive()) return;
    this.finishDriftingLootPresentation();
  }

  private missingDriftingLootVariantOutcome(): ActionOutcome {
    return {
      accepted: false,
      code: 'drifting-loot-variant-missing',
      message: 'The drifting loot could not be staged.',
      deltas: {},
      cue: 'none',
    };
  }

  private rejectMissingDriftingLootVariant(): void {
    this.eventEligibility.clear();
    this.eventPresentation = 'idle';
    this.activeDriftingLootVariant = null;
    this.world.setEventSelectedItem?.(null);
    this.world.setEventEligibleItems?.(null);
    this.world.clearEvent?.();
    this.ui.clearEventPresentation?.();
    this.ui.hideDriftingLootResult?.();
    this.setAutomaticWeather(null);
    this.ui.showFeedback?.(this.missingDriftingLootVariantOutcome());
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
  }

  private presentTerminalOnce(snapshot: SurvivalSnapshot): void {
    if (
      this.busy
      || !isTerminal(snapshot.state)
      || this.presentedTerminalState !== null
    ) return;
    this.presentedTerminalState = snapshot.state;
    this.ui.showEnding?.(
      snapshot.state,
      snapshot.day,
      snapshot.seed,
      this.scavengeElapsedSeconds,
    );
  }

  private documentIsHidden(): boolean {
    return typeof document !== 'undefined' && document.hidden;
  }

  private readonly handleVisibilityChange = (): void => {
    const hidden = this.visibilityDocument?.hidden === true;
    if (hidden) {
      this.visibilityPauseActive = true;
      this.setPaused(true);
    }
    this.world.setDocumentHidden?.(hidden);
  };

  private waitForEventResume(generation: number): Promise<boolean> {
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
