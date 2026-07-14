import { PerspectiveCamera } from 'three';
import type { PhaseContext, GamePhase } from '../app/GamePhase';
import type { ItemId, ItemInstance } from '../game/ItemState';
import { SurvivalUI } from '../ui/SurvivalUI';
import type { PropModelLibrary } from '../world/PropModelLibrary';
import { BoatWorld } from './BoatWorld';
import { SURVIVAL_EVENTS } from './events';
import { SurvivalSession } from './SurvivalSession';
import type { DayActionOption } from './SurvivalSession';
import type { ActionOutcome, DayActionId, SurvivalSnapshot, SurvivalState } from './survivalTypes';

export interface SurvivalPhaseTestDependencies {
  session: Partial<SurvivalSession> & Pick<SurvivalSession, 'snapshot'>;
  world: Partial<BoatWorld>;
  ui: Partial<SurvivalUI>;
  onRestart?: () => void;
}

const TERMINAL_STATES: readonly SurvivalState[] = ['rescued', 'dead', 'sunk'];

function isTerminal(state: SurvivalState): state is 'rescued' | 'dead' | 'sunk' {
  return TERMINAL_STATES.includes(state);
}

function testContext(): PhaseContext {
  const mount = {
    clientWidth: 1,
    clientHeight: 1,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1, height: 1 }),
  } as unknown as HTMLElement;
  return {
    mount,
    renderer: { render: () => undefined } as unknown as PhaseContext['renderer'],
    camera: new PerspectiveCamera(),
    reducedMotion: { matches: false } as MediaQueryList,
    propModels: {} as PropModelLibrary,
  };
}

