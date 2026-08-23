import {
  ITEM_DEFINITIONS,
  type ItemInstanceId,
} from '../game/ItemState';
import type { JournalEntry } from '../survival/journalRecords';
import type { BoatInteractionAnchor, ProjectedBoatBounds } from '../survival/BoatInteraction';
import type { DriftingItemEventId } from '../survival/eventCatalog';
import type {
  ActionOutcome,
  DayActionId,
  DayActionOption,
  EventResponseId,
  SurvivalEventDefinition,
  SurvivalEndingReason,
  SurvivalItemState,
  SurvivalSnapshot,
} from '../survival/survivalTypes';
import { createElementRequirement } from './dom';
import { BoatAnchorView } from './BoatAnchorView';
import { DriftingItemView, type DriftingItemFocusView } from './DriftingItemView';
import { ModalFocusManager, type ModalInitialFocus } from './ModalFocusManager';
import { SurvivalCoverView } from './SurvivalCoverView';
import type { RewardResultView, SleepCoverProfile } from './SurvivalCoverViewModel';
import { SurvivalEventView } from './SurvivalEventView';
import {
  SurvivalFishingView,
  type FishingResultView,
  type FishingUiState,
} from './SurvivalFishingView';
import { SurvivalHudView } from './SurvivalHudView';
import { SurvivalJournalView } from './SurvivalJournalView';
import { SurvivalModalViews } from './SurvivalModalViews';
import { DAY_ACTION_IDS, type EventContextChoice } from './SurvivalUiViewModel';
import { runCleanupSteps } from './UiCleanup';

const ROUTINE_DIALOG_MARGIN = 20;
const ROUTINE_DIALOG_GAP = 22;

interface RoutineDialogPlacement {
  readonly anchorId: string;
  readonly fallbackX: number;
  readonly fallbackY: number;
  readonly width: number;
  readonly height: number;
}

const REPAIR_DIALOG_PLACEMENT: RoutineDialogPlacement = {
  anchorId: 'repair-tools',
  fallbackX: 0.32,
  fallbackY: 0.6,
  width: 430,
  height: 360,
};

const requireElement = createElementRequirement('survival UI');

export class SurvivalUI {
  onAction: (action: DayActionId, option?: DayActionOption) => void = () => undefined;
  onEventItem: (choiceId: EventResponseId, instanceId: ItemInstanceId) => void = () => undefined;
  onEventChoice: (choiceId: EventResponseId) => void = () => undefined;
  onRestart: () => void = () => undefined;
  onAnchorHighlight: (anchorId: string | null) => void = () => undefined;
  onPauseChange: (paused: boolean) => void = () => undefined;
  onJournalOpen: () => void = () => undefined;
  onJournalClose: () => void = () => undefined;
  onJournalPage: () => void = () => undefined;
  onFishingCast: ((point: { readonly x: number; readonly y: number } | null) => boolean) | null = null;
  onFishingReel: (() => boolean) | null = null;
  onFishingResultContinue: (() => void) | null = null;
  onFishingViewExit: (() => void) | null = null;
  onDriftingItemSelect: ((eventId: DriftingItemEventId) => void) | null = null;
  onDriftingItemBack: (() => void) | null = null;
  onCameraTurn: (() => void) | null = null;

  private readonly root: HTMLDivElement;
  private readonly hudView: SurvivalHudView;
  private readonly anchorView: BoatAnchorView;
  private readonly eventView: SurvivalEventView;
  private readonly coverView: SurvivalCoverView;
  private readonly fishingView: SurvivalFishingView;
  private readonly driftingView: DriftingItemView;
  private readonly journalView: SurvivalJournalView;
  private readonly modalViews: SurvivalModalViews;
  private readonly announcer: HTMLElement;
  private readonly modalFocus: ModalFocusManager;
  private busy = false;
  private paused = false;
  private disposed = false;
  private announcementVersion = 0;
  private pauseReturnTarget: HTMLElement | null = null;
  private fishingReturnTarget: HTMLElement | null = null;
  private latestCommandOrigin: HTMLButtonElement | null = null;
  private currentSnapshot: SurvivalSnapshot | null = null;

