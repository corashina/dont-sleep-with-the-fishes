import { PerspectiveCamera } from 'three';
import type { PhaseContext, GamePhase } from '../app/GamePhase';
import {
  ITEM_DEFINITIONS,
  type ItemInstance,
  type ItemInstanceId,
} from '../game/ItemState';
import type { SceneRenderer, SurvivalVisualState } from '../rendering/SceneRenderer';
import { SurvivalUI, type FishingResultView } from '../ui/SurvivalUI';
import type { PropModelLibrary } from '../world/PropModelLibrary';
import type { ShipFurnitureLibrary } from '../world/ShipFurnitureLibrary';
import type { SkyAssets } from '../world/SkyAssets';
import { BoatWorld } from './BoatWorld';
import { survivalEventById } from './events';
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
  EventResponseId,
  SurvivalSnapshot,
  SurvivalState,
} from './survivalTypes';

export interface SurvivalPhaseTestDependencies {
  session: Partial<SurvivalSession> & Pick<SurvivalSession, 'snapshot'>;
  world: Partial<BoatWorld>;
  ui: Partial<SurvivalUI>;
  onRestart?: () => void;
  sceneRenderer?: SceneRenderer;
  reducedMotion?: boolean;
}

const TERMINAL_STATES: readonly SurvivalState[] = ['rescued', 'dead', 'sunk'];

type FishingPresentationState =
  | 'idle'
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
  | 'revealing'
  | 'choosing'
  | 'using'
  | 'resolving';

function isTerminal(state: SurvivalState): state is 'rescued' | 'dead' | 'sunk' {
  return TERMINAL_STATES.includes(state);
}

export function formatFishingResult(
  result: FishingTerminalResult,
  outcome: ActionOutcome,
): FishingResultView {
  if (result.kind === 'miss') {
    return { title: 'IT GOT AWAY', detail: 'NO CATCH' };
  }
  if (result.catch.kind === 'junk') {
    return { title: result.catch.label.toLocaleUpperCase('en-US'), detail: 'NO FOOD' };
  }
  const bait = outcome.deltas.bait === -1 ? ' - 1 BAIT USED' : '';
  return {
    title: result.catch.label.toLocaleUpperCase('en-US'),
    detail: `+${result.catch.food} FOOD${bait}`,
  };
}

