import { onLanguageChange } from '../i18n/language';
import {
  ITEM_DEFINITIONS,
  type ItemInstanceId,
} from '../game/ItemState';
import type { EndingRecord } from '../game/ending';
import type { JournalEntry } from '../survival/journalRecords';
import type { BoatInteractionAnchor, ProjectedBoatBounds } from '../survival/BoatInteraction';
import type { InspectableEventId } from '../survival/eventCatalog';
import type {
  DayActionId,
  DayActionOption,
  EventResponseId,
  SurvivalEventDefinition,
  SurvivalItemState,
} from '../survival/survivalTypes';
import type { SurvivalSnapshot } from '../survival/survivalSnapshot';
import { createElementRequirement } from './dom';
import { BoatAnchorView } from './BoatAnchorView';
import { FocusedEventView } from './FocusedEventView';
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
import {
  DAY_ACTION_IDS,
  type EventContextChoice,
  type FocusedEventChoiceSelection,
  type FocusedEventFocusView,
} from './SurvivalUiViewModel';
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

interface RoutineDialogTarget {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly projected: boolean;
}

function routineDialogViewport(root: HTMLElement): readonly [number, number] {
  const bounds = root.getBoundingClientRect();
  const width = Math.max(1, bounds.width || root.clientWidth || window.innerWidth);
  const height = Math.max(1, bounds.height || root.clientHeight || window.innerHeight);
  return [width, height];
}

function routineDialogTarget(
  target: ProjectedBoatBounds | null,
  anchor: BoatInteractionAnchor | null | undefined,
  placement: RoutineDialogPlacement,
  viewportWidth: number,
  viewportHeight: number,
): RoutineDialogTarget {
  const projectedTarget = target?.visible === true ? target : null;
  const projectedAnchor = projectedTarget ?? anchor;
  if (projectedAnchor?.visible !== true) {
    return {
      x: viewportWidth * placement.fallbackX,
      y: viewportHeight * placement.fallbackY,
      width: 0,
      height: 0,
      projected: false,
    };
  }
  const hitArea = projectedTarget ?? (projectedAnchor as BoatInteractionAnchor).hitArea;
  return {
    x: projectedAnchor.x,
    y: projectedAnchor.y,
    width: hitArea?.width ?? 54,
    height: hitArea?.height ?? 54,
    projected: true,
  };
}

function routineDialogHorizontal(
  target: RoutineDialogTarget,
  cardWidth: number,
  viewportWidth: number,
): readonly ['left' | 'right', number] {
  const right = target.x + target.width / 2 + ROUTINE_DIALOG_GAP;
  const left = target.x - target.width / 2 - ROUTINE_DIALOG_GAP - cardWidth;
  const rightFits = right + cardWidth <= viewportWidth - ROUTINE_DIALOG_MARGIN;
  const leftFits = left >= ROUTINE_DIALOG_MARGIN;
  return rightFits || !leftFits ? ['right', right] : ['left', left];
}

