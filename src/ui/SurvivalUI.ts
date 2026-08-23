import {
  ITEM_DEFINITIONS,
  ITEM_LABELS,
  type ItemId,
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
  RewardSummary,
  SurvivalEventDefinition,
  SurvivalEndingReason,
  SurvivalSnapshot,
} from '../survival/survivalTypes';
import { createElementRequirement } from './dom';
import { BoatAnchorView } from './BoatAnchorView';
import { itemThumbnailUrl } from './itemThumbnailManifest';
import { ModalFocusManager, type ModalInitialFocus } from './ModalFocusManager';
import { SurvivalHudView } from './SurvivalHudView';
import { DAY_ACTION_IDS, type EventContextChoice } from './SurvivalUiViewModel';

function driftingCargoRewardItemId(reward: RewardSummary): ItemId {
  if (reward.kind === 'item') return reward.id;
  if (reward.id === 'food') return 'cannedFood';
  if (reward.id === 'bait') return 'baitTin';
  return 'ductTape';
}

const SLEEP_TRANSITION_MS = 2_500;
const SLEEP_HOLD_MS = 450;
const DIVE_TRANSITION_MS = 750;
const DIVE_COVERED_HOLD_MS = 250;
const FISHING_FADE_MS = 180;
const EVENT_CHOICE_BEAT_MS = 240;
const EVENT_OUTCOME_HOLD_MS = 2_000;
const ROUTINE_DIALOG_MARGIN = 20;
const ROUTINE_DIALOG_GAP = 22;
const DRIFTING_FOCUS_BOTTOM_RESERVE = 128;

interface RoutineDialogPlacement {
  readonly anchorId: string;
  readonly fallbackX: number;
  readonly fallbackY: number;
  readonly width: number;
  readonly height: number;
}

const ROUTINE_DIALOG_PLACEMENTS: Readonly<Record<'fishing' | 'repair', RoutineDialogPlacement>> = {
  fishing: {
    anchorId: 'fishing-tools',
    fallbackX: 0.7,
    fallbackY: 0.55,
    width: 360,
    height: 250,
  },
  repair: {
    anchorId: 'repair-tools',
    fallbackX: 0.32,
    fallbackY: 0.6,
    width: 430,
    height: 360,
  },
};

const requireElement = createElementRequirement('survival UI');

export type FishingUiMode = 'hidden' | 'aiming' | 'waiting' | 'bite' | 'result' | 'ready';
export type SleepCoverProfile = 'solid' | 'dive' | 'midnight-tour';

export interface RewardResultView {
  readonly title: 'DIVE RESULT' | 'CHEST REWARD';
  readonly reward: RewardSummary | null;
  readonly lines: readonly string[];
}

function diveRewardName(reward: RewardSummary): string {
  return ITEM_DEFINITIONS[driftingCargoRewardItemId(reward)].label;
}

export interface FishingUiState {
  readonly mode: FishingUiMode;
  readonly message: string;
  readonly biteTarget: ProjectedBoatBounds | null;
}

export interface FishingResultView {
  readonly caption: string;
  readonly title: string;
  readonly detail: string;
  readonly catchTarget: ProjectedBoatBounds | null;
}

export interface DriftingItemFocusView {
  readonly eventId: DriftingItemEventId;
  readonly title: string;
  readonly choices: readonly EventContextChoice[];
  readonly target: ProjectedBoatBounds | null;
}

interface PendingFade {
  readonly finish: () => void;
}

interface CleanupResult {
  readonly failed: boolean;
  readonly firstError: unknown;
}

function runCleanupSteps(cleanups: readonly (() => void)[]): CleanupResult {
  let failed = false;
  let firstError: unknown;
  cleanups.forEach((cleanup) => {
    try {
      cleanup();
    } catch (error) {
      if (!failed) {
        failed = true;
        firstError = error;
      }
    }
  });
  return { failed, firstError };
}

function settleAfterCleanup(
  resolve: () => void,
  cleanups: readonly (() => void)[],
): void {
  const result = runCleanupSteps(cleanups);
  resolve();
  if (result.failed) throw result.firstError;
}