function testContext(
  sceneRenderer: SceneRenderer = {
    render: () => undefined,
    resize: () => undefined,
    dispose: () => undefined,
  },
  reducedMotion = false,
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
    camera: new PerspectiveCamera(),
    reducedMotion: { matches: reducedMotion } as MediaQueryList,
    propModels: {} as PropModelLibrary,
    shipFurniture: {} as ShipFurnitureLibrary,
    maxTextureAnisotropy: 1,
    skyAssets: {} as SkyAssets,
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
    reducedMotion: false,
  };
  private busy = false;
  private paused = false;
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
  private eventEligibility = new Map<ItemInstanceId, EventResponseId>();
  private lifecycleGeneration = 0;

  constructor(
    context: PhaseContext,
    savedItems: readonly ItemInstance[],
    seed: number,
    scavengeElapsedSeconds: number,
    onRestart: () => void,
  );
  constructor(
    context: PhaseContext,
    savedItems: readonly ItemInstance[],
    seed: number,
    scavengeElapsedSeconds: number,
    onRestart: () => void,
    testDependencies?: SurvivalPhaseTestDependencies,
  ) {
    if (testDependencies === undefined) {
      this.initialize(
        context,
        new SurvivalSession(savedItems, { seed }),
        new BoatWorld(
          context.camera,
          context.reducedMotion,
          context.propModels,
          context.skyAssets.moonTexture,
          savedItems,
        ),
        new SurvivalUI(context.mount, context.reducedMotion),
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
      dependencies: SurvivalPhaseTestDependencies,
    ) => SurvivalPhase;
    return new TestConstructor(
      testContext(dependencies.sceneRenderer, dependencies.reducedMotion ?? false),
      [],
      0,
      0,
      dependencies.onRestart ?? (() => undefined),
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
      if (document.hidden) this.setPaused(true);
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
    if ((outcome.deltas.energy ?? 0) < 0) {
      const day = this.session.snapshot().day;
      if (!this.requestedDayEventDays.has(day)) this.pendingDayEventDay = day;
    }
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
    this.ui.setPaused?.(paused);
  }

  requestRestart(): void {
    if (this.disposed || this.restartRequested) return;
    this.clearEventPresentation();
    this.restartRequested = true;
    this.lifecycleGeneration += 1;
    this.onRestart();
  }

  dispose(): void {
    if (this.disposed) return;
    this.clearEventPresentation();
    this.disposed = true;
    this.lifecycleGeneration += 1;
    this.activeFishing = null;
    this.fishingPresentation = 'idle';
    this.fishingSettlementInProgress = false;
    this.ui.hideFishingResult?.();
    this.ui.onFishingResultContinue = null;
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
    this.ui.showFishingResult?.(formatFishingResult(result, outcome));
  }

  private continueFishingResult(): void {
    const attempt = this.activeFishing;
    const generation = this.lifecycleGeneration;
    if (
      attempt === null
      || this.fishingPresentation !== 'result'
      || !this.isContinuationActive(generation)
    ) return;
    this.fishingPresentation = 'returning';
    this.ui.hideFishingResult?.();
    void this.returnFromFishing(attempt, generation);
  }

  private async returnFromFishing(
    attempt: FishingSession,
    generation: number,
  ): Promise<void> {
    if (!await this.transitionFishingView('exit', generation)) return;
    if (!this.isCurrentFishing(attempt, generation)) return;
    this.completeFishingPresentation(generation);
  }

  private completeFishingPresentation(generation: number): void {
    if (!this.isContinuationActive(generation)) return;
    this.fishingSettlementInProgress = false;
    this.fishingPresentation = 'idle';
    this.activeFishing = null;
    this.setBusy(false);
    this.ui.setFishingState?.({ mode: 'hidden', message: '', biteTarget: null });
    this.world.clearFishingPresentation?.();
  }

  private async transitionFishingView(
    direction: 'enter' | 'exit',
    generation: number,
  ): Promise<boolean> {
    const reducedMotion = this.context.reducedMotion.matches;
    if (reducedMotion) {
      await (this.ui.setFishingFade?.(true) ?? Promise.resolve());
      if (!this.isContinuationActive(generation)) return false;
    }
    await (direction === 'enter'
      ? this.world.enterFishingView?.() ?? Promise.resolve()
      : this.world.exitFishingView?.() ?? Promise.resolve());
    if (!this.isContinuationActive(generation)) return false;
    if (reducedMotion) {
      await (this.ui.setFishingFade?.(false) ?? Promise.resolve());
      if (!this.isContinuationActive(generation)) return false;
    }
    return true;
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
    this.eventPresentation = 'sleeping';
    this.setBusy(true);
    await Promise.all([
      this.world.play?.(outcome.cue) ?? Promise.resolve(),
      this.ui.setSleepCovered?.(true) ?? Promise.resolve(),
    ]);
    if (!this.isContinuationActive(generation)) return;
    let snapshot = this.renderSnapshot(false, false);

    if (outcome.code === 'quiet-night') {
      await (this.ui.holdSleep?.() ?? Promise.resolve());
      if (!this.isContinuationActive(generation)) return;
      snapshot = await this.runDawn();
      if (!this.isContinuationActive(generation)) return;
      await (this.ui.setSleepCovered?.(false) ?? Promise.resolve());
      if (!this.isContinuationActive(generation)) return;
      this.eventPresentation = 'idle';
      this.setBusy(false);
      this.presentTerminalOnce(snapshot);
      this.ui.restoreCommandFocus?.();
      return;
    }

    await (this.ui.setSleepCovered?.(false) ?? Promise.resolve());
    if (!this.isContinuationActive(generation)) return;
    await this.runPendingEventReveal(snapshot, generation);
  }

  private async resolveEventWithItem(
    choiceId: EventResponseId,
    instanceId: ItemInstanceId,
    generation: number,
  ): Promise<void> {
    this.eventPresentation = 'using';
    this.setBusy(true);
    this.ui.setEventUsing?.(instanceId);
    this.world.setEventSelectedItem?.(instanceId);
    await (this.world.playEventItemUse?.(instanceId) ?? Promise.resolve());
    if (!this.isContinuationActive(generation)) return;
    this.eventPresentation = 'resolving';
    const eventState = this.session.snapshot().state;
    const outcome = this.session.resolveEvent?.({ kind: 'item', choiceId, instanceId });
    if (outcome === undefined) return;
    if (!outcome.accepted) {
      this.ui.showFeedback?.(outcome);
      this.eventPresentation = 'choosing';
      this.world.setEventSelectedItem?.(null);
      this.ui.setEventSelection?.(this.eventEligibility);
      this.setBusy(false);
      return;
    }
    this.clearEventPresentation();
    await this.runEventResolution(outcome, eventState, generation);
  }

  private async resolveEndure(generation: number): Promise<void> {
    this.eventPresentation = 'resolving';
    this.setBusy(true);
    const eventState = this.session.snapshot().state;
    const outcome = this.session.resolveEvent?.({ kind: 'endure' });
    if (outcome === undefined) return;
    if (!outcome.accepted) {
      this.ui.showFeedback?.(outcome);
      this.eventPresentation = 'choosing';
      this.setBusy(false);
      return;
    }
    this.clearEventPresentation();
    await this.runEventResolution(outcome, eventState, generation);
  }

  private async runEventResolution(
    outcome: ActionOutcome,
    eventState: Extract<SurvivalState, 'dayEvent' | 'nightEvent'> | SurvivalState,
    generation: number,
  ): Promise<void> {
    this.setBusy(true);
    await (this.world.play?.(outcome.cue) ?? Promise.resolve());
    if (!this.isContinuationActive(generation)) return;
    let snapshot = this.renderSnapshot(false, false);
    this.ui.showFeedback?.(outcome);
    if (isTerminal(snapshot.state)) {
      this.eventPresentation = 'idle';
      this.setBusy(false);
      this.presentTerminalOnce(snapshot);
      return;
    }
    if (eventState === 'nightEvent') snapshot = await this.runDawn();
    if (!this.isContinuationActive(generation)) return;
    this.eventPresentation = 'idle';
    this.setBusy(false);
    this.presentTerminalOnce(snapshot);
    this.ui.restoreCommandFocus?.();
  }

  private async runDawn(): Promise<SurvivalSnapshot> {
    const dawn = this.session.beginDawn?.();
    if (dawn?.accepted) await (this.world.play?.(dawn.cue) ?? Promise.resolve());
    if (this.disposed) return this.session.snapshot();
    return this.renderSnapshot(false, false);
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
    this.world.setWeather?.(snapshot.weather);
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
    this.visualState.reducedMotion = this.context.reducedMotion.matches;
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
  ): Promise<void> {
    if (snapshot.pendingEventId === null || isTerminal(snapshot.state)) return;
    const event = survivalEventById(snapshot.pendingEventId);
    if (event === undefined) return;
    this.eventPresentation = 'revealing';
    this.eventEligibility.clear();
    this.setBusy(true);
    this.world.setEventSelectedItem?.(null);
    this.world.setEventEligibleItems?.(new Set());
    await Promise.all([
      this.world.play?.(event.cue) ?? Promise.resolve(),
      this.ui.showEventReveal?.(event) ?? Promise.resolve(),
    ]);
    if (!this.isContinuationActive(generation)) return;

    const current = this.session.snapshot();
    if (current.pendingEventId !== event.id || isTerminal(current.state)) return;
    this.eventEligibility = this.eventEligibilityFor(event, current);
    this.world.setEventEligibleItems?.(new Set(this.eventEligibility.keys()));
    this.ui.setEventSelection?.(this.eventEligibility);
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

  private clearEventPresentation(): void {
    this.eventEligibility.clear();
    this.eventPresentation = 'idle';
    this.world.setEventSelectedItem?.(null);
    this.world.setEventEligibleItems?.(null);
    this.ui.clearEventPresentation?.();
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
    if (this.visibilityDocument?.hidden) this.setPaused(true);
  };
}