export class SurvivalPhase implements GamePhase {
  private context!: PhaseContext;
  private session!: Partial<SurvivalSession> & Pick<SurvivalSession, 'snapshot'>;
  private world!: Partial<BoatWorld>;
  private ui!: Partial<SurvivalUI>;
  private onRestart!: () => void;
  private scavengeElapsedSeconds = 0;
  private busy = false;
  private awaitingContinue = false;
  private paused = false;
  private disposed = false;
  private started = false;
  private restartRequested = false;
  private presentedTerminalState: SurvivalState | null = null;
  private pendingDayEventDay: number | null = null;
  private readonly requestedDayEventDays = new Set<number>();
  private visibilityDocument: Document | null = null;
  private viewportWidth = 1;
  private viewportHeight = 1;

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
          savedItems,
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
      dependencies: SurvivalPhaseTestDependencies,
    ) => SurvivalPhase;
    return new TestConstructor(
      testContext(),
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
    this.renderSnapshot(true);

    if (typeof document !== 'undefined') {
      this.visibilityDocument = document;
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
      if (document.hidden) this.setPaused(true);
    }
  }

  update(time: number, deltaSeconds: number): void {
    if (this.disposed || this.paused || this.documentIsHidden()) return;
    this.world.update?.(time, deltaSeconds);
    const snapshot = this.session.snapshot();
    this.syncPresentation(snapshot);
    this.presentTerminalOnce(snapshot);
  }

  resize(width: number, height: number): void {
    if (this.disposed || width <= 0 || height <= 0) return;
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.context.camera.aspect = width / height;
    this.context.camera.updateProjectionMatrix();
    this.syncPresentation(this.session.snapshot());
  }

  render(): void {
    if (this.disposed || this.world.scene === undefined) return;
    this.context.renderer.render(this.world.scene, this.context.camera);
  }

  handleAction(action: DayActionId, option?: DayActionOption): void {
    if (!this.canAcceptCommand()) return;
    const selectedOption = action === 'repair' ? this.repairOption() : option;
    const outcome = this.session.perform?.(action, selectedOption);
    if (outcome === undefined) return;

    if (outcome.accepted && action !== 'endDay' && (outcome.deltas.energy ?? 0) < 0) {
      const day = this.session.snapshot().day;
      if (!this.requestedDayEventDays.has(day)) this.pendingDayEventDay = day;
    }
    this.present(outcome);
  }

  handleEventItem(itemId: ItemId): void {
    if (!this.canAcceptCommand()) return;
    const outcome = this.session.resolveEvent?.(itemId);
    if (outcome !== undefined) this.present(outcome);
  }

  handleEndure(): void {
    if (!this.canAcceptCommand()) return;
    const outcome = this.session.resolveEvent?.(null);
    if (outcome !== undefined) this.present(outcome);
  }

  handleContinue(): void {
    if (this.disposed || !this.awaitingContinue) return;
    this.awaitingContinue = false;
    let snapshot = this.renderSnapshot(false, false);
    this.ui.hideOutcome?.();
    this.presentTerminalOnce(snapshot);
    if (snapshot.state === 'nightEvent' && snapshot.pendingEventId === null) {
      const dawn = this.session.beginDawn?.();
      if (dawn?.accepted) {
        this.busy = true;
        this.ui.setBusy?.(true);
        void (this.world.play?.(dawn.cue) ?? Promise.resolve()).finally(() => {
          if (this.disposed) return;
          this.busy = false;
          this.ui.setBusy?.(false);
          this.renderSnapshot(false);
        });
        return;
      }
    }
    if (
      this.pendingDayEventDay !== null
      && snapshot.day === this.pendingDayEventDay
      && snapshot.state === 'day'
    ) {
      const eventDay = this.pendingDayEventDay;
      this.pendingDayEventDay = null;
      this.requestedDayEventDays.add(eventDay);
      const eventOutcome = this.session.requestDayEvent?.();
      if (eventOutcome?.accepted) {
        this.present(eventOutcome);
        return;
      }
      snapshot = this.renderSnapshot(false);
    }
    this.openPendingEvent(snapshot);
  }

  setPaused(paused: boolean): void {
    if (this.disposed || (!paused && this.documentIsHidden())) return;
    this.paused = paused;
    this.ui.setPaused?.(paused);
  }

  requestRestart(): void {
    if (this.disposed || this.restartRequested) return;
    this.restartRequested = true;
    this.onRestart();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
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
    this.ui.onEventItem = (itemId) => this.handleEventItem(itemId);
    this.ui.onEndure = () => this.handleEndure();
    this.ui.onContinue = () => this.handleContinue();
    this.ui.onRestart = () => this.requestRestart();
    this.ui.onPointer = (x, y) => this.handlePointer(x, y);
    this.ui.onAnchorHighlight = (anchorId) => {
      if (!this.disposed) this.world.setHighlightedItem?.(anchorId);
    };
    this.ui.onSkip = () => {
      if (!this.disposed) this.world.skipSequence?.();
    };
    this.ui.onPauseChange = (paused) => this.setPaused(paused);
  }

  private handlePointer(clientX: number, clientY: number): void {
    if (this.disposed) return;
    const rect = this.context.mount.getBoundingClientRect();
    const width = rect.width || this.context.mount.clientWidth || 1;
    const height = rect.height || this.context.mount.clientHeight || 1;
    const normalizedX = ((clientX - rect.left) / width) * 2 - 1;
    const normalizedY = 1 - ((clientY - rect.top) / height) * 2;
    this.world.setPointer?.(normalizedX, normalizedY);
  }

  private repairOption(): DayActionOption | undefined {
    const snapshot = this.session.snapshot();
    if (snapshot.repairMaterial > 0) return 'repairMaterial';
    const ductTape = snapshot.inventory.ductTape;
    if (ductTape.owned && (ductTape.charges ?? 0) > 0) return 'ductTape';
    return undefined;
  }

  private canAcceptCommand(): boolean {
    if (this.disposed || this.busy || this.awaitingContinue || this.paused || this.documentIsHidden()) return false;
    return !isTerminal(this.session.snapshot().state);
  }

  private present(outcome: ActionOutcome): void {
    this.ui.showOutcome?.(outcome);
    if (!outcome.accepted) {
      this.awaitingContinue = true;
      return;
    }
    this.busy = true;
    this.ui.setBusy?.(true);
    const sequence = this.world.play?.(outcome.cue) ?? Promise.resolve();
    void sequence.finally(() => {
      if (this.disposed) return;
      this.busy = false;
      this.ui.setBusy?.(false);
      this.awaitingContinue = true;
    });
  }

  private renderSnapshot(openPendingEvent: boolean, presentTerminal = true): SurvivalSnapshot {
    const snapshot = this.session.snapshot();
    this.world.setWeather?.(snapshot.weather);
    this.world.setPhase?.(snapshot.state === 'nightEvent' ? 'night' : 'day');
    this.ui.render?.(
      snapshot,
      (action) => this.session.availableReason?.(
        action,
        action === 'repair' ? this.repairOption() : undefined,
      ) ?? null,
    );
    this.syncPresentation(snapshot);
    if (presentTerminal) this.presentTerminalOnce(snapshot);
    if (openPendingEvent && !isTerminal(snapshot.state)) this.openPendingEvent(snapshot);
    return snapshot;
  }

  private syncPresentation(snapshot: SurvivalSnapshot): void {
    this.world.syncInventory?.(snapshot);
    this.ui.setAnchors?.(
      this.world.projectInteractionAnchors?.(this.viewportWidth, this.viewportHeight) ?? [],
    );
  }

  private openPendingEvent(snapshot: SurvivalSnapshot): void {
    if (snapshot.pendingEventId === null || isTerminal(snapshot.state)) return;
    const event = SURVIVAL_EVENTS.find((candidate) => candidate.id === snapshot.pendingEventId);
    if (event !== undefined) this.ui.showEvent?.(event, snapshot);
  }

  private presentTerminalOnce(snapshot: SurvivalSnapshot): void {
    if (
      this.busy
      || this.awaitingContinue
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