  constructor(mount: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'survival-ui';
    this.root.innerHTML = `
      <div class="ui-treatment" aria-hidden="true"></div>
      <div class="survival-announcer" data-survival-announcer aria-live="polite" aria-atomic="true"></div>
    `;
    mount.append(this.root);

    this.eventView = new SurvivalEventView();
    this.coverView = new SurvivalCoverView();
    this.hudView = new SurvivalHudView();
    this.anchorView = new BoatAnchorView(this.root);
    this.fishingView = new SurvivalFishingView(
      mount,
      this.root,
      () => this.anchorView.anchor('fishing-tools'),
    );
    this.driftingView = new DriftingItemView(this.root);
    this.journalView = new SurvivalJournalView();
    this.modalViews = new SurvivalModalViews();
    const announcer = requireElement<HTMLElement>(this.root, '[data-survival-announcer]');
    announcer.after(
      this.eventView.feedback,
      ...this.coverView.roots,
      this.eventView.sleepMask,
    );
    this.root.append(
      ...this.hudView.roots,
      ...this.anchorView.roots,
      ...this.fishingView.roots,
      this.driftingView.root,
      this.modalViews.repairRoot,
      this.eventView.caption,
      this.journalView.root,
      this.modalViews.pauseRoot,
      this.modalViews.endingRoot,
    );

    this.announcer = announcer;
    const modalLayers = [
      this.modalViews.pauseRoot,
      this.journalView.root,
      this.modalViews.repairRoot,
      this.modalViews.endingRoot,
      this.coverView.resultRoot,
      this.driftingView.root,
      this.fishingView.resultRoot,
      this.fishingView.interactionRoot,
    ];
    this.modalFocus = new ModalFocusManager(
      [this.hudView.topControls, this.anchorView.anchorLayer],
      modalLayers,
      new Map<HTMLElement, ModalInitialFocus>([
        [this.modalViews.pauseRoot, this.modalViews.resumeButton],
        [this.journalView.root, this.journalView.title],
        [this.modalViews.repairRoot, this.modalViews.repairTitle],
        [this.modalViews.endingRoot, this.modalViews.endingTitle],
        [this.coverView.resultRoot, this.coverView.resultClose],
        [this.driftingView.root, () => this.driftingView.initialFocus()],
        [this.fishingView.resultRoot, this.fishingView.resultContinue],
        [this.fishingView.interactionRoot, () => this.fishingView.initialFocus()],
      ]),
    );
    this.modalFocus.sync();

    this.hudView.onJournal = () => {
      if (!this.disposed) this.onJournalOpen();
    };
    this.hudView.onCameraTurn = () => {
      if (!this.disposed) this.onCameraTurn?.();
    };
    this.anchorView.onAction = (action, origin) => this.activateDayAction(action, origin);
    this.anchorView.onUnavailableAction = (_action, reason) => {
      if (!this.disposed) this.showFeedback({ accepted: false, message: reason });
    };
    this.anchorView.onEventItem = (choiceId, instanceId) => {
      if (!this.disposed) this.onEventItem(choiceId, instanceId);
    };
    this.anchorView.onEventChoice = (choiceId) => {
      if (!this.disposed) this.onEventChoice(choiceId);
    };
    this.anchorView.onEventFocus = (eventId) => {
      if (!this.disposed) this.onDriftingItemSelect?.(eventId);
    };
    this.anchorView.onHighlight = (anchorId) => {
      if (!this.disposed) this.onAnchorHighlight(anchorId);
    };
    this.eventView.onChoice = (choiceId) => {
      if (!this.disposed) this.onEventChoice(choiceId);
    };
    this.eventView.onAnnouncement = (message) => this.publishAnnouncement(message);
    this.coverView.onResultShow = () => this.showLayer(this.coverView.resultRoot);
    this.coverView.onResultHide = () => this.hideLayer(this.coverView.resultRoot);
    this.coverView.onResultClose = () => {
      if (this.modalFocus.topmostModal() === this.coverView.resultRoot) {
        this.coverView.confirmRewardResult();
      }
    };
    this.fishingView.onCast = (point) => (
      this.disposed ? false : this.onFishingCast?.(point) ?? false
    );
    this.fishingView.onReel = () => (
      this.disposed ? false : this.onFishingReel?.() ?? false
    );
    this.fishingView.onContinue = () => {
      if (!this.disposed) this.onFishingResultContinue?.();
    };
    this.fishingView.onExit = () => {
      if (!this.disposed) this.onFishingViewExit?.();
    };
    this.fishingView.canUseInteraction = () => (
      this.modalFocus.topmostModal() === this.fishingView.interactionRoot
    );
    this.fishingView.canUseResult = () => (
      this.modalFocus.topmostModal() === this.fishingView.resultRoot
    );
    this.fishingView.onInteractionShow = () => this.showLayer(this.fishingView.interactionRoot);
    this.fishingView.onInteractionHide = () => this.hideLayer(this.fishingView.interactionRoot);
    this.fishingView.onResultShow = () => this.showLayer(this.fishingView.resultRoot);
    this.fishingView.onResultHide = () => this.hideLayer(this.fishingView.resultRoot);
    this.driftingView.onChoice = (choiceId) => {
      if (!this.disposed) this.onEventChoice(choiceId);
    };
    this.driftingView.onBack = () => {
      if (!this.disposed) this.onDriftingItemBack?.();
    };
    this.driftingView.canUse = () => this.modalFocus.topmostModal() === this.driftingView.root;
    this.driftingView.onShow = () => this.showLayer(this.driftingView.root);
    this.driftingView.onHide = () => this.hideLayer(this.driftingView.root);
    this.journalView.onClose = () => {
      if (!this.disposed) this.onJournalClose();
    };
    this.journalView.onPage = () => {
      if (!this.disposed) this.onJournalPage();
    };
    this.modalViews.onRepairTarget = (instanceId) => this.chooseRepairTarget(instanceId);
    this.modalViews.onRepairCancel = () => this.closeRepairOptions();
    this.modalViews.onResume = () => {
      if (!this.disposed) this.onPauseChange(false);
    };
    this.modalViews.onRestart = () => {
      if (!this.disposed) this.onRestart();
    };

    document.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('resize', this.handleWindowResize);
  }

