import {
  ITEM_DEFINITIONS,
  ITEM_LABELS,
  type ItemInstanceId,
} from '../game/ItemState';
import { formatJournalEntry } from '../survival/journal';
import type { JournalEntry } from '../survival/journalRecords';
import type { BoatInteractionAnchor, ProjectedBoatBounds } from '../survival/BoatInteraction';
import type { DriftingItemEventId } from '../survival/eventCatalog';
import type {
  ActionOutcome,
  DayActionId,
  DayActionOption,
  EventResponseId,
  ResourceDelta,
  SurvivalEventDefinition,
  SurvivalEndingReason,
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
  private readonly announcer: HTMLElement;
  private readonly repairOptionsLayer: HTMLElement;
  private readonly repairOptionsTitle: HTMLElement;
  private readonly repairTargets: HTMLElement;
  private readonly pauseLayer: HTMLElement;
  private readonly resumeButton: HTMLButtonElement;
  private readonly journalLayer: HTMLElement;
  private readonly journalTitle: HTMLElement;
  private readonly journalWeather: HTMLElement;
  private readonly journalStory: HTMLElement;
  private readonly journalDay: HTMLElement;
  private readonly journalNight: HTMLElement;
  private readonly journalPageCount: HTMLElement;
  private readonly journalPrevious: HTMLButtonElement;
  private readonly journalNext: HTMLButtonElement;
  private readonly journalClose: HTMLButtonElement;
  private readonly endingLayer: HTMLElement;
  private readonly endingTitle: HTMLElement;
  private readonly restartButton: HTMLButtonElement;
  private readonly modalFocus: ModalFocusManager;
  private readonly lastValues = new Map<string, string | number | boolean | null>();
  private busy = false;
  private paused = false;
  private disposed = false;
  private announcementVersion = 0;
  private restartIssued = false;
  private pauseReturnTarget: HTMLElement | null = null;
  private fishingReturnTarget: HTMLElement | null = null;
  private latestCommandOrigin: HTMLButtonElement | null = null;
  private currentSnapshot: SurvivalSnapshot | null = null;
  private journalEntries: readonly JournalEntry[] = [];
  private journalIndex = 0;

  constructor(private readonly mount: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'survival-ui';
    this.root.innerHTML = `
      <div class="ui-treatment" aria-hidden="true"></div>
      <div class="survival-announcer" data-survival-announcer aria-live="polite" aria-atomic="true"></div>
      <section class="routine-dialog routine-dialog--repair" data-repair-options role="dialog" aria-modal="true" aria-hidden="true" aria-label="Repair target" inert>
        <div class="routine-dialog__card scuba-popup-paper">
          <p class="eyebrow ui-role-context">DUCT TAPE</p>
          <h2 class="scuba-popup-title ui-role-display" data-repair-options-title tabindex="-1">Choose an item to repair</h2>
          <p class="ui-role-narrative">One emergency repair restores one broken item.</p>
          <div class="repair-targets" data-repair-targets></div>
          <button type="button" class="secondary-action salvage-action ui-role-context" data-repair-cancel aria-label="Cancel repair">
            CANCEL
          </button>
        </div>
      </section>
      <section class="survival-overlay journal-overlay" data-journal role="dialog" aria-modal="true" aria-hidden="true" aria-label="Survival journal" inert>
        <div class="journal-book" data-journal-book>
          <div class="journal-book__cover" aria-hidden="true"></div>
          <div class="journal-book__rings" data-journal-rings aria-hidden="true"><i data-journal-ring></i><i data-journal-ring></i><i data-journal-ring></i></div>
          <div class="journal-book__tabs" data-journal-tabs aria-hidden="true"><i data-journal-tab></i><i data-journal-tab></i><i data-journal-tab></i><i data-journal-tab></i></div>
          <article class="journal-page">
            <button type="button" class="journal-page__close ui-role-context" data-journal-close aria-label="Close journal">&times;</button>
            <p class="journal-page__weather ui-role-context" data-journal-weather></p>
            <h2 class="ui-role-display" data-journal-title tabindex="-1"></h2>
            <div class="journal-page__story ui-role-narrative" data-journal-story>
              <section aria-labelledby="journal-day-label"><h3 id="journal-day-label">DAY</h3><p data-journal-day></p></section>
              <section aria-labelledby="journal-night-label"><h3 id="journal-night-label">NIGHT</h3><p data-journal-night></p></section>
            </div>
            <nav class="journal-page__navigation ui-role-context" aria-label="Journal pages">
              <button type="button" class="journal-page__edge-arrow journal-page__edge-arrow--previous ui-role-context" data-journal-previous aria-label="Previous journal page">&lsaquo;</button>
              <span class="journal-page__folio ui-role-numeral" data-journal-page-count>PAGE 0 OF 0</span>
              <button type="button" class="journal-page__edge-arrow journal-page__edge-arrow--next ui-role-context" data-journal-next aria-label="Next journal page">&rsaquo;</button>
            </nav>
          </article>
        </div>
      </section>
      <section class="survival-overlay pause-overlay cinematic-overlay scuba-popup-overlay" data-pause role="dialog" aria-modal="true" aria-hidden="true" aria-label="Survival paused" inert>
        <div class="cinematic-overlay__content scuba-popup-paper scuba-popup-panel">
          <p class="eyebrow ui-role-context">PAUSED</p>
          <h2 class="scuba-popup-title ui-role-display">Hold Fast</h2>
          <p class="ui-role-narrative">The sea will wait until you return.</p>
          <button type="button" class="primary-action salvage-action ui-role-context" data-resume aria-label="Resume">
            RESUME
          </button>
        </div>
      </section>
      <section class="survival-overlay ending-overlay cinematic-overlay scuba-popup-overlay" data-ending role="dialog" aria-modal="true" aria-hidden="true" aria-label="Journey ended" inert>
        <div class="cinematic-overlay__content scuba-popup-paper scuba-popup-panel">
          <h2 class="scuba-popup-title ui-role-display" data-ending-title tabindex="-1" role="alert"></h2>
          <button type="button" class="primary-action salvage-action ui-role-context" data-restart aria-label="Start from the ship">
            START FROM THE SHIP
          </button>
        </div>
      </section>
    `;
    mount.append(this.root);

    this.eventView = new SurvivalEventView();
    this.coverView = new SurvivalCoverView();
    this.hudView = new SurvivalHudView();
    this.anchorView = new BoatAnchorView(this.root);
    this.fishingView = new SurvivalFishingView(
      this.mount,
      this.root,
      () => this.anchorView.anchor('fishing-tools'),
    );
    this.driftingView = new DriftingItemView(this.root);
    const announcer = requireElement<HTMLElement>(this.root, '[data-survival-announcer]');
    announcer.after(
      this.eventView.feedback,
      ...this.coverView.roots,
      this.eventView.sleepMask,
    );
    const firstFollowingView = requireElement(this.root, '[data-repair-options]');
    firstFollowingView.before(
      ...this.hudView.roots,
      ...this.anchorView.roots,
      ...this.fishingView.roots,
      this.driftingView.root,
    );
    const journal = requireElement(this.root, '[data-journal]');
    journal.before(this.eventView.caption);

    this.announcer = announcer;
    this.repairOptionsLayer = requireElement(this.root, '[data-repair-options]');
    this.repairOptionsTitle = requireElement(this.root, '[data-repair-options-title]');
    this.repairTargets = requireElement(this.root, '[data-repair-targets]');
    this.pauseLayer = requireElement(this.root, '[data-pause]');
    this.resumeButton = requireElement(this.root, '[data-resume]');
    this.journalLayer = requireElement(this.root, '[data-journal]');
    this.journalTitle = requireElement(this.root, '[data-journal-title]');
    this.journalWeather = requireElement(this.root, '[data-journal-weather]');
    this.journalStory = requireElement(this.root, '[data-journal-story]');
    this.journalDay = requireElement(this.root, '[data-journal-day]');
    this.journalNight = requireElement(this.root, '[data-journal-night]');
    this.journalPageCount = requireElement(this.root, '[data-journal-page-count]');
    this.journalPrevious = requireElement(this.root, '[data-journal-previous]');
    this.journalNext = requireElement(this.root, '[data-journal-next]');
    this.journalClose = requireElement(this.root, '[data-journal-close]');
    this.endingLayer = requireElement(this.root, '[data-ending]');
    this.endingTitle = requireElement(this.root, '[data-ending-title]');
    this.restartButton = requireElement(this.root, '[data-restart]');
    const modalLayers = [
      this.pauseLayer,
      this.journalLayer,
      this.repairOptionsLayer,
      this.endingLayer,
      this.coverView.resultRoot,
      this.driftingView.root,
      this.fishingView.resultRoot,
      this.fishingView.interactionRoot,
    ];
    this.modalFocus = new ModalFocusManager(
      [this.hudView.topControls, this.anchorView.anchorLayer],
      modalLayers,
      new Map<HTMLElement, ModalInitialFocus>([
        [this.pauseLayer, this.resumeButton],
        [this.journalLayer, this.journalTitle],
        [this.repairOptionsLayer, this.repairOptionsTitle],
        [this.endingLayer, this.endingTitle],
        [this.coverView.resultRoot, this.coverView.resultClose],
        [this.driftingView.root, () => this.driftingView.initialFocus()],
        [this.fishingView.resultRoot, this.fishingView.resultContinue],
        [this.fishingView.interactionRoot, () => this.fishingView.initialFocus()],
      ]),
    );
    this.modalFocus.sync();

    this.hudView.onJournal = () => this.onJournalOpen();
    this.hudView.onCameraTurn = () => this.onCameraTurn?.();
    this.anchorView.onAction = (action, origin) => this.activateDayAction(action, origin);
    this.anchorView.onUnavailableAction = (_action, reason) => {
      this.showFeedback({ accepted: false, message: reason });
    };
    this.anchorView.onEventItem = (choiceId, instanceId) => {
      this.onEventItem(choiceId, instanceId);
    };
    this.anchorView.onEventChoice = (choiceId) => this.onEventChoice(choiceId);
    this.anchorView.onEventFocus = (eventId) => this.onDriftingItemSelect?.(eventId);
    this.anchorView.onHighlight = (anchorId) => this.onAnchorHighlight(anchorId);
    this.eventView.onChoice = (choiceId) => this.onEventChoice(choiceId);
    this.eventView.onAnnouncement = (message) => this.publishAnnouncement(message);
    this.coverView.onResultShow = () => this.showLayer(this.coverView.resultRoot);
    this.coverView.onResultHide = () => this.hideLayer(this.coverView.resultRoot);
    this.coverView.onResultClose = () => {
      if (this.modalFocus.topmostModal() === this.coverView.resultRoot) {
        this.coverView.confirmRewardResult();
      }
    };
    this.fishingView.onCast = (point) => this.onFishingCast?.(point) ?? false;
    this.fishingView.onReel = () => this.onFishingReel?.() ?? false;
    this.fishingView.onContinue = () => this.onFishingResultContinue?.();
    this.fishingView.onExit = () => this.onFishingViewExit?.();
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
    this.driftingView.onChoice = (choiceId) => this.onEventChoice(choiceId);
    this.driftingView.onBack = () => this.onDriftingItemBack?.();
    this.driftingView.canUse = () => this.modalFocus.topmostModal() === this.driftingView.root;
    this.driftingView.onShow = () => this.showLayer(this.driftingView.root);
    this.driftingView.onHide = () => this.hideLayer(this.driftingView.root);

    this.root.addEventListener('click', this.handleClick);
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
    this.journalEntries = entries.map((entry) => ({
      ...entry,
      actions: entry.actions.map((action) => ({ ...action })),
      daytime: entry.daytime === null ? null : { ...entry.daytime },
      nighttime: entry.nighttime.kind === 'quiet'
        ? { kind: 'quiet' }
        : { kind: 'event', event: { ...entry.nighttime.event } },
    }));
    this.journalIndex = Math.max(0, this.journalEntries.length - 1);
    this.renderJournalPage();
    this.showLayer(this.journalLayer, this.hudView.journalControl());
  }

  hideJournal(): void {
    if (this.disposed) return;
    this.hideLayer(this.journalLayer, true);
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
      this.showLayer(this.pauseLayer);
    } else {
      this.hideLayer(this.pauseLayer, true);
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
    const title = endingReason === 'kidnapped'
      ? 'Taken in the dark.'
      : state === 'rescued'
      ? 'Rescue found you.'
      : state === 'dead'
        ? 'The sea outlasted you.'
        : 'Boat is gone.';
    this.clearEventPresentation();
    this.setPaused(false);
    this.updateText('ending:title', this.endingTitle, title);
    this.endingLayer.dataset.ending = state;
    this.restartIssued = false;
    this.restartButton.disabled = false;
    this.showLayer(this.endingLayer);
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
      () => this.root.removeEventListener('click', this.handleClick),
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
      () => this.root.remove(),
    );
    const result = runCleanupSteps(cleanupSteps);
    if (result.failed) throw result.firstError;
  }

  private renderJournalPage(): void {
    const entry = this.journalEntries[this.journalIndex];
    if (entry === undefined) {
      this.journalTitle.textContent = 'The journal is still waiting for its first completed day.';
      this.journalTitle.dataset.empty = 'true';
      this.journalWeather.textContent = '';
      this.journalStory.hidden = true;
      this.journalDay.textContent = '';
      this.journalNight.textContent = '';
      this.journalPageCount.textContent = 'PAGE 0 OF 0';
    } else {
      const page = formatJournalEntry(entry);
      this.journalTitle.textContent = page.heading;
      delete this.journalTitle.dataset.empty;
      this.journalWeather.textContent = page.weather;
      this.journalStory.hidden = false;
      this.journalDay.textContent = page.daytime;
      this.journalNight.textContent = page.nighttime;
      this.journalPageCount.textContent = `PAGE ${this.journalIndex + 1} OF ${this.journalEntries.length}`;
    }
    this.journalPrevious.disabled = this.journalIndex <= 0;
    this.journalNext.disabled = this.journalEntries.length === 0
      || this.journalIndex >= this.journalEntries.length - 1;
  }

  private moveJournalPage(delta: -1 | 1): void {
    const maximum = Math.max(0, this.journalEntries.length - 1);
    const previousIndex = this.journalIndex;
    this.journalIndex = Math.min(maximum, Math.max(0, this.journalIndex + delta));
    if (this.journalIndex !== previousIndex) this.onJournalPage();
    this.renderJournalPage();
    const requested = delta < 0 ? this.journalPrevious : this.journalNext;
    const available = delta < 0 ? this.journalNext : this.journalPrevious;
    (requested.disabled ? available : requested).focus();
  }

  private publishAnnouncement(message: string): void {
    const version = ++this.announcementVersion;
    this.announcer.textContent = '';
    queueMicrotask(() => {
      if (this.disposed || version !== this.announcementVersion) return;
      this.announcer.textContent = message;
    });
  }

  private updateText(key: string, element: HTMLElement, value: string): void {
    if (this.lastValues.get(key) === value) return;
    this.lastValues.set(key, value);
    element.textContent = value;
  }

  private syncCommandState(): void {
    this.repairTargets.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      button.disabled = this.busy;
    });
  }

  private readonly handleWindowResize = (): void => {
    if (this.disposed) return;
    this.positionOpenRoutineDialogs();
  };

  private showLayer(layer: HTMLElement, origin: HTMLElement | null = null): void {
    this.anchorView.clearHighlight();
    if (layer === this.repairOptionsLayer) this.positionRoutineDialog(layer, REPAIR_DIALOG_PLACEMENT);
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
  }

  private positionOpenRoutineDialogs(): void {
    if (this.repairOptionsLayer.classList.contains('is-visible')) {
      this.positionRoutineDialog(this.repairOptionsLayer, REPAIR_DIALOG_PLACEMENT);
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

  private overlayOpen(): boolean {
    return this.modalFocus.topmostModal() !== null;
  }

  private activateDayAction(action: DayActionId, origin: HTMLButtonElement | null): void {
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
    const targets = Object.values(snapshot.inventory).filter((item) => (
      item?.condition === 'broken' && ITEM_DEFINITIONS[item.type].breakable
    ));
    this.repairTargets.replaceChildren(...targets.map((item) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'event-item repair-target ui-role-context';
      button.dataset.repairTarget = item!.instanceId;
      button.textContent = `${ITEM_LABELS[item!.type]} — BROKEN`;
      button.setAttribute('aria-description', `Repair ${ITEM_LABELS[item!.type]} with Duct Tape.`);
      return button;
    }));
    this.showLayer(this.repairOptionsLayer);
  }

  private chooseRepairTarget(target: ItemInstanceId): void {
    this.hideLayer(this.repairOptionsLayer);
    this.onAction('repairItem', { kind: 'itemRepair', target });
    if (this.modalFocus.topmostModal() === null) this.restoreCommandFocus(this.latestCommandOrigin);
  }

  private closeRepairOptions(): void {
    this.hideLayer(this.repairOptionsLayer);
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

  private readonly handleClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (
      this.hudView.contains(target)
      || this.anchorView.contains(target)
      || this.eventView.contains(target)
      || this.coverView.contains(target)
      || this.fishingView.contains(target)
      || this.driftingView.root.contains(target)
    ) return;
    const topmostModal = this.modalFocus.topmostModal();
    if (
      topmostModal === this.journalLayer
      && this.journalLayer.contains(target)
      && target.closest('[data-journal-book]') === null
    ) {
      this.onJournalClose();
      return;
    }
    const button = target.closest<HTMLButtonElement>('button');
    if (!button || !this.root.contains(button) || button.disabled) return;
    if (topmostModal !== null && !topmostModal.contains(button)) return;

    if (button.hasAttribute('data-journal-previous')) {
      this.moveJournalPage(-1);
      return;
    }
    if (button.hasAttribute('data-journal-next')) {
      this.moveJournalPage(1);
      return;
    }
    if (button.hasAttribute('data-journal-close')) {
      this.onJournalClose();
      return;
    }
    const repairTarget = button.dataset.repairTarget as ItemInstanceId | undefined;
    if (repairTarget !== undefined && this.repairTargets.contains(button)) {
      this.chooseRepairTarget(repairTarget);
      return;
    }
    if (button.hasAttribute('data-repair-cancel')) {
      this.closeRepairOptions();
      return;
    }
    if (button.hasAttribute('data-resume')) this.onPauseChange(false);
    else if (button.hasAttribute('data-restart') && !this.restartIssued) {
      this.restartIssued = true;
      button.disabled = true;
      this.onRestart();
    }
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (this.disposed || event.defaultPrevented || event.repeat) return;
    if (this.anchorView.handleCarlitosEscape(event)) return;
    const topmostModal = this.modalFocus.topmostModal();
    if (this.modalFocus.handleKeyDown(event)) return;
    if (this.trapEventFocus(event)) return;
    if (event.key === 'Escape') {
      if (topmostModal === this.journalLayer) {
        event.preventDefault();
        this.onJournalClose();
      } else if (topmostModal === this.repairOptionsLayer) {
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
    const target = event.target;
    if (
      (this.eventView.isActive() || topmostModal === this.driftingView.root)
      && target instanceof Element
      && (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar')
    ) {
      const choice = target.closest<HTMLButtonElement>('[data-event-choice]');
      if (choice !== null && this.eventView.containsChoice(choice)) {
        event.preventDefault();
        this.eventView.activateChoice(choice);
        return;
      }
      if (choice !== null && this.driftingView.containsChoice(choice)) {
        event.preventDefault();
        this.driftingView.activateChoice(choice);
        return;
      }
    }
  };
}