function throwCleanupFailure(result: CleanupResult): void {
  if (result.failed) throw result.firstError;
}

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
  private readonly announcer: HTMLElement;
  private readonly feedback: HTMLElement;
  private readonly sleepCover: HTMLElement;
  private readonly badSleepCue: HTMLElement;
  private readonly diveResultLayer: HTMLElement;
  private readonly diveResultTitle: HTMLElement;
  private readonly diveResultRewards: HTMLElement;
  private readonly diveResultLines: HTMLElement;
  private readonly diveResultClose: HTMLButtonElement;
  private readonly eventSleepMask: HTMLElement;
  private readonly eventCaption: HTMLElement;
  private readonly eventTitle: HTMLElement;
  private readonly eventDetail: HTMLElement;
  private readonly eventRisk: HTMLElement;
  private readonly eventChoices: HTMLElement;
  private readonly fishingLayer: HTMLElement;
  private readonly fishingLive: HTMLElement;
  private readonly fishingBiteTarget: HTMLButtonElement;
  private readonly fishingFade: HTMLElement;
  private readonly fishingResultLayer: HTMLElement;
  private readonly fishingResultCaption: HTMLElement;
  private readonly fishingResultTitle: HTMLElement;
  private readonly fishingResultDetail: HTMLElement;
  private readonly fishingResultContinue: HTMLButtonElement;
  private readonly driftingItemFocusLayer: HTMLElement;
  private readonly driftingItemFocusCard: HTMLElement;
  private readonly driftingItemFocusBack: HTMLButtonElement;
  private readonly driftingItemFocusTitle: HTMLElement;
  private readonly driftingItemFocusChoices: HTMLElement;
  private readonly fishingViewExit: HTMLButtonElement;
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
  private feedbackTimer: number | undefined;
  private restartIssued = false;
  private pauseReturnTarget: HTMLElement | null = null;
  private fishingReturnTarget: HTMLElement | null = null;
  private latestCommandOrigin: HTMLButtonElement | null = null;
  private currentSnapshot: SurvivalSnapshot | null = null;
  private journalEntries: readonly JournalEntry[] = [];
  private journalIndex = 0;
  private fishingMode: FishingUiMode = 'hidden';
  private fishingMessage = '';
  private readonly fishingTarget = {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    depth: 0,
    visible: false,
  };
  private hasFishingTarget = false;
  private fishingCastIssued = false;
  private fishingReelIssued = false;
  private suppressFishingClick = false;
  private fishingAnnouncementVersion = 0;
  private pendingFishingFade: PendingFade | null = null;
  private pendingSleepTransition: PendingFade | null = null;
  private pendingDiveCoveredHold: PendingFade | null = null;
  private pendingRewardResultConfirmation: PendingFade | null = null;
  private pendingEventChoiceBeat: PendingFade | null = null;
  private pendingEventOutcomeHold: PendingFade | null = null;
  private pendingCoveredSceneSettle: PendingFade | null = null;
  private fishingResultContinueIssued = false;
  private fishingResultTarget: ProjectedBoatBounds | null = null;
  private driftingItemFocusTarget: ProjectedBoatBounds | null = null;
  private driftingItemFocusChoicesView: readonly EventContextChoice[] = [];
  private eventEligibility: ReadonlyMap<ItemInstanceId, EventResponseId> | null = null;
  private contextualEventChoices: readonly EventContextChoice[] = [];
  private eventSelectedInstanceId: ItemInstanceId | null = null;
  private eventSelectedChoiceId: EventResponseId | null = null;
  private eventPresentationActive = false;

  constructor(private readonly mount: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'survival-ui';
    this.root.innerHTML = `
      <div class="ui-treatment" aria-hidden="true"></div>
      <div class="survival-announcer" data-survival-announcer aria-live="polite" aria-atomic="true"></div>
      <div class="survival-feedback" data-survival-feedback aria-hidden="true"></div>
      <div class="sleep-cover" data-sleep-cover data-profile="solid" aria-hidden="true"></div>
      <div class="bad-sleep-cue" data-bad-sleep-cue aria-hidden="true">
        <span class="bad-sleep-cue__eye bad-sleep-cue__eye--left">
          <i class="bad-sleep-cue__eyelid bad-sleep-cue__eyelid--top"></i>
          <i class="bad-sleep-cue__eyelid bad-sleep-cue__eyelid--bottom"></i>
        </span>
        <span class="bad-sleep-cue__eye bad-sleep-cue__eye--right">
          <i class="bad-sleep-cue__eyelid bad-sleep-cue__eyelid--top"></i>
          <i class="bad-sleep-cue__eyelid bad-sleep-cue__eyelid--bottom"></i>
        </span>
      </div>
      <section class="dive-result" data-dive-result role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="dive-result-title" inert>
        <div class="dive-result__paper scuba-popup-paper">
          <button type="button" class="dive-result__close ui-role-context" data-dive-result-close aria-label="Close dive result">&times;</button>
          <h2 class="dive-result__title scuba-popup-title ui-role-display" id="dive-result-title" data-dive-result-title></h2>
          <ul class="dive-result__lines ui-role-numeral" data-dive-result-lines></ul>
          <div class="dive-result__rewards" data-dive-result-rewards hidden></div>
        </div>
      </section>
      <div class="event-sleep-mask" data-event-sleep-mask aria-hidden="true">
        <i></i><i></i><i></i>
      </div>
      <section class="fishing-layer" data-fishing role="region" aria-label="Fishing interaction" aria-hidden="true" inert tabindex="-1">
        <div class="survival-announcer" data-fishing-live aria-live="polite" aria-atomic="true"></div>
        <button type="button" class="fishing-bite-target" data-fishing-bite aria-label="BITE - REEL NOW" hidden></button>
        <button type="button" class="fishing-view-exit ui-role-context" data-fishing-view-exit aria-label="Return to boat view" hidden>
          <span class="fishing-view-exit__arrow" aria-hidden="true"></span>
        </button>
      </section>
      <div class="fishing-fade" data-fishing-fade aria-hidden="true"></div>
      <section class="routine-dialog routine-dialog--fishing" data-fishing-result role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="fishing-result-title" inert>
        <div class="routine-dialog__card fishing-result-card scuba-popup-paper">
          <p class="eyebrow ui-role-context" data-fishing-result-caption></p>
          <h2 class="scuba-popup-title ui-role-display" id="fishing-result-title" data-fishing-result-title></h2>
          <p class="fishing-result-detail ui-role-narrative" data-fishing-result-detail></p>
          <button type="button" class="primary-action salvage-action ui-role-context" data-fishing-result-continue aria-label="Continue">
            CONTINUE
          </button>
        </div>
      </section>
      <section class="drifting-item-focus" data-drifting-item-focus role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="drifting-item-focus-title" inert>
        <div class="dive-result__paper drifting-item-focus__card scuba-popup-paper">
          <h2 class="dive-result__title scuba-popup-title ui-role-display" id="drifting-item-focus-title" data-drifting-item-title></h2>
          <nav data-drifting-item-choices aria-label="Pickup choices"></nav>
        </div>
        <button type="button" class="drifting-item-focus__back" data-drifting-item-back aria-label="Return to boat">
          <svg class="drifting-item-focus__back-icon" data-drifting-item-back-icon viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M9 3h6v10h5l-8 8-8-8h5z" />
          </svg>
        </button>
      </section>
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
      <section class="event-caption" data-event-caption aria-hidden="true" aria-live="polite">
        <h2 class="ui-role-display" data-event-title hidden></h2>
        <p class="event-caption__detail ui-role-narrative" data-event-detail hidden></p>
        <p class="event-caption__risk ui-role-context" data-event-risk hidden></p>
        <nav class="event-choices" data-event-choices aria-label="Event choices" hidden></nav>
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

    this.hudView = new SurvivalHudView();
    this.anchorView = new BoatAnchorView(this.root);
    const firstFollowingView = requireElement(this.root, '[data-fishing]');
    firstFollowingView.before(...this.hudView.roots, ...this.anchorView.roots);

    this.announcer = requireElement(this.root, '[data-survival-announcer]');
    this.feedback = requireElement(this.root, '[data-survival-feedback]');
    this.sleepCover = requireElement(this.root, '[data-sleep-cover]');
    this.badSleepCue = requireElement(this.root, '[data-bad-sleep-cue]');
    this.diveResultLayer = requireElement(this.root, '[data-dive-result]');
    this.diveResultTitle = requireElement(this.root, '[data-dive-result-title]');
    this.diveResultRewards = requireElement(this.root, '[data-dive-result-rewards]');
    this.diveResultLines = requireElement(this.root, '[data-dive-result-lines]');
    this.diveResultClose = requireElement(this.root, '[data-dive-result-close]');
    this.eventSleepMask = requireElement(this.root, '[data-event-sleep-mask]');
    this.eventCaption = requireElement(this.root, '[data-event-caption]');
    this.eventTitle = requireElement(this.root, '[data-event-title]');
    this.eventDetail = requireElement(this.root, '[data-event-detail]');
    this.eventRisk = requireElement(this.root, '[data-event-risk]');
    this.eventChoices = requireElement(this.root, '[data-event-choices]');
    this.fishingLayer = requireElement(this.root, '[data-fishing]');
    this.fishingLive = requireElement(this.root, '[data-fishing-live]');
    this.fishingBiteTarget = requireElement(this.root, '[data-fishing-bite]');
    this.fishingFade = requireElement(this.root, '[data-fishing-fade]');
    this.fishingResultLayer = requireElement(this.root, '[data-fishing-result]');
    this.fishingResultCaption = requireElement(this.root, '[data-fishing-result-caption]');
    this.fishingResultTitle = requireElement(this.root, '[data-fishing-result-title]');
    this.fishingResultDetail = requireElement(this.root, '[data-fishing-result-detail]');
    this.fishingResultContinue = requireElement(this.root, '[data-fishing-result-continue]');
    this.driftingItemFocusLayer = requireElement(this.root, '[data-drifting-item-focus]');
    this.driftingItemFocusCard = requireElement(
      this.driftingItemFocusLayer,
      '.drifting-item-focus__card',
    );
    this.driftingItemFocusBack = requireElement(this.root, '[data-drifting-item-back]');
    this.driftingItemFocusTitle = requireElement(this.root, '[data-drifting-item-title]');
    this.driftingItemFocusChoices = requireElement(this.root, '[data-drifting-item-choices]');
    this.fishingViewExit = requireElement(this.root, '[data-fishing-view-exit]');
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
      this.diveResultLayer,
      this.driftingItemFocusLayer,
      this.fishingResultLayer,
      this.fishingLayer,
    ];
    this.modalFocus = new ModalFocusManager(
      [this.hudView.topControls, this.anchorView.anchorLayer],
      modalLayers,
      new Map<HTMLElement, ModalInitialFocus>([
        [this.pauseLayer, this.resumeButton],
        [this.journalLayer, this.journalTitle],
        [this.repairOptionsLayer, this.repairOptionsTitle],
        [this.endingLayer, this.endingTitle],
        [this.diveResultLayer, this.diveResultClose],
        [this.driftingItemFocusLayer, () => (
          this.driftingItemFocusChoices.querySelector<HTMLButtonElement>(
            '[data-event-choice][aria-disabled="false"]',
          ) ?? this.driftingItemFocusBack
        )],
        [this.fishingResultLayer, this.fishingResultContinue],
        [this.fishingLayer, () => {
          if (this.fishingMode === 'bite' && !this.fishingBiteTarget.hidden) {
            return this.fishingBiteTarget;
          }
          if (this.fishingMode === 'ready' && !this.fishingViewExit.hidden) {
            return this.fishingViewExit;
          }
          return this.fishingLayer;
        }],
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

    this.root.addEventListener('click', this.handleClick);
    this.root.addEventListener('pointerup', this.handleFishingPointerUp);
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
    this.eventPresentationActive = true;
    this.syncCommandState();
  }

  showItemAnimationLab(): void {
    if (this.disposed) return;
    this.updateText('event:title', this.eventTitle, 'ITEM ANIMATION LAB');
    this.eventTitle.hidden = false;
    this.updateText(
      'event:detail',
      this.eventDetail,
      'SELECT AN ITEM OR TOOL. CARLITOS OPENS HIS STATS.',
    );
    this.eventDetail.hidden = false;
    this.eventRisk.textContent = '';
    this.eventRisk.hidden = true;
    this.eventCaption.dataset.eventId = 'item-animation-lab';
    delete this.eventCaption.dataset.danger;
    this.eventPresentationActive = true;
    this.anchorView.setItemAnimationLabActive(true);
    this.eventCaption.setAttribute(
      'aria-label',
      'Item Animation Lab. Select an item. Carlitos opens his stats.',
    );
    this.eventCaption.classList.add('is-visible');
    this.eventCaption.setAttribute('aria-hidden', 'false');
    this.syncCommandState();
    this.publishAnnouncement(
      'Item Animation Lab. Select an item. Carlitos opens his stats.',
    );
  }

  showEventReveal(
    event: Pick<SurvivalEventDefinition, 'id' | 'revealText' | 'danger'>,
  ): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.anchorView.setItemAnimationLabActive(false);
    this.anchorView.setEventPresentationActive(true);
    const risk = event.danger.toLocaleUpperCase('en-US');
    this.updateText('event:title', this.eventTitle, '');
    this.eventTitle.hidden = true;
    this.updateText('event:detail', this.eventDetail, event.revealText);
    this.updateText('event:risk', this.eventRisk, risk);
    this.eventDetail.hidden = true;
    this.eventRisk.hidden = true;
    this.eventCaption.dataset.eventId = event.id;
    this.eventCaption.dataset.danger = event.danger;
    this.eventPresentationActive = true;
    this.eventCaption.classList.remove('is-visible');
    this.eventCaption.setAttribute('aria-hidden', 'true');
    this.eventCaption.removeAttribute('aria-label');
    this.syncCommandState();
    this.publishAnnouncement(
      `${event.danger[0]!.toUpperCase()}${event.danger.slice(1)} event. ${event.revealText}`,
    );
    return Promise.resolve();
  }

  hideEventReveal(): void {
    if (this.disposed) return;
    this.eventCaption.classList.remove('is-visible');
    this.eventCaption.setAttribute('aria-hidden', 'true');
  }

  setEventSelection(
    eligible: ReadonlyMap<ItemInstanceId, EventResponseId>,
    contextualChoices: readonly EventContextChoice[] = [],
  ): void {
    if (this.disposed) return;
    this.eventEligibility = new Map(eligible);
    this.contextualEventChoices = [...contextualChoices];
    this.eventSelectedInstanceId = null;
    this.eventSelectedChoiceId = null;
    this.anchorView.setEventSelection(eligible, contextualChoices);
    this.renderContextualEventChoices();
    this.syncCommandState();
  }

  setEventUsing(instanceId: ItemInstanceId): void {
    if (this.disposed || this.eventEligibility === null) return;
    this.eventSelectedInstanceId = instanceId;
    this.anchorView.setEventUsing(instanceId);
    this.syncCommandState();
  }

  playEventChoiceBeat(choiceId: EventResponseId): Promise<void> {
    if (this.disposed || !this.eventPresentationActive) return Promise.resolve();
    const button = [
      ...this.eventChoices.querySelectorAll<HTMLButtonElement>('[data-event-choice]'),
      ...this.driftingItemFocusChoices.querySelectorAll<HTMLButtonElement>('[data-event-choice]'),
      ...this.anchorView.anchorButtonsInOrder(),
    ].find((candidate) => candidate.dataset.eventChoice === choiceId);
    if (
      button === undefined
      || button.dataset.unavailableReason !== undefined
      || this.eventSelectedChoiceId !== null
    ) {
      return Promise.resolve();
    }
    this.pendingEventChoiceBeat?.finish();
    this.eventSelectedChoiceId = choiceId;
    this.anchorView.setEventChoiceSelection(choiceId);
    this.syncCommandState();
    const delay = EVENT_CHOICE_BEAT_MS;
    return new Promise((resolve) => {
      let settled = false;
      let timer = 0;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        settleAfterCleanup(resolve, [
          () => window.clearTimeout(timer),
          () => button.removeEventListener('animationend', handleAnimationEnd),
          () => {
            if (this.pendingEventChoiceBeat?.finish === finish) {
              this.pendingEventChoiceBeat = null;
            }
          },
        ]);
      };
      const handleAnimationEnd = (event: AnimationEvent): void => {
        if (event.target === button) finish();
      };
      button.addEventListener('animationend', handleAnimationEnd);
      timer = window.setTimeout(finish, delay);
      this.pendingEventChoiceBeat = { finish };
    });
  }

  clearEventPresentation(): void {
    if (this.disposed) return;
    this.anchorView.clearEventPresentation();
    this.pendingEventChoiceBeat?.finish();
    this.eventSleepMask.classList.remove('is-visible');
    this.badSleepCue.classList.remove('is-visible');
    const focusedContextualChoice = document.activeElement !== null
      && this.eventChoices.contains(document.activeElement);
    this.eventEligibility = null;
    this.contextualEventChoices = [];
    this.eventSelectedInstanceId = null;
    this.eventSelectedChoiceId = null;
    this.eventPresentationActive = false;
    this.eventCaption.classList.remove('is-visible');
    this.eventCaption.setAttribute('aria-hidden', 'true');
    this.eventCaption.removeAttribute('aria-label');
    delete this.eventCaption.dataset.eventId;
    delete this.eventCaption.dataset.danger;
    this.updateText('event:title', this.eventTitle, '');
    this.eventTitle.hidden = true;
    this.eventDetail.textContent = '';
    this.eventDetail.hidden = true;
    this.eventRisk.textContent = '';
    this.eventRisk.hidden = true;
    this.eventChoices.replaceChildren();
    this.eventChoices.hidden = true;
    this.syncCommandState();
    if (focusedContextualChoice) this.firstUsableAction()?.focus();
  }

  setEventSleepMask(eventId: string, visible: boolean): void {
    if (this.disposed) return;
    this.eventSleepMask.classList.toggle(
      'is-visible',
      eventId === 'ghosts' && visible,
    );
  }

  showFeedback(outcome: Pick<ActionOutcome, 'accepted' | 'message'>): void {
    if (this.disposed) return;
    window.clearTimeout(this.feedbackTimer);
    this.feedback.dataset.accepted = String(outcome.accepted);
    this.feedback.textContent = outcome.message;
    this.feedback.classList.remove('is-visible');
    void this.feedback.offsetWidth;
    this.feedback.classList.add('is-visible');
    this.publishAnnouncement(outcome.message);
    this.feedbackTimer = window.setTimeout(() => {
      if (!this.disposed) this.feedback.classList.remove('is-visible');
    }, 2600);
  }

  setSleepCoverProfile(profile: SleepCoverProfile): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.sleepCover.dataset.profile = profile;
    return Promise.resolve();
  }

  setBadSleepCue(visible: boolean): void {
    if (this.disposed) return;
    this.badSleepCue.classList.toggle('is-visible', visible);
  }

  setSleepCovered(covered: boolean): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.pendingSleepTransition?.finish();
    this.sleepCover.classList.toggle('is-covered', covered);
    const delay = this.sleepCover.dataset.profile === 'dive'
      ? DIVE_TRANSITION_MS
      : SLEEP_TRANSITION_MS;
    return new Promise((resolve) => {
      let settled = false;
      let timer = 0;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        settleAfterCleanup(resolve, [
          () => window.clearTimeout(timer),
          () => this.sleepCover.removeEventListener('transitionend', handleTransitionEnd),
          () => {
            if (this.pendingSleepTransition?.finish === finish) {
              this.pendingSleepTransition = null;
            }
          },
        ]);
      };
      const handleTransitionEnd = (event: TransitionEvent): void => {
        if (event.target === this.sleepCover && event.propertyName === 'opacity') finish();
      };
      this.sleepCover.addEventListener('transitionend', handleTransitionEnd);
      timer = window.setTimeout(finish, delay);
      this.pendingSleepTransition = { finish };
    });
  }

  holdDiveCovered(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.pendingDiveCoveredHold?.finish();
    return this.createDiveHold(
      DIVE_COVERED_HOLD_MS,
      (pending) => { this.pendingDiveCoveredHold = pending; },
      () => this.pendingDiveCoveredHold,
      () => { this.pendingDiveCoveredHold = null; },
    );
  }

  showRewardResult(view: RewardResultView): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.pendingRewardResultConfirmation?.finish();
    this.diveResultLayer.classList.toggle(
      'is-chest-reward',
      view.title === 'CHEST REWARD',
    );
    this.diveResultTitle.textContent = view.title;
    this.diveResultClose.setAttribute(
      'aria-label',
      view.title === 'CHEST REWARD' ? 'Close chest reward' : 'Close dive result',
    );
    this.renderDiveReward(view.reward);
    this.diveResultLines.hidden = view.lines.length === 0;
    this.diveResultLines.replaceChildren(...view.lines.map((line) => {
      const item = document.createElement('li');
      item.textContent = line;
      return item;
    }));
    const confirmation = new Promise<void>((resolve) => {
      let settled = false;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        const current = this.pendingRewardResultConfirmation?.finish === finish;
        settleAfterCleanup(resolve, [
          () => {
            if (current) this.pendingRewardResultConfirmation = null;
          },
          () => {
            if (current) this.clearRewardResultView();
          },
        ]);
      };
      this.pendingRewardResultConfirmation = { finish };
    });
    this.showLayer(this.diveResultLayer);
    return confirmation;
  }

  hideRewardResult(): void {
    if (this.disposed) return;
    this.pendingRewardResultConfirmation?.finish();
    this.clearRewardResultView();
  }

  private clearRewardResultView(): void {
    throwCleanupFailure(runCleanupSteps([
      () => this.hideLayer(this.diveResultLayer),
      () => this.diveResultLayer.classList.remove('is-chest-reward'),
      () => { this.diveResultTitle.textContent = ''; },
      () => { this.diveResultRewards.hidden = true; },
      () => this.diveResultRewards.replaceChildren(),
      () => { this.diveResultLines.hidden = true; },
      () => this.diveResultLines.replaceChildren(),
    ]));
  }

  private renderDiveReward(reward: RewardSummary | null): void {
    this.diveResultRewards.replaceChildren();
    this.diveResultRewards.hidden = reward === null;
    if (reward === null) return;
    const itemId = driftingCargoRewardItemId(reward);
    const entry = document.createElement('span');
    entry.className = 'dive-result__reward-entry';
    const circle = document.createElement('span');
    circle.className = 'weight-circle is-filled dive-result__reward';
    circle.dataset.itemType = itemId;
    circle.setAttribute('aria-hidden', 'true');
    const thumbnail = document.createElement('img');
    thumbnail.className = 'weight-circle__thumbnail';
    thumbnail.src = itemThumbnailUrl(itemId);
    thumbnail.alt = '';
    thumbnail.decoding = 'async';
    thumbnail.draggable = false;
    thumbnail.addEventListener('error', () => {
      thumbnail.hidden = true;
      circle.classList.add('has-image-error');
    }, { once: true });
    circle.append(thumbnail);
    const copy = document.createElement('span');
    copy.className = 'dive-result__reward-copy';
    const name = document.createElement('strong');
    name.className = 'dive-result__reward-name ui-role-context';
    name.dataset.diveResultRewardName = '';
    name.textContent = diveRewardName(reward);
    const quantity = document.createElement('span');
    quantity.className = 'dive-result__reward-quantity ui-role-numeral';
    quantity.dataset.diveResultRewardQuantity = '';
    quantity.textContent = `×${reward.quantity}`;
    copy.append(name, quantity);
    entry.append(circle, copy);
    this.diveResultRewards.replaceChildren(entry);
  }

  private createDiveHold(
    delay: number,
    setPending: (pending: PendingFade) => void,
    getPending: () => PendingFade | null,
    clearPending: () => void,
    onCurrentFinish?: () => void,
  ): Promise<void> {
    return new Promise((resolve) => {
      let settled = false;
      let timer = 0;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        let current = false;
        settleAfterCleanup(resolve, [
          () => window.clearTimeout(timer),
          () => { current = getPending()?.finish === finish; },
          () => { if (current) clearPending(); },
          () => { if (current) onCurrentFinish?.(); },
        ]);
      };
      timer = window.setTimeout(finish, delay);
      setPending({ finish });
    });
  }

  settleCoveredScene(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.pendingCoveredSceneSettle?.finish();
    return new Promise((resolve) => {
      let settled = false;
      let frame = 0;
      let completedFrames = 0;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        let current = false;
        settleAfterCleanup(resolve, [
          () => { if (frame !== 0) window.cancelAnimationFrame(frame); },
          () => { current = this.pendingCoveredSceneSettle?.finish === finish; },
          () => { if (current) this.pendingCoveredSceneSettle = null; },
        ]);
      };
      const advance = (): void => {
        frame = 0;
        completedFrames += 1;
        if (completedFrames >= 2) {
          finish();
          return;
        }
        frame = window.requestAnimationFrame(advance);
      };
      frame = window.requestAnimationFrame(advance);
      this.pendingCoveredSceneSettle = { finish };
    });
  }

  setFishingState(state: FishingUiState): void {
    if (this.disposed) return;
    const previousMode = this.fishingMode;
    const modeChanged = state.mode !== previousMode;
    const messageChanged = state.message !== this.fishingMessage;
    const targetChanged = !this.sameFishingTarget(state.biteTarget);
    if (!modeChanged && !messageChanged && !targetChanged) return;

    if (modeChanged) {
      if (previousMode === 'hidden' && state.mode !== 'hidden') {
        this.fishingReturnTarget = this.latestCommandOrigin ?? this.resolveCommandOrigin();
      }
      this.fishingCastIssued = false;
      this.fishingReelIssued = false;
      this.suppressFishingClick = false;
    }

    this.fishingMode = state.mode;
    this.fishingLayer.dataset.mode = state.mode;
    if (messageChanged || modeChanged) {
      this.fishingMessage = state.message;
      this.fishingLive.setAttribute('aria-live', state.mode === 'bite' ? 'assertive' : 'polite');
      if (state.mode === 'hidden') {
        this.fishingAnnouncementVersion += 1;
        this.fishingLive.textContent = '';
      } else {
        this.publishFishingAnnouncement(state.message);
      }
    }
    if (targetChanged || modeChanged) this.renderFishingTarget(state.biteTarget);

    if (state.mode === 'hidden') {
      this.hideLayer(this.fishingLayer);
      const target = this.fishingReturnTarget;
      this.fishingReturnTarget = null;
      if (this.modalFocus.topmostModal() === null && !this.busy) this.restoreFishingFocus(target);
      return;
    }

    this.showLayer(this.fishingLayer);
    if (modeChanged) this.modalFocus.focusInitial(this.fishingLayer);
  }

  showFishingResult(view: FishingResultView): void {
    if (this.disposed) return;
    this.fishingResultContinueIssued = false;
    this.fishingResultCaption.textContent = view.caption;
    this.fishingResultTitle.textContent = view.title;
    this.fishingResultDetail.textContent = view.detail;
    this.fishingResultTarget = view.catchTarget === null
      ? null
      : Object.freeze({ ...view.catchTarget });
    this.showLayer(this.fishingResultLayer);
  }

  hideFishingResult(): void {
    if (this.disposed) return;
    this.hideLayer(this.fishingResultLayer);
    this.fishingResultTarget = null;
  }

  showDriftingItemFocus(view: DriftingItemFocusView): void {
    if (this.disposed) return;
    this.driftingItemFocusBack.setAttribute('aria-label', 'Return to boat');
    this.driftingItemFocusTitle.textContent = view.title;
    this.driftingItemFocusTarget = view.target === null
      ? null
      : Object.freeze({ ...view.target });
    this.driftingItemFocusChoicesView = [...view.choices];
    this.renderDriftingItemFocusChoices();
    this.positionDriftingItemFocus();
    this.syncCommandState();
    this.showLayer(this.driftingItemFocusLayer);
  }

  hideDriftingItemFocus(): void {
    if (this.disposed) return;
    this.hideLayer(this.driftingItemFocusLayer);
    this.driftingItemFocusChoicesView = [];
    this.driftingItemFocusChoices.replaceChildren();
    this.driftingItemFocusChoices.hidden = false;
    this.driftingItemFocusTitle.textContent = '';
    this.driftingItemFocusTarget = null;
  }

  updateDriftingItemFocusTarget(target: ProjectedBoatBounds | null): void {
    if (this.disposed || !this.driftingItemFocusLayer.classList.contains('is-visible')) return;
    this.driftingItemFocusTarget = target === null
      ? null
      : Object.freeze({ ...target });
    this.positionDriftingItemFocus();
  }

  setFishingViewExitVisible(visible: boolean): void {
    if (this.disposed) return;
    this.fishingViewExit.hidden = !visible;
    this.root.dataset.fishingExitVisible = String(visible);
    if (visible) this.anchorView.clearHighlight();
  }

  setCameraTurnState(visible: boolean, rear: boolean): void {
    if (this.disposed) return;
    this.hudView.setCameraTurnState(visible, rear);
  }

  updateFishingBiteTarget(target: ProjectedBoatBounds | null): void {
    if (
      this.disposed
      || this.fishingMode !== 'bite'
      || this.sameFishingTarget(target)
    ) return;
    this.renderFishingTarget(target);
  }

  setFishingFade(covered: boolean): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.pendingFishingFade?.finish();
    this.fishingFade.classList.toggle('is-covered', covered);
    const delay = FISHING_FADE_MS;
    return new Promise((resolve) => {
      let settled = false;
      let timer = 0;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        settleAfterCleanup(resolve, [
          () => window.clearTimeout(timer),
          () => this.fishingFade.removeEventListener('transitionend', handleTransitionEnd),
          () => {
            if (this.pendingFishingFade?.finish === finish) this.pendingFishingFade = null;
          },
        ]);
      };
      const handleTransitionEnd = (event: TransitionEvent): void => {
        if (event.target === this.fishingFade && event.propertyName === 'opacity') finish();
      };
      this.fishingFade.addEventListener('transitionend', handleTransitionEnd);
      timer = window.setTimeout(finish, delay);
      this.pendingFishingFade = { finish };
    });
  }

  holdSleep(): Promise<void> {
    const delay = SLEEP_HOLD_MS;
    return new Promise((resolve) => window.setTimeout(resolve, delay));
  }

  holdEventOutcome(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.pendingEventOutcomeHold?.finish();
    const delay = EVENT_OUTCOME_HOLD_MS;
    return new Promise((resolve) => {
      let settled = false;
      let timer = 0;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        settleAfterCleanup(resolve, [
          () => window.clearTimeout(timer),
          () => {
            if (this.pendingEventOutcomeHold?.finish === finish) {
              this.pendingEventOutcomeHold = null;
            }
          },
        ]);
      };
      timer = window.setTimeout(finish, delay);
      this.pendingEventOutcomeHold = { finish };
    });
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
    this.syncCommandState();
  }

  setPaused(paused: boolean): void {
    if (this.disposed || paused === this.paused) return;
    if (paused) this.anchorView.setPaused(true);
    if (paused && !this.paused) {
      this.pauseReturnTarget = this.resolveCommandOrigin();
    }
    this.paused = paused;
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
    let failed = false;
    let firstError: unknown;
    const clean = (cleanup: () => void): void => {
      try {
        cleanup();
      } catch (error) {
        if (!failed) {
          failed = true;
          firstError = error;
        }
      }
    };
    clean(() => { this.eventEligibility = null; });
    clean(() => { this.contextualEventChoices = []; });
    clean(() => { this.eventSelectedInstanceId = null; });
    clean(() => { this.eventSelectedChoiceId = null; });
    clean(() => { this.eventPresentationActive = false; });
    clean(() => this.badSleepCue.classList.remove('is-visible'));
    clean(() => this.eventChoices.replaceChildren());
    clean(() => { this.eventChoices.hidden = true; });
    clean(() => this.pendingSleepTransition?.finish());
    clean(() => this.pendingDiveCoveredHold?.finish());
    clean(() => this.pendingRewardResultConfirmation?.finish());
    clean(() => this.pendingFishingFade?.finish());
    clean(() => this.pendingEventChoiceBeat?.finish());
    clean(() => this.pendingEventOutcomeHold?.finish());
    clean(() => this.pendingCoveredSceneSettle?.finish());
    clean(() => { this.fishingAnnouncementVersion += 1; });
    clean(() => this.hideLayer(this.driftingItemFocusLayer));
    if (this.fishingMode !== 'hidden') {
      clean(() => this.hideLayer(this.fishingLayer));
      clean(() => { this.fishingMode = 'hidden'; });
      clean(() => { this.fishingReturnTarget = null; });
    }
    clean(() => this.anchorView.dispose());
    clean(() => this.hudView.dispose());
    clean(() => this.modalFocus.dispose());
    clean(() => { this.announcementVersion += 1; });
    clean(() => window.clearTimeout(this.feedbackTimer));
    clean(() => this.root.removeEventListener('click', this.handleClick));
    clean(() => this.root.removeEventListener('pointerup', this.handleFishingPointerUp));
    clean(() => document.removeEventListener('keydown', this.handleKeyDown));
    clean(() => window.removeEventListener('resize', this.handleWindowResize));
    clean(() => { this.onAction = () => undefined; });
    clean(() => { this.onEventItem = () => undefined; });
    clean(() => { this.onEventChoice = () => undefined; });
    clean(() => { this.onRestart = () => undefined; });
    clean(() => { this.onAnchorHighlight = () => undefined; });
    clean(() => { this.onPauseChange = () => undefined; });
    clean(() => { this.onJournalOpen = () => undefined; });
    clean(() => { this.onJournalClose = () => undefined; });
    clean(() => { this.onJournalPage = () => undefined; });
    clean(() => { this.onFishingCast = null; });
    clean(() => { this.onFishingReel = null; });
    clean(() => { this.onFishingResultContinue = null; });
    clean(() => { this.onFishingViewExit = null; });
    clean(() => { this.onDriftingItemSelect = null; });
    clean(() => { this.onDriftingItemBack = null; });
    clean(() => { this.onCameraTurn = null; });
    clean(() => this.root.remove());
    if (failed) throw firstError;
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
    this.eventChoices.querySelectorAll<HTMLButtonElement>('[data-event-choice]').forEach((button) => {
      const unavailable = button.dataset.unavailableReason !== undefined;
      const selected = button.dataset.eventChoice === this.eventSelectedChoiceId;
      button.dataset.eventState = selected ? 'selected' : 'idle';
      button.setAttribute('aria-pressed', String(selected));
      button.disabled = false;
      button.setAttribute(
        'aria-disabled',
        unavailable || this.busy || this.eventSelectedChoiceId !== null ? 'true' : 'false',
      );
    });
    this.driftingItemFocusChoices.querySelectorAll<HTMLButtonElement>('[data-event-choice]').forEach((button) => {
      const unavailable = button.dataset.unavailableReason !== undefined;
      button.dataset.eventState = 'idle';
      button.setAttribute('aria-pressed', 'false');
      button.disabled = false;
      button.setAttribute('aria-disabled', unavailable || this.busy ? 'true' : 'false');
    });
  }

  private renderContextualEventChoices(): void {
    const choices = this.contextualEventChoices
      .filter((choice) => choice.id !== 'sleep' && choice.anchorId === undefined)
      .map((choice) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'event-choice ui-role-context';
        button.dataset.eventChoice = choice.id;
        button.dataset.eventState = 'idle';
        button.setAttribute('aria-pressed', 'false');
        button.textContent = choice.label;
        if (choice.unavailableReason !== null) {
          button.dataset.unavailableReason = choice.unavailableReason;
          button.setAttribute('aria-description', choice.unavailableReason);
          const reason = document.createElement('span');
          reason.className = 'event-choice__reason ui-role-narrative';
          reason.textContent = choice.unavailableReason;
          button.append(reason);
        }
        return button;
      });
    this.eventChoices.replaceChildren(...choices);
    this.eventChoices.hidden = choices.length === 0;
    const showCaption = this.eventPresentationActive && (
      !this.eventTitle.hidden
      || !this.eventDetail.hidden
      || !this.eventRisk.hidden
      || choices.length > 0
    );
    this.eventCaption.classList.toggle('is-visible', showCaption);
    this.eventCaption.setAttribute('aria-hidden', showCaption ? 'false' : 'true');
  }

  private renderDriftingItemFocusChoices(): void {
    const choices = this.driftingItemFocusChoicesView.map((choice) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'event-choice ui-role-context';
      button.dataset.eventChoice = choice.id;
      button.dataset.eventState = 'idle';
      button.setAttribute('aria-pressed', 'false');
      const main = document.createElement('span');
      main.className = 'drifting-item-focus__choice-main';
      main.append(document.createTextNode(choice.label));
      const energyCost = choice.energyCost ?? 0;
      if (energyCost > 0) {
        const cost = document.createElement('span');
        cost.className = 'drifting-item-focus__cost';
        cost.setAttribute('aria-label', `${energyCost} energy`);
        cost.textContent = '⚡️'.repeat(energyCost);
        main.append(cost);
      }
      button.append(main);

      if (choice.unavailableReason !== null) {
        button.dataset.unavailableReason = choice.unavailableReason;
        button.setAttribute('aria-description', choice.unavailableReason);
        const reason = document.createElement('span');
        reason.className = 'event-choice__reason ui-role-narrative';
        reason.textContent = choice.unavailableReason;
        button.append(reason);
      }
      return button;
    });
    this.driftingItemFocusChoices.replaceChildren(...choices);
    this.driftingItemFocusChoices.hidden = false;
  }

  private readonly handleWindowResize = (): void => {
    if (this.disposed) return;
    this.positionOpenRoutineDialogs();
    if (this.driftingItemFocusLayer.classList.contains('is-visible')) {
      this.positionDriftingItemFocus();
    }
  };

  private showLayer(layer: HTMLElement, origin: HTMLElement | null = null): void {
    this.anchorView.clearHighlight();
    if (layer === this.fishingResultLayer) {
      this.positionRoutineDialog(
        layer,
        ROUTINE_DIALOG_PLACEMENTS.fishing,
        this.fishingResultTarget,
      );
    } else if (layer === this.repairOptionsLayer) {
      this.positionRoutineDialog(layer, ROUTINE_DIALOG_PLACEMENTS.repair);
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
  }

  private positionOpenRoutineDialogs(): void {
    if (this.fishingResultLayer.classList.contains('is-visible')) {
      this.positionRoutineDialog(
        this.fishingResultLayer,
        ROUTINE_DIALOG_PLACEMENTS.fishing,
        this.fishingResultTarget,
      );
    }
    if (this.repairOptionsLayer.classList.contains('is-visible')) {
      this.positionRoutineDialog(this.repairOptionsLayer, ROUTINE_DIALOG_PLACEMENTS.repair);
    }
  }

  private positionDriftingItemFocus(): void {
    const rootBounds = this.root.getBoundingClientRect();
    const viewportWidth = Math.max(
      1,
      rootBounds.width || this.root.clientWidth || window.innerWidth,
    );
    const viewportHeight = Math.max(
      1,
      rootBounds.height || this.root.clientHeight || window.innerHeight,
    );
    const margin = ROUTINE_DIALOG_MARGIN;
    const gap = ROUTINE_DIALOG_GAP;
    const popupBottom = Math.max(margin, viewportHeight - DRIFTING_FOCUS_BOTTOM_RESERVE);
    const target = this.driftingItemFocusTarget?.visible === true
      ? this.driftingItemFocusTarget
      : null;

    if (target === null) {
      const width = Math.min(420, viewportWidth - margin * 2);
      this.driftingItemFocusLayer.style.setProperty('--drifting-width', `${Math.round(width)}px`);
      this.driftingItemFocusLayer.style.setProperty(
        '--drifting-max-height',
        `${Math.round(Math.max(1, popupBottom - margin))}px`,
      );
      const height = Math.min(
        Math.max(1, popupBottom - margin),
        this.driftingItemFocusCard.getBoundingClientRect().height || 360,
      );
      this.driftingItemFocusLayer.style.setProperty(
        '--drifting-x',
        `${Math.round((viewportWidth - width) / 2)}px`,
      );
      this.driftingItemFocusLayer.style.setProperty(
        '--drifting-y',
        `${Math.round(Math.max(margin, (popupBottom - height) / 2))}px`,
      );
      this.driftingItemFocusLayer.dataset.placement = 'center';
      this.driftingItemFocusLayer.dataset.anchorState = 'fallback';
      return;
    }

    const targetLeft = target.x - target.width / 2;
    const targetRight = target.x + target.width / 2;
    const leftWidth = Math.max(0, targetLeft - gap - margin);
    const rightWidth = Math.max(0, viewportWidth - margin - targetRight - gap);
    const preferredWidth = 420;
    const minimumWidth = 240;
    const horizontal = [
      { placement: 'left', available: leftWidth, edge: targetLeft - gap },
      { placement: 'right', available: rightWidth, edge: targetRight + gap },
    ] as const;
    const usable = horizontal.filter(({ available }) => available >= minimumWidth);
    const candidates = usable.length > 0 ? usable : horizontal;
    const placement = candidates.reduce((best, candidate) => {
      const bestWidth = Math.min(preferredWidth, best.available);
      const candidateWidth = Math.min(preferredWidth, candidate.available);
      const bestCenter = best.placement === 'left'
        ? best.edge - bestWidth / 2
        : best.edge + bestWidth / 2;
      const candidateCenter = candidate.placement === 'left'
        ? candidate.edge - candidateWidth / 2
        : candidate.edge + candidateWidth / 2;
      const bestDistance = Math.abs(bestCenter - viewportWidth / 2);
      const candidateDistance = Math.abs(candidateCenter - viewportWidth / 2);
      return candidateDistance < bestDistance ? candidate : best;
    });
    const width = Math.max(1, Math.min(preferredWidth, placement.available));
    const maximumHeight = Math.max(1, popupBottom - margin);
    this.driftingItemFocusLayer.style.setProperty('--drifting-width', `${Math.round(width)}px`);
    this.driftingItemFocusLayer.style.setProperty(
      '--drifting-max-height',
      `${Math.round(maximumHeight)}px`,
    );
    const cardHeight = Math.min(
      maximumHeight,
      this.driftingItemFocusCard.getBoundingClientRect().height || 360,
    );
    const x = placement.placement === 'left'
      ? placement.edge - width
      : placement.edge;
    const y = Math.min(
      popupBottom - cardHeight,
      Math.max(margin, target.y - cardHeight / 2),
    );
    this.driftingItemFocusLayer.style.setProperty('--drifting-x', `${Math.round(x)}px`);
    this.driftingItemFocusLayer.style.setProperty('--drifting-y', `${Math.round(y)}px`);
    this.driftingItemFocusLayer.dataset.placement = placement.placement;
    this.driftingItemFocusLayer.dataset.anchorState = 'projected';
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
      ?? (this.eventPresentationActive
        ? [...this.eventChoices.querySelectorAll<HTMLButtonElement>('[data-event-choice]')]
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
    if (event.key !== 'Tab' || !this.eventPresentationActive) return false;
    const controls = [
      ...this.anchorView.anchorButtonsInOrder(),
      ...this.eventChoices.querySelectorAll<HTMLButtonElement>('[data-event-choice]'),
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

  private activateEventChoice(button: HTMLButtonElement): void {
    const choiceId = button.dataset.eventChoice as EventResponseId | undefined;
    const focusActive = this.driftingItemFocusLayer.classList.contains('is-visible');
    if (
      choiceId === undefined
      || (!this.eventPresentationActive && !focusActive)
      || this.busy
      || (this.eventPresentationActive && this.eventSelectedChoiceId !== null)
      || button.getAttribute('aria-disabled') === 'true'
    ) return;
    this.onEventChoice(choiceId);
  }

  private readonly handleClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (this.hudView.contains(target) || this.anchorView.contains(target)) return;
    const topmostModal = this.modalFocus.topmostModal();
    if (
      topmostModal === this.journalLayer
      && this.journalLayer.contains(target)
      && target.closest('[data-journal-book]') === null
    ) {
      this.onJournalClose();
      return;
    }
    if (this.fishingLayer.contains(target) && topmostModal === this.fishingLayer) {
      if (target.closest('[data-fishing-view-exit]') !== null) {
        this.onFishingViewExit?.();
        return;
      }
      if (target.closest('[data-fishing-bite]') !== null) {
        this.issueFishingReel();
        return;
      }
      if (this.suppressFishingClick) {
        this.suppressFishingClick = false;
        return;
      }
      this.issueFishingCast(event.clientX, event.clientY);
      return;
    }
    const button = target.closest<HTMLButtonElement>('button');
    if (!button || !this.root.contains(button) || button.disabled) return;
    if (topmostModal !== null && !topmostModal.contains(button)) return;

    if (button.hasAttribute('data-event-choice')) {
      this.activateEventChoice(button);
      return;
    }

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
    if (button.hasAttribute('data-dive-result-close')) {
      if (topmostModal !== this.diveResultLayer) return;
      this.pendingRewardResultConfirmation?.finish();
      return;
    }
    if (button.hasAttribute('data-fishing-result-continue')) {
      if (this.fishingResultContinueIssued) return;
      this.fishingResultContinueIssued = true;
      this.onFishingResultContinue?.();
      return;
    }
    if (button.hasAttribute('data-drifting-item-back')) {
      if (topmostModal !== this.driftingItemFocusLayer) return;
      this.onDriftingItemBack?.();
      return;
    }
    if (button.hasAttribute('data-fishing-view-exit')) {
      this.onFishingViewExit?.();
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
    if (topmostModal === this.fishingLayer) {
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
        event.preventDefault();
        if (this.fishingMode === 'aiming') this.issueFishingCast();
        else if (this.fishingMode === 'bite') this.issueFishingReel();
      }
      return;
    }
    if (this.anchorView.handleCommandKeyDown(event)) return;
    const target = event.target;
    if (
      (this.eventPresentationActive || topmostModal === this.driftingItemFocusLayer)
      && target instanceof Element
      && (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar')
    ) {
      const choice = target.closest<HTMLButtonElement>('[data-event-choice]');
      if (
        choice !== null
        && (
          this.eventChoices.contains(choice)
          || this.driftingItemFocusChoices.contains(choice)
        )
      ) {
        event.preventDefault();
        this.activateEventChoice(choice);
        return;
      }
    }
  };

  private sameFishingTarget(target: ProjectedBoatBounds | null): boolean {
    if (target === null) return !this.hasFishingTarget;
    if (!this.hasFishingTarget) return false;
    return target.x === this.fishingTarget.x
      && target.y === this.fishingTarget.y
      && target.width === this.fishingTarget.width
      && target.height === this.fishingTarget.height
      && target.depth === this.fishingTarget.depth
      && target.visible === this.fishingTarget.visible;
  }

  private renderFishingTarget(target: ProjectedBoatBounds | null): void {
    this.hasFishingTarget = target !== null;
    if (target !== null) {
      this.fishingTarget.x = target.x;
      this.fishingTarget.y = target.y;
      this.fishingTarget.width = target.width;
      this.fishingTarget.height = target.height;
      this.fishingTarget.depth = target.depth;
      this.fishingTarget.visible = target.visible;
    }
    const visible = this.fishingMode === 'bite'
      && this.hasFishingTarget
      && this.fishingTarget.visible;
    this.fishingBiteTarget.hidden = !visible;
    if (!visible) return;
    const width = Math.max(44, Math.round(this.fishingTarget.width));
    const height = Math.max(44, Math.round(this.fishingTarget.height));
    this.fishingBiteTarget.style.transform = `translate(${Math.round(this.fishingTarget.x)}px, ${Math.round(this.fishingTarget.y)}px)`;
    this.fishingBiteTarget.style.width = `${width}px`;
    this.fishingBiteTarget.style.height = `${height}px`;
    this.fishingBiteTarget.style.marginLeft = `${-width / 2}px`;
    this.fishingBiteTarget.style.marginTop = `${-height / 2}px`;
  }

  private publishFishingAnnouncement(message: string): void {
    const version = ++this.fishingAnnouncementVersion;
    this.fishingLive.textContent = '';
    queueMicrotask(() => {
      if (this.disposed || version !== this.fishingAnnouncementVersion) return;
      this.fishingLive.textContent = message;
    });
  }

  private issueFishingCast(clientX?: number, clientY?: number): void {
    if (this.fishingMode !== 'aiming' || this.fishingCastIssued || this.paused) return;
    this.fishingCastIssued = true;
    let accepted = false;
    if (clientX === undefined || clientY === undefined) {
      accepted = this.onFishingCast?.(null) ?? false;
    } else {
      const bounds = this.mount.getBoundingClientRect();
      accepted = this.onFishingCast?.({ x: clientX - bounds.left, y: clientY - bounds.top }) ?? false;
    }
    if (!accepted) this.fishingCastIssued = false;
  }

  private issueFishingReel(): void {
    if (this.fishingMode !== 'bite' || this.fishingReelIssued || this.paused) return;
    this.fishingReelIssued = true;
    const accepted = this.onFishingReel?.() ?? false;
    if (!accepted) this.fishingReelIssued = false;
  }

  private readonly handleFishingPointerUp = (event: PointerEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)
      || !this.fishingLayer.contains(target)
      || target.closest('[data-fishing-bite]') !== null
      || target.closest('[data-fishing-view-exit]') !== null
      || this.modalFocus.topmostModal() !== this.fishingLayer
      || this.fishingMode !== 'aiming') return;
    this.suppressFishingClick = true;
    this.issueFishingCast(event.clientX, event.clientY);
    queueMicrotask(() => { this.suppressFishingClick = false; });
  };
}