  render(snapshot: SurvivalSnapshot, unavailable: (action: DayActionId) => string | null): void {
    if (this.disposed) return;
    this.currentSnapshot = snapshot;
    const reasons = new Map<DayActionId, string | null>();
    DAY_ACTION_IDS.forEach((action) => reasons.set(action, unavailable(action)));
    this.hudView.render(snapshot, reasons);
    this.anchorView.render(snapshot, reasons);
    this.syncCommandState();
  }

  setAnchors(anchors: readonly BoatInteractionAnchor[]): void {
    if (this.disposed) return;
    this.anchorView.setAnchors(anchors);
    this.fishingView.refreshResultPlacement();
    this.positionOpenRoutineDialogs();
    this.syncCommandState();
  }

  setJournalUnread(unread: boolean): void {
    if (this.disposed) return;
    this.hudView.setJournalUnread(unread);
  }

  beginEventPresentation(): void {
    if (this.disposed) return;
    this.anchorView.beginEventPresentation();
    this.eventView.begin();
    this.syncCommandState();
  }

  showItemAnimationLab(): void {
    if (this.disposed) return;
    this.anchorView.setItemAnimationLabActive(true);
    this.eventView.showItemAnimationLab();
    this.syncCommandState();
  }

  showEventReveal(
    event: Pick<SurvivalEventDefinition, 'id' | 'revealText' | 'danger'>,
  ): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.anchorView.setItemAnimationLabActive(false);
    this.anchorView.setEventPresentationActive(true);
    const reveal = this.eventView.showReveal(event);
    this.syncCommandState();
    return reveal;
  }

  hideEventReveal(): void {
    if (this.disposed) return;
    this.eventView.hideReveal();
  }

  setEventSelection(
    eligible: ReadonlyMap<ItemInstanceId, EventResponseId>,
    contextualChoices: readonly EventContextChoice[] = [],
  ): void {
    if (this.disposed) return;
    this.anchorView.setEventSelection(eligible, contextualChoices);
    this.eventView.setSelection(contextualChoices);
    this.syncCommandState();
  }

  setEventUsing(instanceId: ItemInstanceId): void {
    if (this.disposed) return;
    this.anchorView.setEventUsing(instanceId);
    this.syncCommandState();
  }

  playEventChoiceBeat(choiceId: EventResponseId): Promise<void> {
    if (this.disposed || !this.eventView.isActive()) return Promise.resolve();
    const button = this.eventView.choiceButton(choiceId)
      ?? this.driftingView.choiceButton(choiceId)
      ?? this.anchorView.eventChoiceButton(choiceId)
      ?? null;
    const beat = this.eventView.playChoiceBeat(choiceId, button);
    if (this.eventView.selectedChoice() === choiceId) {
      if (button !== null && this.driftingView.containsChoice(button)) {
        this.driftingView.setSelectedChoice(choiceId);
      }
      this.anchorView.setEventChoiceSelection(choiceId);
    }
    this.syncCommandState();
    return beat;
  }

  clearEventPresentation(): void {
    if (this.disposed) return;
    let focusedContextualChoice = false;
    const result = runCleanupSteps([
      () => this.anchorView.clearEventPresentation(),
      () => this.eventView.settleChoiceBeat(),
      () => this.eventView.clearSleepMask(),
      () => this.coverView.clearBadSleepCueForCleanup(),
      () => { focusedContextualChoice = this.eventView.containsChoice(document.activeElement); },
      () => this.eventView.clearPresentationState(),
      () => this.syncCommandState(),
      () => { if (focusedContextualChoice) this.firstUsableAction()?.focus(); },
    ]);
    if (result.failed) throw result.firstError;
  }

  setEventSleepMask(eventId: string, visible: boolean): void {
    if (this.disposed) return;
    this.eventView.setSleepMask(eventId, visible);
  }

  showFeedback(outcome: Pick<ActionOutcome, 'accepted' | 'message'>): void {
    if (this.disposed) return;
    this.eventView.showFeedback(outcome);
  }

  setSleepCoverProfile(profile: SleepCoverProfile): Promise<void> {
    return this.disposed ? Promise.resolve() : this.coverView.setProfile(profile);
  }

  setBadSleepCue(visible: boolean): void {
    if (this.disposed) return;
    this.coverView.setBadSleepCue(visible);
  }

  setSleepCovered(covered: boolean): Promise<void> {
    return this.disposed ? Promise.resolve() : this.coverView.setCovered(covered);
  }

  holdDiveCovered(): Promise<void> {
    return this.disposed ? Promise.resolve() : this.coverView.holdDiveCovered();
  }

  showRewardResult(view: RewardResultView): Promise<void> {
    return this.disposed ? Promise.resolve() : this.coverView.showRewardResult(view);
  }

  hideRewardResult(): void {
    if (this.disposed) return;
    this.coverView.hideRewardResult();
  }

  settleCoveredScene(): Promise<void> {
    return this.disposed ? Promise.resolve() : this.coverView.settleCoveredScene();
  }

  setFishingState(state: FishingUiState): void {
    if (this.disposed) return;
    const previousMode = this.fishingView.mode();
    const modeChanged = state.mode !== previousMode;
    if (modeChanged && previousMode === 'hidden' && state.mode !== 'hidden') {
      this.fishingReturnTarget = this.latestCommandOrigin ?? this.resolveCommandOrigin();
    }
    if (!this.fishingView.setState(state)) return;

    if (state.mode === 'hidden') {
      const target = this.fishingReturnTarget;
      this.fishingReturnTarget = null;
      if (this.modalFocus.topmostModal() === null && !this.busy) this.restoreFishingFocus(target);
      return;
    }
    if (modeChanged) this.modalFocus.focusInitial(this.fishingView.interactionRoot);
  }

  showFishingResult(view: FishingResultView): void {
    if (!this.disposed) this.fishingView.showResult(view);
  }

  hideFishingResult(): void {
    if (!this.disposed) this.fishingView.hideResult();
  }

  showDriftingItemFocus(view: DriftingItemFocusView): void {
    if (!this.disposed) this.driftingView.show(view);
  }

  hideDriftingItemFocus(): void {
    if (!this.disposed) this.driftingView.hide();
  }

  updateDriftingItemFocusTarget(target: ProjectedBoatBounds | null): void {
    if (!this.disposed) this.driftingView.updateTarget(target);
  }

  setFishingViewExitVisible(visible: boolean): void {
    if (this.disposed) return;
    this.fishingView.setExitVisible(visible);
    this.root.dataset.fishingExitVisible = String(visible);
    if (visible) this.anchorView.clearHighlight();
  }

  setCameraTurnState(visible: boolean, rear: boolean): void {
    if (this.disposed) return;
    this.hudView.setCameraTurnState(visible, rear);
  }

  updateFishingBiteTarget(target: ProjectedBoatBounds | null): void {
    if (!this.disposed) this.fishingView.updateBiteTarget(target);
  }

  setFishingFade(covered: boolean): Promise<void> {
    return this.disposed ? Promise.resolve() : this.fishingView.setFade(covered);
  }

  holdSleep(): Promise<void> {
    return this.disposed ? Promise.resolve() : this.coverView.holdSleep();
  }

  holdEventOutcome(): Promise<void> {
    return this.disposed ? Promise.resolve() : this.coverView.holdEventOutcome();
  }

  settleForVisibilityChange(): void {
    if (this.disposed) return;
    const result = runCleanupSteps([
      () => this.eventView.settleForVisibilityChange(),
      () => this.coverView.settleForVisibilityChange(),
      () => this.fishingView.settleForVisibilityChange(),
    ]);
    if (result.failed) throw result.firstError;
  }

  showJournal(entries: readonly JournalEntry[]): void {
    if (this.disposed) return;
    this.journalView.show(entries);
    this.showLayer(this.journalView.root, this.hudView.journalControl());
  }

  hideJournal(): void {
    if (this.disposed) return;
    this.hideLayer(this.journalView.root, true);
  }

  setBusy(busy: boolean): void {
    if (this.disposed || this.busy === busy) return;
    this.busy = busy;
    if (busy) {
      this.root.setAttribute('aria-busy', 'true');
    } else {
      this.root.removeAttribute('aria-busy');
    }
    this.hudView.setBusy(busy);
    this.anchorView.setBusy(busy);
    this.eventView.setBusy(busy);
    this.driftingView.setBusy(busy);
    this.syncCommandState();
    if (!busy && this.modalFocus.topmostModal() === this.driftingView.root) {
      this.modalFocus.focusInitial(this.driftingView.root);
    }
  }

  setPaused(paused: boolean): void {
    if (this.disposed || paused === this.paused) return;
    if (paused) this.anchorView.setPaused(true);
    if (paused && !this.paused) {
      this.pauseReturnTarget = this.resolveCommandOrigin();
    }
    this.paused = paused;
    this.fishingView.setPaused(paused);
    this.hudView.setPaused(paused);
    if (!paused) this.anchorView.setPaused(false);
    if (paused) {
      this.showLayer(this.modalViews.pauseRoot);
    } else {
      this.hideLayer(this.modalViews.pauseRoot, true);
      const target = this.pauseReturnTarget;
      this.pauseReturnTarget = null;
      if (this.modalFocus.topmostModal() === null) this.restoreCommandFocus(target);
    }
  }

  showEnding(
    state: 'rescued' | 'dead' | 'sunk',
    _day: number,
    _seed: number,
    _scavengeElapsedSeconds: number,
    endingReason: SurvivalEndingReason = 'standard',
  ): void {
    if (this.disposed) return;
    this.clearEventPresentation();
    this.setPaused(false);
    this.modalViews.showEnding(state, endingReason);
    this.showLayer(this.modalViews.endingRoot);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const fishingWasVisible = this.fishingView.mode() !== 'hidden';
    const cleanupSteps: (() => void)[] = [
      () => { this.eventView.beginDispose(); },
      () => {
        this.coverView.beginDispose();
        this.coverView.clearBadSleepCueForCleanup();
      },
      () => { this.fishingView.beginDispose(); },
      () => { this.driftingView.beginDispose(); },
      () => { this.journalView.beginDispose(); },
      () => { this.modalViews.beginDispose(); },
      () => this.eventView.clearChoicesForDispose(),
      () => this.coverView.settleCoverTransition(),
      () => this.coverView.settleDiveHold(),
      () => this.coverView.settleRewardConfirmation(),
      () => this.fishingView.settleFade(),
      () => this.eventView.settleChoiceBeat(),
      () => this.coverView.settleEventOutcomeHold(),
      () => this.coverView.settleCoveredSceneWait(),
      () => this.coverView.settleSleepHold(),
      () => this.fishingView.cancelAnnouncementForDispose(),
      () => this.hideLayer(this.driftingView.root),
    ];
    if (fishingWasVisible) {
      cleanupSteps.push(
        () => this.hideLayer(this.fishingView.interactionRoot),
        () => this.fishingView.clearInteractionForDispose(),
        () => { this.fishingReturnTarget = null; },
      );
    }
    cleanupSteps.push(
      () => this.anchorView.dispose(),
      () => this.hudView.dispose(),
      () => this.modalFocus.dispose(),
      () => { this.announcementVersion += 1; },
      () => this.eventView.clearFeedbackTimerForDispose(),
      () => this.eventView.removeListenersForDispose(),
      () => this.coverView.removeListenersForDispose(),
      () => this.fishingView.removeListenersForDispose(),
      () => this.driftingView.removeListenersForDispose(),
      () => this.journalView.removeListenersForDispose(),
      () => this.modalViews.removeListenersForDispose(),
      () => document.removeEventListener('keydown', this.handleKeyDown),
      () => window.removeEventListener('resize', this.handleWindowResize),
      () => { this.onAction = () => undefined; },
      () => { this.onEventItem = () => undefined; },
      () => { this.onEventChoice = () => undefined; },
      () => { this.onRestart = () => undefined; },
      () => { this.onAnchorHighlight = () => undefined; },
      () => { this.onPauseChange = () => undefined; },
      () => { this.onJournalOpen = () => undefined; },
      () => { this.onJournalClose = () => undefined; },
      () => { this.onJournalPage = () => undefined; },
      () => { this.onFishingCast = null; },
      () => { this.onFishingReel = null; },
      () => { this.onFishingResultContinue = null; },
      () => { this.onFishingViewExit = null; },
      () => { this.onDriftingItemSelect = null; },
      () => { this.onDriftingItemBack = null; },
      () => { this.onCameraTurn = null; },
      () => this.eventView.resetCallbacksForDispose(),
      () => this.coverView.resetCallbacksForDispose(),
      () => this.fishingView.resetCallbacksForDispose(),
      () => this.driftingView.resetCallbacksForDispose(),
      () => this.journalView.resetCallbacksForDispose(),
      () => this.modalViews.resetCallbacksForDispose(),
      () => this.root.remove(),
    );
    const result = runCleanupSteps(cleanupSteps);
    if (result.failed) throw result.firstError;
  }

  private publishAnnouncement(message: string): void {
    if (this.disposed) return;
    const version = ++this.announcementVersion;
    this.announcer.textContent = '';
    queueMicrotask(() => {
      if (this.disposed || version !== this.announcementVersion) return;
      this.announcer.textContent = message;
    });
  }

  private syncCommandState(): void {
    this.modalViews.setRepairBusy(this.busy);
  }

  private readonly handleWindowResize = (): void => {
    if (this.disposed) return;
    this.positionOpenRoutineDialogs();
  };

  private showLayer(layer: HTMLElement, origin: HTMLElement | null = null): void {
    this.anchorView.clearHighlight();
    if (layer === this.modalViews.repairRoot) {
      this.positionRoutineDialog(layer, REPAIR_DIALOG_PLACEMENT);
    }
    this.modalFocus.activate(layer, origin);
    this.syncViewModalState();
  }

  private hideLayer(layer: HTMLElement, restore = false): void {
    this.modalFocus.deactivate(layer, restore);
    this.syncViewModalState();
  }

  private syncViewModalState(): void {
    const open = this.modalFocus.topmostModal() !== null;
    this.hudView.setModalOpen(open);
    this.anchorView.setModalOpen(open);
    this.eventView.setModalOpen(open);
  }

  private positionOpenRoutineDialogs(): void {
    if (this.modalViews.repairRoot.classList.contains('is-visible')) {
      this.positionRoutineDialog(this.modalViews.repairRoot, REPAIR_DIALOG_PLACEMENT);
    }
  }

  private positionRoutineDialog(
    layer: HTMLElement,
    placement: RoutineDialogPlacement,
    target: ProjectedBoatBounds | null = null,
  ): void {
    const rootBounds = this.root.getBoundingClientRect();
    const viewportWidth = Math.max(
      1,
      rootBounds.width || this.root.clientWidth || window.innerWidth,
    );
    const viewportHeight = Math.max(
      1,
      rootBounds.height || this.root.clientHeight || window.innerHeight,
    );
    const maximumWidth = Math.max(1, viewportWidth - ROUTINE_DIALOG_MARGIN * 2);
    const maximumHeight = Math.max(1, viewportHeight - ROUTINE_DIALOG_MARGIN * 2);
    const cardWidth = Math.min(placement.width, maximumWidth);
    const cardHeight = Math.min(placement.height, maximumHeight);
    const projectedTarget = target?.visible === true ? target : null;
    const projectedAnchor = projectedTarget
      ?? this.anchorView.anchor(placement.anchorId);
    const isProjected = projectedAnchor?.visible === true;
    const hitArea = isProjected
      ? projectedTarget ?? (
        projectedAnchor as BoatInteractionAnchor
      ).hitArea ?? { width: 54, height: 54, depth: 0 }
      : { width: 0, height: 0, depth: 0 };
    const anchorX = isProjected
      ? projectedAnchor.x
      : viewportWidth * placement.fallbackX;
    const anchorY = isProjected
      ? projectedAnchor.y
      : viewportHeight * placement.fallbackY;

    const rightX = anchorX + hitArea.width / 2 + ROUTINE_DIALOG_GAP;
    const leftX = anchorX - hitArea.width / 2 - ROUTINE_DIALOG_GAP - cardWidth;
    const fitsRight = rightX + cardWidth <= viewportWidth - ROUTINE_DIALOG_MARGIN;
    const fitsLeft = leftX >= ROUTINE_DIALOG_MARGIN;
    const horizontalPlacement = fitsRight || !fitsLeft ? 'right' : 'left';
    const unclampedX = horizontalPlacement === 'right' ? rightX : leftX;

    const centeredY = anchorY - cardHeight / 2;
    const belowY = anchorY + hitArea.height / 2 + ROUTINE_DIALOG_GAP;
    const aboveY = anchorY - hitArea.height / 2 - ROUTINE_DIALOG_GAP - cardHeight;
    const fitsCentered = centeredY >= ROUTINE_DIALOG_MARGIN
      && centeredY + cardHeight <= viewportHeight - ROUTINE_DIALOG_MARGIN;
    const fitsBelow = belowY + cardHeight <= viewportHeight - ROUTINE_DIALOG_MARGIN;
    const fitsAbove = aboveY >= ROUTINE_DIALOG_MARGIN;
    const verticalPlacement = fitsCentered
      ? 'center'
      : fitsBelow ? 'below'
        : fitsAbove ? 'above' : anchorY < viewportHeight / 2 ? 'below' : 'above';
    const unclampedY = verticalPlacement === 'center'
      ? centeredY
      : verticalPlacement === 'below' ? belowY : aboveY;

    const x = Math.min(
      viewportWidth - ROUTINE_DIALOG_MARGIN - cardWidth,
      Math.max(ROUTINE_DIALOG_MARGIN, unclampedX),
    );
    const y = Math.min(
      viewportHeight - ROUTINE_DIALOG_MARGIN - cardHeight,
      Math.max(ROUTINE_DIALOG_MARGIN, unclampedY),
    );
    layer.style.setProperty('--routine-x', `${Math.round(x)}px`);
    layer.style.setProperty('--routine-y', `${Math.round(y)}px`);
    layer.style.setProperty('--routine-width', `${Math.round(cardWidth)}px`);
    layer.dataset.placement = horizontalPlacement;
    layer.dataset.verticalPlacement = verticalPlacement;
    layer.dataset.anchorState = isProjected ? 'projected' : 'fallback';
  }

  private activateDayAction(action: DayActionId, origin: HTMLButtonElement | null): void {
    if (this.disposed) return;
    this.latestCommandOrigin = origin;
    if (action === 'repairItem') {
      this.openRepairOptions();
      return;
    }
    this.onAction(action, undefined);
  }

  private openRepairOptions(): void {
    const snapshot = this.currentSnapshot;
    if (snapshot === null) return;
    const targets = Object.values(snapshot.inventory).filter((
      item,
    ): item is Readonly<SurvivalItemState> => (
      item !== undefined
      && item.condition === 'broken'
      && ITEM_DEFINITIONS[item.type].breakable
    ));
    this.modalViews.showRepairOptions(targets);
    this.showLayer(this.modalViews.repairRoot);
  }

  private chooseRepairTarget(target: ItemInstanceId): void {
    if (this.disposed) return;
    this.hideLayer(this.modalViews.repairRoot);
    this.onAction('repairItem', { kind: 'itemRepair', target });
    if (this.modalFocus.topmostModal() === null) this.restoreCommandFocus(this.latestCommandOrigin);
  }

  private closeRepairOptions(): void {
    if (this.disposed) return;
    this.hideLayer(this.modalViews.repairRoot);
    this.restoreCommandFocus(this.latestCommandOrigin);
  }

  private isUsableCommand(element: HTMLElement | null): element is HTMLElement {
    return this.isFocusableCommand(element)
      && element.getAttribute('aria-disabled') !== 'true';
  }

  private isFocusableCommand(element: HTMLElement | null): element is HTMLElement {
    return element !== null
      && element.isConnected
      && !element.hidden
      && element.closest('[hidden], [inert], [aria-hidden="true"]') === null
      && (!(element instanceof HTMLButtonElement) || !element.disabled);
  }

  private isCommandControl(element: Element | null): element is HTMLButtonElement {
    return element instanceof HTMLButtonElement && element.hasAttribute('data-action');
  }

  private firstUsableAction(): HTMLButtonElement | null {
    return this.anchorView.firstUsableCommand()
      ?? (this.eventView.isActive()
        ? this.eventView.choiceButtonsInOrder()
          .find((button) => this.isUsableCommand(button))
        : null)
      ?? null;
  }

  private resolveCommandOrigin(): HTMLElement | null {
    const active = document.activeElement;
    if (this.isUsableCommand(this.latestCommandOrigin)) return this.latestCommandOrigin;
    if (this.isCommandControl(active) && this.isUsableCommand(active)) return active;
    return this.firstUsableAction();
  }

  restoreCommandFocus(target: HTMLElement | null = this.latestCommandOrigin): void {
    if (this.disposed) return;
    const replacementAnchor = this.anchorView.replacementButton(target);
    const destination = this.isUsableCommand(target)
      ? target
      : this.isUsableCommand(replacementAnchor)
        ? replacementAnchor
        : this.firstUsableAction();
    this.latestCommandOrigin = null;
    destination?.focus();
  }

  private restoreFishingFocus(target: HTMLElement | null): void {
    if (this.disposed) return;
    const replacementAnchor = this.anchorView.replacementButton(target);
    const destination = this.isFocusableCommand(target)
      ? target
      : this.isFocusableCommand(replacementAnchor)
        ? replacementAnchor
        : this.firstUsableAction();
    this.latestCommandOrigin = null;
    destination?.focus();
  }

  private trapEventFocus(event: KeyboardEvent): boolean {
    if (event.key !== 'Tab' || !this.eventView.isActive()) return false;
    const controls = [
      ...this.anchorView.anchorButtonsInOrder(),
      ...this.eventView.choiceButtonsInOrder(),
    ].filter((element) => this.isFocusableCommand(element));
    if (controls.length === 0) return false;
    const first = controls[0]!;
    const last = controls[controls.length - 1]!;
    const active = document.activeElement;
    const activeIsControl = active instanceof HTMLButtonElement && controls.includes(active);
    if (event.shiftKey && (active === first || !activeIsControl)) {
      event.preventDefault();
      last.focus();
      return true;
    }
    if (!event.shiftKey && (active === last || !activeIsControl)) {
      event.preventDefault();
      first.focus();
      return true;
    }
    return false;
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (this.disposed || event.defaultPrevented || event.repeat) return;
    if (this.anchorView.handleCarlitosEscape(event)) return;
    const topmostModal = this.modalFocus.topmostModal();
    if (this.modalFocus.handleKeyDown(event)) return;
    if (this.trapEventFocus(event)) return;
    if (event.key === 'Escape') {
      if (topmostModal === this.journalView.root) {
        event.preventDefault();
        this.onJournalClose();
      } else if (topmostModal === this.modalViews.repairRoot) {
        event.preventDefault();
        this.closeRepairOptions();
      } else {
        event.preventDefault();
        this.onPauseChange(!this.paused);
      }
      return;
    }
    if (topmostModal === this.fishingView.interactionRoot) {
      this.fishingView.handleKeyDown(event);
      return;
    }
    if (this.anchorView.handleCommandKeyDown(event)) return;
    if (this.eventView.handleKeyDown(event)) return;
    if (topmostModal === this.driftingView.root) this.driftingView.handleKeyDown(event);
  };
}