function routineDialogVertical(
  target: RoutineDialogTarget,
  cardHeight: number,
  viewportHeight: number,
): readonly ['above' | 'below' | 'center', number] {
  const centered = target.y - cardHeight / 2;
  const below = target.y + target.height / 2 + ROUTINE_DIALOG_GAP;
  const above = target.y - target.height / 2 - ROUTINE_DIALOG_GAP - cardHeight;
  const centeredFits = centered >= ROUTINE_DIALOG_MARGIN
    && centered + cardHeight <= viewportHeight - ROUTINE_DIALOG_MARGIN;
  if (centeredFits) return ['center', centered];
  if (below + cardHeight <= viewportHeight - ROUTINE_DIALOG_MARGIN) return ['below', below];
  if (above >= ROUTINE_DIALOG_MARGIN) return ['above', above];
  return target.y < viewportHeight / 2 ? ['below', below] : ['above', above];
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
  onReturnToMenu: () => void = () => undefined;
  onAnchorHighlight: (anchorId: string | null) => void = () => undefined;
  onPauseChange: (paused: boolean) => void = () => undefined;
  onJournalOpen: () => void = () => undefined;
  onJournalClose: () => void = () => undefined;
  onJournalPage: () => void = () => undefined;
  onRadioPauseChange: (paused: boolean) => void = () => undefined;
  onFishingCast: ((point: { readonly x: number; readonly y: number } | null) => boolean) | null = null;
  onFishingReel: (() => boolean) | null = null;
  onFishingResultContinue: (() => void) | null = null;
  onFishingViewExit: (() => void) | null = null;
  onFocusedEventSelect: ((eventId: InspectableEventId) => void) | null = null;
  onFocusedEventChoice: ((choice: FocusedEventChoiceSelection) => void) | null = null;
  onFocusedEventBack: (() => void) | null = null;
  onCameraTurn: (() => void) | null = null;

  private readonly root: HTMLDivElement;
  private readonly hudView: SurvivalHudView;
  private readonly anchorView: BoatAnchorView;
  private readonly eventView: SurvivalEventView;
  private readonly coverView: SurvivalCoverView;
  private readonly fishingView: SurvivalFishingView;
  private readonly focusedEventView: FocusedEventView;
  private readonly journalView: SurvivalJournalView;
  private readonly modalViews: SurvivalModalViews;
  private readonly announcer: HTMLElement;
  private readonly modalFocus: ModalFocusManager;
  private busy = false;
  private paused = false;
  private disposed = false;
  private endingStarted = false;
  private announcementVersion = 0;
  private journalRadioPause = false;
  private carlitosRadioPause = false;
  private pauseReturnTarget: HTMLElement | null = null;
  private fishingReturnTarget: HTMLElement | null = null;
  private latestCommandOrigin: HTMLButtonElement | null = null;
  private currentSnapshot: SurvivalSnapshot | null = null;
  private currentUnavailable: ((action: DayActionId) => string | null) | null = null;
  private readonly unsubscribeLanguage: () => void;

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
    this.focusedEventView = new FocusedEventView(this.root);
    this.journalView = new SurvivalJournalView();
    this.modalViews = new SurvivalModalViews();
    const announcer = requireElement<HTMLElement>(this.root, '[data-survival-announcer]');
    announcer.after(
      ...this.coverView.roots,
      this.eventView.sleepMask,
    );
    this.root.append(
      ...this.hudView.roots,
      ...this.anchorView.roots,
      ...this.fishingView.roots,
      this.focusedEventView.root,
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
      this.focusedEventView.root,
      this.fishingView.resultRoot,
      this.fishingView.interactionRoot,
    ];
    this.modalFocus = new ModalFocusManager(
      [
        this.hudView.topControls,
        this.hudView.cameraReturn,
        this.anchorView.anchorLayer,
      ],
      modalLayers,
      new Map<HTMLElement, ModalInitialFocus>([
        [this.modalViews.pauseRoot, this.modalViews.resumeButton],
        [this.journalView.root, this.journalView.title],
        [this.modalViews.repairRoot, this.modalViews.repairTitle],
        [this.modalViews.endingRoot, () => this.modalViews.endingInitialFocus()],
        [this.coverView.resultRoot, this.coverView.resultClose],
        [this.focusedEventView.root, () => this.focusedEventView.initialFocus()],
        [this.fishingView.resultRoot, this.fishingView.resultContinue],
        [this.fishingView.interactionRoot, () => this.fishingView.initialFocus()],
      ]),
      (layer) => layer !== this.fishingView.interactionRoot || this.fishingView.mode() !== 'ready',
    );
    this.modalFocus.sync();

    this.hudView.onJournal = () => {
      if (!this.disposed) this.onJournalOpen();
    };
    this.hudView.onCameraTurn = () => {
      if (!this.disposed) this.onCameraTurn?.();
    };
    this.anchorView.onAction = (action, origin) => this.activateDayAction(action, origin);
    this.anchorView.onEventItem = (choiceId, instanceId) => {
      if (!this.disposed) this.onEventItem(choiceId, instanceId);
    };
    this.anchorView.onEventChoice = (choiceId) => {
      if (!this.disposed) this.onEventChoice(choiceId);
    };
    this.anchorView.onEventFocus = (eventId) => {
      if (!this.disposed) this.onFocusedEventSelect?.(eventId);
    };
    this.anchorView.onHighlight = (anchorId) => {
      if (!this.disposed) this.onAnchorHighlight(anchorId);
    };
    this.anchorView.onCarlitosCardChange = (open) => {
      if (this.disposed || this.carlitosRadioPause === open) return;
      this.carlitosRadioPause = open;
      this.syncRadioPause();
    };
    this.eventView.onChoice = (choiceId) => {
      if (!this.disposed) this.onEventChoice(choiceId);
    };
    this.eventView.onAnnouncement = () => this.publishAnnouncement();
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
      !(this.fishingView.mode() === 'ready' && this.busy)
      && this.modalFocus.topmostModal() === (
        this.fishingView.mode() === 'ready' ? null : this.fishingView.interactionRoot
      )
    );
    this.fishingView.canUseResult = () => (
      this.modalFocus.topmostModal() === this.fishingView.resultRoot
    );
    this.fishingView.onInteractionShow = () => this.showLayer(this.fishingView.interactionRoot);
    this.fishingView.onInteractionHide = () => this.hideLayer(this.fishingView.interactionRoot);
    this.fishingView.onResultShow = () => this.showLayer(this.fishingView.resultRoot);
    this.fishingView.onResultHide = () => this.hideLayer(this.fishingView.resultRoot);
    this.focusedEventView.onChoice = (choice) => {
      if (!this.disposed) this.onFocusedEventChoice?.(choice);
    };
    this.focusedEventView.onBack = () => {
      if (!this.disposed) this.onFocusedEventBack?.();
    };
    this.focusedEventView.canUse = () => this.modalFocus.topmostModal() === this.focusedEventView.root;
    this.focusedEventView.onShow = () => this.showLayer(this.focusedEventView.root);
    this.focusedEventView.onHide = () => this.hideLayer(this.focusedEventView.root);
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
    this.modalViews.onReturnToMenu = () => {
      if (!this.disposed) this.onReturnToMenu();
    };
    this.modalViews.onEndingReady = () => {
      if (!this.disposed) this.modalFocus.focusInitial(this.modalViews.endingRoot);
    };

    document.addEventListener('click', this.handleDocumentClick, true);
    document.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('resize', this.handleWindowResize);
    this.unsubscribeLanguage = onLanguageChange(() => {
      this.refreshAnnouncement();
      if (this.currentSnapshot !== null && this.currentUnavailable !== null) {
        this.render(this.currentSnapshot, this.currentUnavailable);
      }
    });
  }

  render(snapshot: SurvivalSnapshot, unavailable: (action: DayActionId) => string | null): void {
    if (this.disposed) return;
    this.currentSnapshot = snapshot;
    this.currentUnavailable = unavailable;
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

  showItemAnimationLabChoices(
    choices: readonly EventContextChoice[],
  ): void {
    if (this.disposed) return;
    this.eventView.showItemAnimationLabChoices(choices);
    this.syncCommandState();
  }

  hideItemAnimationLabChoices(): void {
    if (this.disposed) return;
    const focusedChoice = this.eventView.containsChoice(document.activeElement);
    this.eventView.hideItemAnimationLabChoices();
    this.syncCommandState();
    if (focusedChoice) this.firstUsableAction()?.focus();
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
      ?? this.focusedEventView.choiceButton(choiceId)
      ?? this.anchorView.eventChoiceButton(choiceId)
      ?? null;
    const beat = this.eventView.playChoiceBeat(choiceId, button);
    if (this.eventView.selectedChoice() === choiceId) {
      if (button !== null && this.focusedEventView.containsChoice(button)) {
        this.focusedEventView.setSelectedChoice(choiceId);
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
      () => this.refreshAnnouncement(),
      () => this.syncCommandState(),
      () => { if (focusedContextualChoice) this.firstUsableAction()?.focus(); },
    ]);
    if (result.failed) throw result.firstError;
  }

  setEventSleepMask(eventId: string, visible: boolean): void {
    if (this.disposed) return;
    this.eventView.setSleepMask(eventId, visible);
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

  showFocusedEvent(view: FocusedEventFocusView): void {
    if (!this.disposed) this.focusedEventView.show(view);
  }

  hideFocusedEvent(): void {
    if (!this.disposed) this.focusedEventView.hide();
  }

  updateFocusedEventTarget(target: ProjectedBoatBounds | null): void {
    if (!this.disposed) this.focusedEventView.updateTarget(target);
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
    if (!this.journalRadioPause) {
      this.journalRadioPause = true;
      this.syncRadioPause();
    }
  }

  hideJournal(): void {
    if (this.disposed) return;
    this.hideLayer(this.journalView.root, true);
    if (this.journalRadioPause) {
      this.journalRadioPause = false;
      this.syncRadioPause();
    }
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
    this.focusedEventView.setBusy(busy);
    this.syncCommandState();
    if (!busy && this.modalFocus.topmostModal() === this.focusedEventView.root) {
      this.modalFocus.focusInitial(this.focusedEventView.root);
    }
  }

  setPaused(paused: boolean): void {
    if (this.disposed || paused === this.paused) return;
    this.modalViews.resetPauseActions();
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

  showEnding(record: Exclude<EndingRecord, { id: 'dorothy' }>): void {
    if (this.disposed || this.endingStarted) return;
    this.endingStarted = true;
    this.clearEventPresentation();
    this.setPaused(false);
    this.hideJournal();
    this.hideLayer(this.modalViews.repairRoot);
    this.modalViews.showEnding(record, this.currentSnapshot);
    this.showLayer(this.modalViews.endingRoot);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribeLanguage();
    const fishingWasVisible = this.fishingView.mode() !== 'hidden';
    const cleanupSteps: (() => void)[] = [
      () => { this.eventView.beginDispose(); },
      () => {
        this.coverView.beginDispose();
        this.coverView.clearBadSleepCueForCleanup();
      },
      () => { this.fishingView.beginDispose(); },
      () => { this.focusedEventView.beginDispose(); },
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
      () => this.hideLayer(this.focusedEventView.root),
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
      () => this.eventView.removeListenersForDispose(),
      () => this.coverView.removeListenersForDispose(),
      () => this.fishingView.removeListenersForDispose(),
      () => this.focusedEventView.removeListenersForDispose(),
      () => this.journalView.removeListenersForDispose(),
      () => this.modalViews.removeListenersForDispose(),
      () => document.removeEventListener('click', this.handleDocumentClick, true),
      () => document.removeEventListener('keydown', this.handleKeyDown),
      () => window.removeEventListener('resize', this.handleWindowResize),
      () => { this.onAction = () => undefined; },
      () => { this.onEventItem = () => undefined; },
      () => { this.onEventChoice = () => undefined; },
      () => { this.onRestart = () => undefined; },
      () => { this.onReturnToMenu = () => undefined; },
      () => { this.onAnchorHighlight = () => undefined; },
      () => { this.onPauseChange = () => undefined; },
      () => { this.onJournalOpen = () => undefined; },
      () => { this.onJournalClose = () => undefined; },
      () => { this.onJournalPage = () => undefined; },
      () => { this.onRadioPauseChange = () => undefined; },
      () => { this.onFishingCast = null; },
      () => { this.onFishingReel = null; },
      () => { this.onFishingResultContinue = null; },
      () => { this.onFishingViewExit = null; },
      () => { this.onFocusedEventSelect = null; },
      () => { this.onFocusedEventChoice = null; },
      () => { this.onFocusedEventBack = null; },
      () => { this.onCameraTurn = null; },
      () => this.eventView.resetCallbacksForDispose(),
      () => this.coverView.resetCallbacksForDispose(),
      () => this.fishingView.resetCallbacksForDispose(),
      () => this.focusedEventView.resetCallbacksForDispose(),
      () => this.journalView.resetCallbacksForDispose(),
      () => this.modalViews.resetCallbacksForDispose(),
      () => this.root.remove(),
    );
    const result = runCleanupSteps(cleanupSteps);
    if (result.failed) throw result.firstError;
  }

  private publishAnnouncement(): void {
    if (this.disposed) return;
    const version = ++this.announcementVersion;
    this.announcer.textContent = '';
    queueMicrotask(() => {
      if (this.disposed || version !== this.announcementVersion) return;
      this.refreshAnnouncement();
    });
  }

  private refreshAnnouncement(): void {
    if (this.disposed) return;
    const message = this.eventView.announcementText();
    if (this.announcer.textContent !== message) this.announcer.textContent = message;
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

  private syncRadioPause(): void {
    this.onRadioPauseChange(this.journalRadioPause || this.carlitosRadioPause);
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
    const [viewportWidth, viewportHeight] = routineDialogViewport(this.root);
    const maximumWidth = Math.max(1, viewportWidth - ROUTINE_DIALOG_MARGIN * 2);
    const maximumHeight = Math.max(1, viewportHeight - ROUTINE_DIALOG_MARGIN * 2);
    const cardWidth = Math.min(placement.width, maximumWidth);
    const cardHeight = Math.min(placement.height, maximumHeight);
    const dialogTarget = routineDialogTarget(
      target,
      this.anchorView.anchor(placement.anchorId),
      placement,
      viewportWidth,
      viewportHeight,
    );
    const [horizontalPlacement, unclampedX] = routineDialogHorizontal(
      dialogTarget,
      cardWidth,
      viewportWidth,
    );
    const [verticalPlacement, unclampedY] = routineDialogVertical(
      dialogTarget,
      cardHeight,
      viewportHeight,
    );

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
    layer.dataset.anchorState = dialogTarget.projected ? 'projected' : 'fallback';
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

  private readonly handleDocumentClick = (event: MouseEvent): void => {
    const caption = this.eventView.caption;
    if (
      this.disposed
      || caption.dataset.eventId !== 'item-animation-lab'
      || !caption.classList.contains('is-visible')
      || !(event.target instanceof Node)
      || caption.contains(event.target)
    ) return;
    this.hideItemAnimationLabChoices();
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (this.disposed || event.defaultPrevented || event.repeat) return;
    if (this.anchorView.handleCarlitosEscape(event)) return;
    const topmostModal = this.modalFocus.topmostModal();
    if (this.modalFocus.handleKeyDown(event)) return;
    if (this.trapEventFocus(event)) return;
    if (this.handleEscape(event, topmostModal)) return;
    if (this.handleFishingKeyDown(event, topmostModal)) return;
    if (this.anchorView.handleCommandKeyDown(event)) return;
    if (this.eventView.handleKeyDown(event)) return;
    if (topmostModal === this.focusedEventView.root) this.focusedEventView.handleKeyDown(event);
  };

  private handleEscape(event: KeyboardEvent, topmostModal: HTMLElement | null): boolean {
    if (event.key !== 'Escape') return false;
    event.preventDefault();
    if (topmostModal === this.journalView.root) {
      this.onJournalClose();
      return true;
    }
    if (topmostModal === this.modalViews.repairRoot) {
      this.closeRepairOptions();
      return true;
    }
    this.onPauseChange(!this.paused);
    return true;
  }

  private handleFishingKeyDown(event: KeyboardEvent, topmostModal: HTMLElement | null): boolean {
    if (topmostModal !== this.fishingView.interactionRoot) return false;
    this.fishingView.handleKeyDown(event);
    return true;
  }
}
