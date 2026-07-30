import { ITEM_DEFINITIONS, ITEM_LABELS, type ItemInstanceId } from '../game/ItemState';
import { formatJournalEntry, type JournalEntry } from '../survival/journal';
import { SURVIVAL_ITEM_DESCRIPTIONS } from '../survival/itemDescriptions';
import { repairEnergyCost, SURVIVAL_BALANCE } from '../survival/survivalBalance';
import type { BoatInteractionAnchor, BoatToolId, ProjectedBoatBounds } from '../survival/BoatInteraction';
import type {
  ActionOutcome,
  DayActionId,
  DayActionOption,
  EventResponseId,
  ResourceDelta,
  SurvivalEventDefinition,
  SurvivalSnapshot,
  SurvivalState,
  WeatherId,
} from '../survival/survivalTypes';
import { formatDuration } from './formatDuration';
import { uiArtwork, type UiArtworkId } from './uiArtwork';

interface ActionDefinition {
  id: DayActionId;
  label: string;
  cost: string;
  energyCost: number;
  effect: string;
  risk: 'safe' | 'uncertain' | 'dangerous';
}

interface ActionPreview {
  cost: string;
  energyCost: number;
  effect: string;
  risk: ActionDefinition['risk'];
}

interface BoatToolCopy {
  label: string;
  description: string;
}

const BOAT_TOOL_COPY: Readonly<Record<BoatToolId, BoatToolCopy>> = Object.freeze({
  repairTools: {
    label: 'REPAIR',
    description: 'Use the open repair toolbox to repair the lifeboat.',
  },
  fishingRod: {
    label: 'FISH',
    description: 'Cast from the bow to find food or drifting junk. Bait is used automatically when available.',
  },
  lantern: {
    label: 'END DAY',
    description: 'Douse the lantern to end the current day. Energy is restored at dawn.',
  },
  chest: {
    label: 'CHEST',
    description: 'Open the recovered chest. The task costs three energy.',
  },
});

type MeterId = 'health' | 'hunger' | 'energy' | 'hull';

const METER_ARTWORK: Record<MeterId, UiArtworkId> = {
  health: 'health',
  hunger: 'hunger',
  energy: 'energy',
  hull: 'hull',
};

interface MeterDefinition {
  id: MeterId;
  label: string;
  min: number;
  max: number;
  dangerLabel: 'LOW' | 'HIGH';
  displayValue: (value: number) => number;
  isDanger: (value: number) => boolean;
}

const ACTIONS: readonly ActionDefinition[] = [
  { id: 'fish', label: 'FISH', cost: '1 ENERGY', energyCost: SURVIVAL_BALANCE.actions.fishEnergy, effect: 'Chance to gain food', risk: 'uncertain' },
  { id: 'dive', label: 'DIVE', cost: '3 ENERGY', energyCost: SURVIVAL_BALANCE.actions.diveEnergy, effect: 'May recover supplies; injury risk', risk: 'dangerous' },
  { id: 'eat', label: 'EAT', cost: '1 FOOD', energyCost: 0, effect: 'HUNGER -35', risk: 'safe' },
  { id: 'repair', label: 'REPAIR', cost: 'ENERGY + MATERIAL', energyCost: 0, effect: 'HULL +25 (tape +15)', risk: 'safe' },
  { id: 'treat', label: 'TREAT', cost: '1 MEDKIT', energyCost: 0, effect: 'HEALTH +30', risk: 'safe' },
  { id: 'endDay', label: 'END DAY', cost: 'REST', energyCost: 0, effect: 'RESTORE ENERGY AT DAWN', risk: 'safe' },
  { id: 'repairItem', label: 'REPAIR ITEM', cost: '1 DUCT TAPE', energyCost: 0, effect: 'Restore one broken item', risk: 'safe' },
  { id: 'sendMessage', label: 'SEND MESSAGE', cost: '1 ENERGY', energyCost: SURVIVAL_BALANCE.actions.bottledPaperEnergy, effect: 'RESCUE +15', risk: 'safe' },
  { id: 'useEnergyBar', label: 'EAT ENERGY BAR', cost: '1 ENERGY BAR', energyCost: 0, effect: 'ENERGY TO 3', risk: 'safe' },
  { id: 'openChest', label: 'OPEN CHEST', cost: '3 ENERGY', energyCost: 3, effect: 'RECOVER A SUPPLY', risk: 'uncertain' },
];

const ENERGY_WORDS = ['', 'one', 'two', 'three'] as const;

function spokenEnergyCost(cost: number): string | null {
  if (cost <= 0) return null;
  return `${ENERGY_WORDS[cost] ?? String(cost)} energy`;
}

function quantityLabel(label: string, quantity: number): string {
  return quantity > 1 ? `${label} ×${quantity}` : label;
}

function actionPreview(definition: ActionDefinition, snapshot: SurvivalSnapshot): ActionPreview {
  const missingHull = Math.max(0, 100 - snapshot.hull);
  switch (definition.id) {
    case 'eat': return { ...definition, effect: `HUNGER -${Math.min(35, snapshot.hunger)}` };
    case 'treat': return { ...definition, effect: `HEALTH +${Math.min(30, Math.max(0, 100 - snapshot.health))}` };
    case 'repair': {
      const energyCost = repairEnergyCost(snapshot.hull);
      const useTape = snapshot.repairMaterial < 1
        && Object.values(snapshot.inventory).some(
          (item) => item?.type === 'ductTape' && item.condition === 'usable',
        );
      return {
        ...definition,
        cost: `${energyCost} ENERGY + ${useTape ? 'TAPE' : 'MATERIAL'}`,
        energyCost,
        effect: `HULL +${Math.min(useTape ? 15 : 25, missingHull)}`,
      };
    }
    default: return definition;
  }
}

const identity = (value: number): number => value;

const METERS: readonly MeterDefinition[] = [
  { id: 'health', label: 'HEALTH', min: 0, max: 100, dangerLabel: 'LOW', displayValue: identity, isDanger: (value) => value <= 20 },
  { id: 'hunger', label: 'FOOD', min: 0, max: 100, dangerLabel: 'LOW', displayValue: (value) => 100 - value, isDanger: (value) => value <= 30 },
  { id: 'energy', label: 'ENERGY', min: 0, max: SURVIVAL_BALANCE.actions.maximumEnergy, dangerLabel: 'LOW', displayValue: identity, isDanger: (value) => value <= 1 },
  { id: 'hull', label: 'HULL', min: 0, max: 100, dangerLabel: 'LOW', displayValue: identity, isDanger: (value) => value <= 20 },
];

const PHASE_LABELS: Readonly<Record<SurvivalState, string>> = {
  day: 'DAYLIGHT',
  dayEvent: 'DAY EVENT',
  nightEvent: 'NIGHT EVENT',
  rescued: 'RESCUED',
  dead: 'LOST AT SEA',
  sunk: 'BOAT LOST',
};

const WEATHER_LABELS: Readonly<Record<WeatherId, string>> = {
  calm: 'CALM',
  overcast: 'OVERCAST',
  squall: 'SQUALL',
};

const SLEEP_TRANSITION_MS = 2_500;
const SLEEP_HOLD_MS = 450;
const FISHING_FADE_MS = 180;
const EVENT_CHOICE_BEAT_MS = 240;
const EVENT_OUTCOME_HOLD_MS = 2_000;
const ROUTINE_DIALOG_MARGIN = 20;
const ROUTINE_DIALOG_GAP = 22;

interface RoutineDialogPlacement {
  readonly anchorId: string;
  readonly fallbackX: number;
  readonly fallbackY: number;
  readonly width: number;
  readonly height: number;
}

const ROUTINE_DIALOG_PLACEMENTS: Readonly<Record<'fishing' | 'repair' | 'salvage', RoutineDialogPlacement>> = {
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
  salvage: {
    anchorId: 'drifting-loot',
    fallbackX: 0.68,
    fallbackY: 0.58,
    width: 360,
    height: 250,
  },
};

function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing survival UI element: ${selector}`);
  return element;
}

function meterMarkup(meter: MeterDefinition): string {
  return `
    <div class="survival-meter survival-condition survival-meter--${meter.id}" data-meter="${meter.id}" role="meter"
      aria-label="${meter.label}" aria-valuemin="${meter.min}" aria-valuemax="${meter.max}" aria-valuenow="${meter.min}">
      ${uiArtwork(METER_ARTWORK[meter.id], 'survival-condition__art')}
      <span class="survival-meter__label ui-role-context">${meter.label}<span class="survival-meter__danger" data-meter-danger aria-hidden="true" hidden>${meter.dangerLabel}</span></span>
      <div class="survival-meter__track" aria-hidden="true"><div class="survival-meter__fill"></div></div>
      <span class="survival-meter__value ui-role-numeral" data-meter-value>0</span>
    </div>`;
}

export type FishingUiMode = 'hidden' | 'aiming' | 'waiting' | 'bite' | 'result';

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

export interface DriftingLootResultView {
  readonly caption: string;
  readonly title: string;
  readonly detail: string;
  readonly target: ProjectedBoatBounds | null;
}

export interface EventContextChoice {
  readonly id: EventResponseId;
  readonly label: string;
  readonly unavailableReason: string | null;
  readonly anchorId?: string;
  readonly energyCost?: number;
}

interface PendingFade {
  readonly finish: () => void;
}

interface AnchorTooltipNodes {
  readonly tooltip: HTMLElement;
  readonly label: Text;
  readonly separator: Text;
  readonly energy: HTMLElement;
}

interface AnchorLayoutState {
  readonly visible: boolean;
  readonly x: number;
  readonly y: number;
  readonly targetKind: 'item' | 'tool' | 'event';
  readonly width: number;
  readonly height: number;
  readonly zIndex: number;
  readonly depleted: boolean;
}

const DEFAULT_ANCHOR_HIT_AREA = Object.freeze({
  width: 54,
  height: 54,
  depth: 0,
});

export class SurvivalUI {
  onAction: (action: DayActionId, option?: DayActionOption) => void = () => undefined;
  onEventItem: (choiceId: EventResponseId, instanceId: ItemInstanceId) => void = () => undefined;
  onEventChoice: (choiceId: EventResponseId) => void = () => undefined;
  onEndure: () => void = () => undefined;
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
  onDriftingLootContinue: (() => void) | null = null;

  private readonly root: HTMLDivElement;
  private readonly day: HTMLElement;
  private readonly weather: HTMLElement;
  private readonly phase: HTMLElement;
  private readonly topControls: HTMLElement;
  private readonly journalMarker: HTMLButtonElement;
  private readonly journalUnread: HTMLElement;
  private readonly announcer: HTMLElement;
  private readonly feedback: HTMLElement;
  private readonly sleepCover: HTMLElement;
  private readonly anchorLayer: HTMLElement;
  private readonly eventCaption: HTMLElement;
  private readonly eventTitle: HTMLElement;
  private readonly eventChoices: HTMLElement;
  private readonly endureButton: HTMLButtonElement;
  private readonly fishingLayer: HTMLElement;
  private readonly fishingLive: HTMLElement;
  private readonly fishingBiteTarget: HTMLButtonElement;
  private readonly fishingFade: HTMLElement;
  private readonly fishingResultLayer: HTMLElement;
  private readonly fishingResultCaption: HTMLElement;
  private readonly fishingResultTitle: HTMLElement;
  private readonly fishingResultDetail: HTMLElement;
  private readonly fishingResultContinue: HTMLButtonElement;
  private readonly driftingLootResultLayer: HTMLElement;
  private readonly driftingLootResultCaption: HTMLElement;
  private readonly driftingLootResultTitle: HTMLElement;
  private readonly driftingLootResultDetail: HTMLElement;
  private readonly driftingLootResultContinue: HTMLButtonElement;
  private readonly fishingViewExit: HTMLButtonElement;
  private readonly repairOptionsLayer: HTMLElement;
  private readonly repairOptionsTitle: HTMLElement;
  private readonly repairTargets: HTMLElement;
  private readonly pauseLayer: HTMLElement;
  private readonly resumeButton: HTMLButtonElement;
  private readonly journalLayer: HTMLElement;
  private readonly journalTitle: HTMLElement;
  private readonly journalWeather: HTMLElement;
  private readonly journalDay: HTMLElement;
  private readonly journalNight: HTMLElement;
  private readonly journalPageCount: HTMLElement;
  private readonly journalPrevious: HTMLButtonElement;
  private readonly journalNext: HTMLButtonElement;
  private readonly journalClose: HTMLButtonElement;
  private readonly endingLayer: HTMLElement;
  private readonly endingTitle: HTMLElement;
  private readonly endingBody: HTMLElement;
  private readonly endingStats: HTMLElement;
  private readonly restartButton: HTMLButtonElement;
  private readonly backgroundRegions: HTMLElement[];
  private readonly modalLayers: HTMLElement[];
  private readonly anchorButtons = new Map<string, HTMLButtonElement>();
  private readonly anchorTooltipNodes = new WeakMap<HTMLButtonElement, AnchorTooltipNodes>();
  private readonly anchors = new Map<string, BoatInteractionAnchor>();
  private readonly anchorLayouts = new Map<string, AnchorLayoutState>();
  private readonly meterElements = new Map<MeterId, HTMLElement>();
  private readonly actionReasons = new Map<DayActionId, string | null>();
  private readonly lastValues = new Map<string, string | number | boolean | null>();
  private busy = false;
  private paused = false;
  private disposed = false;
  private announcementVersion = 0;
  private feedbackTimer: number | undefined;
  private restartIssued = false;
  private focusReturnTarget: HTMLElement | null = null;
  private pauseReturnTarget: HTMLElement | null = null;
  private fishingReturnTarget: HTMLElement | null = null;
  private latestCommandOrigin: HTMLButtonElement | null = null;
  private currentSnapshot: SurvivalSnapshot | null = null;
  private journalEntries: readonly JournalEntry[] = [];
  private journalIndex = 0;
  private hoveredAnchorId: string | null = null;
  private focusedAnchorId: string | null = null;
  private publishedAnchorId: string | null = null;
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
  private pendingEventChoiceBeat: PendingFade | null = null;
  private pendingEventOutcomeHold: PendingFade | null = null;
  private pendingCoveredSceneSettle: PendingFade | null = null;
  private fishingResultContinueIssued = false;
  private fishingResultTarget: ProjectedBoatBounds | null = null;
  private driftingLootContinueIssued = false;
  private driftingLootResultTarget: ProjectedBoatBounds | null = null;
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
      <div class="sleep-cover" data-sleep-cover aria-hidden="true"></div>
      <div class="survival-top" data-survival-top>
        <div class="survival-top__status-row">
          <button type="button" class="journal-marker" data-journal-open aria-label="Open journal">
            ${uiArtwork('journal', 'journal-marker__art')}
            <span class="journal-marker__unread ui-role-context" data-journal-unread hidden>NEW</span>
          </button>
          <section class="survival-status" data-survival-status aria-label="Current survival day">
            <strong class="ui-role-numeral" data-day>DAY 1</strong>
            <span class="survival-status__detail ui-role-context"><span data-phase>DAYLIGHT</span><span aria-hidden="true"> &middot; </span><span data-weather>CALM</span></span>
          </section>
        </div>
      </div>
      <section class="survival-meters" aria-label="Condition meters">
        ${METERS.map(meterMarkup).join('')}
      </section>
      <div class="boat-anchors" data-boat-anchors aria-label="Boat interaction points"></div>
      <section class="fishing-layer" data-fishing role="region" aria-label="Fishing interaction" aria-hidden="true" inert tabindex="-1">
        <div class="survival-announcer" data-fishing-live aria-live="polite" aria-atomic="true"></div>
        <button type="button" class="fishing-bite-target" data-fishing-bite aria-label="BITE - REEL NOW" hidden></button>
        <button type="button" class="fishing-view-exit ui-role-context" data-fishing-view-exit aria-label="Return to boat view" hidden>
          <span class="fishing-view-exit__arrow" aria-hidden="true"></span>
        </button>
      </section>
      <div class="fishing-fade" data-fishing-fade aria-hidden="true"></div>
      <section class="routine-dialog routine-dialog--fishing" data-fishing-result role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="fishing-result-title" inert>
        <div class="routine-dialog__card fishing-result-card">
          <p class="eyebrow ui-role-context" data-fishing-result-caption></p>
          <h2 class="ui-role-display" id="fishing-result-title" data-fishing-result-title></h2>
          <p class="fishing-result-detail ui-role-narrative" data-fishing-result-detail></p>
          <button type="button" class="primary-action salvage-action ui-role-context" data-fishing-result-continue aria-label="Continue">
            CONTINUE
          </button>
        </div>
      </section>
      <section class="routine-dialog routine-dialog--salvage" data-drifting-loot-result role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="drifting-loot-result-title" inert>
        <div class="routine-dialog__card fishing-result-card">
          <p class="eyebrow ui-role-context" data-drifting-loot-result-caption></p>
          <h2 class="ui-role-display" id="drifting-loot-result-title" data-drifting-loot-result-title></h2>
          <p class="fishing-result-detail ui-role-narrative" data-drifting-loot-result-detail></p>
          <button type="button" class="primary-action salvage-action ui-role-context" data-drifting-loot-result-continue aria-label="Continue">CONTINUE</button>
        </div>
      </section>
      <section class="routine-dialog routine-dialog--repair" data-repair-options role="dialog" aria-modal="true" aria-hidden="true" aria-label="Repair target" inert>
        <div class="routine-dialog__card">
          <p class="eyebrow ui-role-context">DUCT TAPE</p>
          <h2 class="ui-role-display" data-repair-options-title tabindex="-1">Choose an item to repair</h2>
          <p class="ui-role-narrative">One emergency repair restores one broken item.</p>
          <div class="repair-targets" data-repair-targets></div>
          <button type="button" class="secondary-action salvage-action ui-role-context" data-repair-cancel aria-label="Cancel repair">
            CANCEL
          </button>
        </div>
      </section>
      <section class="event-caption" data-event-caption aria-hidden="true" aria-live="polite">
        <h2 class="ui-role-display" data-event-title></h2>
        <nav class="event-choices" data-event-choices aria-label="Event choices" hidden></nav>
      </section>
      <button type="button" class="event-endure salvage-action ui-role-context" data-endure aria-label="Endure" hidden>
        ENDURE
      </button>
      <section class="survival-overlay journal-overlay" data-journal role="dialog" aria-modal="true" aria-hidden="true" aria-label="Survival journal" inert>
        <div class="journal-book" data-journal-book>
          <div class="journal-book__cover" aria-hidden="true"></div>
          <div class="journal-book__rings" data-journal-rings aria-hidden="true"><i data-journal-ring></i><i data-journal-ring></i><i data-journal-ring></i></div>
          <div class="journal-book__tabs" data-journal-tabs aria-hidden="true"><i data-journal-tab></i><i data-journal-tab></i><i data-journal-tab></i><i data-journal-tab></i></div>
          <article class="journal-page">
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
            <button type="button" class="journal-page__close-strip ui-role-context" data-journal-close>X  CLOSE JOURNAL</button>
          </article>
        </div>
      </section>
      <section class="survival-overlay pause-overlay cinematic-overlay" data-pause role="dialog" aria-modal="true" aria-hidden="true" aria-label="Survival paused" inert>
        <div class="cinematic-overlay__content">
          <p class="eyebrow ui-role-context">PAUSED</p>
          <h2 class="ui-role-display">Hold Fast</h2>
          <p class="ui-role-narrative">The sea will wait until you return.</p>
          <button type="button" class="primary-action salvage-action ui-role-context" data-resume aria-label="Resume">
            RESUME
          </button>
        </div>
      </section>
      <section class="survival-overlay ending-overlay cinematic-overlay" data-ending role="dialog" aria-modal="true" aria-hidden="true" aria-label="Journey ended" inert>
        <div class="cinematic-overlay__content">
          <p class="eyebrow ui-role-context">JOURNEY ENDED</p>
          <h2 class="ui-role-display" data-ending-title tabindex="-1" role="alert"></h2>
          <p class="ui-role-narrative" data-ending-body></p>
          <p class="ending-stats ui-role-numeral" data-ending-stats></p>
          <button type="button" class="primary-action salvage-action ui-role-context" data-restart aria-label="Start from the ship">
            START FROM THE SHIP
          </button>
        </div>
      </section>
    `;
    mount.append(this.root);

    this.day = requireElement(this.root, '[data-day]');
    this.weather = requireElement(this.root, '[data-weather]');
    this.phase = requireElement(this.root, '[data-phase]');
    this.topControls = requireElement(this.root, '[data-survival-top]');
    this.journalMarker = requireElement(this.root, '[data-journal-open]');
    this.journalUnread = requireElement(this.root, '[data-journal-unread]');
    this.announcer = requireElement(this.root, '[data-survival-announcer]');
    this.feedback = requireElement(this.root, '[data-survival-feedback]');
    this.sleepCover = requireElement(this.root, '[data-sleep-cover]');
    this.anchorLayer = requireElement(this.root, '[data-boat-anchors]');
    this.eventCaption = requireElement(this.root, '[data-event-caption]');
    this.eventTitle = requireElement(this.root, '[data-event-title]');
    this.eventChoices = requireElement(this.root, '[data-event-choices]');
    this.endureButton = requireElement(this.root, '[data-endure]');
    this.fishingLayer = requireElement(this.root, '[data-fishing]');
    this.fishingLive = requireElement(this.root, '[data-fishing-live]');
    this.fishingBiteTarget = requireElement(this.root, '[data-fishing-bite]');
    this.fishingFade = requireElement(this.root, '[data-fishing-fade]');
    this.fishingResultLayer = requireElement(this.root, '[data-fishing-result]');
    this.fishingResultCaption = requireElement(this.root, '[data-fishing-result-caption]');
    this.fishingResultTitle = requireElement(this.root, '[data-fishing-result-title]');
    this.fishingResultDetail = requireElement(this.root, '[data-fishing-result-detail]');
    this.fishingResultContinue = requireElement(this.root, '[data-fishing-result-continue]');
    this.driftingLootResultLayer = requireElement(this.root, '[data-drifting-loot-result]');
    this.driftingLootResultCaption = requireElement(this.root, '[data-drifting-loot-result-caption]');
    this.driftingLootResultTitle = requireElement(this.root, '[data-drifting-loot-result-title]');
    this.driftingLootResultDetail = requireElement(this.root, '[data-drifting-loot-result-detail]');
    this.driftingLootResultContinue = requireElement(this.root, '[data-drifting-loot-result-continue]');
    this.fishingViewExit = requireElement(this.root, '[data-fishing-view-exit]');
    this.repairOptionsLayer = requireElement(this.root, '[data-repair-options]');
    this.repairOptionsTitle = requireElement(this.root, '[data-repair-options-title]');
    this.repairTargets = requireElement(this.root, '[data-repair-targets]');
    this.pauseLayer = requireElement(this.root, '[data-pause]');
    this.resumeButton = requireElement(this.root, '[data-resume]');
    this.journalLayer = requireElement(this.root, '[data-journal]');
    this.journalTitle = requireElement(this.root, '[data-journal-title]');
    this.journalWeather = requireElement(this.root, '[data-journal-weather]');
    this.journalDay = requireElement(this.root, '[data-journal-day]');
    this.journalNight = requireElement(this.root, '[data-journal-night]');
    this.journalPageCount = requireElement(this.root, '[data-journal-page-count]');
    this.journalPrevious = requireElement(this.root, '[data-journal-previous]');
    this.journalNext = requireElement(this.root, '[data-journal-next]');
    this.journalClose = requireElement(this.root, '[data-journal-close]');
    this.endingLayer = requireElement(this.root, '[data-ending]');
    this.endingTitle = requireElement(this.root, '[data-ending-title]');
    this.endingBody = requireElement(this.root, '[data-ending-body]');
    this.endingStats = requireElement(this.root, '[data-ending-stats]');
    this.restartButton = requireElement(this.root, '[data-restart]');
    this.backgroundRegions = [this.topControls, this.anchorLayer];
    this.modalLayers = [
      this.pauseLayer,
      this.journalLayer,
      this.repairOptionsLayer,
      this.endingLayer,
      this.driftingLootResultLayer,
      this.fishingResultLayer,
      this.fishingLayer,
    ];

    ACTIONS.forEach(({ id }) => this.actionReasons.set(id, null));
    METERS.forEach(({ id }) => this.meterElements.set(id, requireElement(this.root, `[data-meter="${id}"]`)));

    this.root.addEventListener('click', this.handleClick);
    this.root.addEventListener('pointerup', this.handleFishingPointerUp);
    this.root.addEventListener('pointerover', this.handleAnchorPointerOver);
    this.root.addEventListener('pointerout', this.handleAnchorPointerOut);
    this.root.addEventListener('focusin', this.handleAnchorFocusIn);
    this.root.addEventListener('focusout', this.handleAnchorFocusOut);
    document.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('resize', this.handleWindowResize);
  }

  render(snapshot: SurvivalSnapshot, unavailable: (action: DayActionId) => string | null): void {
    if (this.disposed) return;
    this.currentSnapshot = snapshot;
    this.updateText('day', this.day, `DAY ${snapshot.day}`);
    this.updateText('weather', this.weather, WEATHER_LABELS[snapshot.weather]);
    this.updateText('phase', this.phase, PHASE_LABELS[snapshot.state]);

    METERS.forEach(({ id }) => this.updateMeter(id, snapshot[id]));
    ACTIONS.forEach(({ id }) => {
      const reason = unavailable(id);
      this.actionReasons.set(id, reason);
    });
    this.anchors.forEach((anchor, id) => this.refreshAnchorTooltip(this.anchorButtons.get(id)!, anchor));
    this.syncCommandState();
  }

  setAnchors(anchors: readonly BoatInteractionAnchor[]): void {
    if (this.disposed) return;
    const seen = new Set<string>();
    let highlightInvalidated = false;
    for (const anchor of anchors) {
      seen.add(anchor.id);
      if (!anchor.visible || !this.isHighlightableAnchor(anchor)) {
        highlightInvalidated = this.invalidateAnchorHighlight(anchor.id) || highlightInvalidated;
      }
      this.anchors.set(anchor.id, anchor);
      const button = this.anchorButtons.get(anchor.id) ?? this.createAnchorButton(anchor);
      const itemTarget = anchor.itemType !== null;
      const targetKind = itemTarget
        ? 'item'
        : anchor.eventChoiceId === undefined ? 'tool' : 'event';
      const hitArea = anchor.hitArea ?? DEFAULT_ANCHOR_HIT_AREA;
      const x = Math.round(anchor.x);
      const y = Math.round(anchor.y);
      const targetWidth = Math.round(hitArea.width);
      const targetHeight = Math.round(hitArea.height);
      const zIndex = Math.max(1, 100000 - Math.round(hitArea.depth * 100));
      const previous = this.anchorLayouts.get(anchor.id);
      if (
        previous === undefined
        || previous.visible !== anchor.visible
        || previous.x !== x
        || previous.y !== y
        || previous.targetKind !== targetKind
        || previous.width !== targetWidth
        || previous.height !== targetHeight
        || previous.zIndex !== zIndex
        || previous.depleted !== anchor.depleted
      ) {
        this.anchorLayouts.set(anchor.id, {
          visible: anchor.visible,
          x,
          y,
          targetKind,
          width: targetWidth,
          height: targetHeight,
          zIndex,
          depleted: anchor.depleted,
        });
        button.hidden = !anchor.visible;
        button.style.transform = `translate(${x}px, ${y}px)`;
        button.dataset.targetKind = targetKind;
        button.style.width = `${targetWidth}px`;
        button.style.height = `${targetHeight}px`;
        button.style.marginLeft = `${-targetWidth / 2}px`;
        button.style.marginTop = `${-targetHeight / 2}px`;
        button.style.zIndex = String(zIndex);
        this.placeAnchorTooltip(button, x, y);
        button.classList.toggle('is-depleted', anchor.depleted);
      }
      this.refreshAnchorTooltip(button, anchor);
    }
    this.anchorButtons.forEach((button, id) => {
      if (seen.has(id)) return;
      highlightInvalidated = this.invalidateAnchorHighlight(id) || highlightInvalidated;
      button.remove();
      this.anchorButtons.delete(id);
      this.anchors.delete(id);
      this.anchorLayouts.delete(id);
    });
    if (highlightInvalidated) this.publishAnchorHighlight();
    this.positionOpenRoutineDialogs();
    this.syncCommandState();
  }

  setJournalUnread(unread: boolean): void {
    if (this.disposed) return;
    this.journalUnread.hidden = !unread;
    this.journalMarker.dataset.unread = String(unread);
    this.journalMarker.setAttribute(
      'aria-label',
      unread ? 'Open journal, new entry available' : 'Open journal',
    );
  }

  beginEventPresentation(): void {
    if (this.disposed) return;
    this.eventPresentationActive = true;
    this.syncCommandState();
  }

  showEventReveal(
    event: Pick<SurvivalEventDefinition, 'id' | 'title' | 'danger'>,
  ): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.updateText('event:title', this.eventTitle, event.title);
    this.eventCaption.dataset.eventId = event.id;
    this.eventCaption.dataset.danger = event.danger;
    this.eventCaption.setAttribute(
      'aria-label',
      `${event.danger[0]!.toUpperCase()}${event.danger.slice(1)} event: ${event.title}`,
    );
    this.eventPresentationActive = true;
    this.eventCaption.classList.add('is-visible');
    this.eventCaption.setAttribute('aria-hidden', 'false');
    this.syncCommandState();
    return Promise.resolve();
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
    this.renderContextualEventChoices();
    this.endureButton.hidden = eligible.size > 0 || contextualChoices.length > 0;
    this.anchors.forEach((anchor, id) => {
      this.refreshAnchorTooltip(this.anchorButtons.get(id)!, anchor);
    });
    this.syncCommandState();
  }

  setEventUsing(instanceId: ItemInstanceId): void {
    if (this.disposed || this.eventEligibility === null) return;
    this.eventSelectedInstanceId = instanceId;
    this.syncCommandState();
  }

  playEventChoiceBeat(choiceId: EventResponseId): Promise<void> {
    if (this.disposed || !this.eventPresentationActive) return Promise.resolve();
    const button = [
      ...this.eventChoices.querySelectorAll<HTMLButtonElement>('[data-event-choice]'),
      ...this.anchorButtons.values(),
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
    this.syncCommandState();
    const delay = EVENT_CHOICE_BEAT_MS;
    return new Promise((resolve) => {
      let settled = false;
      let timer = 0;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        button.removeEventListener('animationend', handleAnimationEnd);
        if (this.pendingEventChoiceBeat?.finish === finish) this.pendingEventChoiceBeat = null;
        resolve();
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
    this.pendingEventChoiceBeat?.finish();
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
    this.eventChoices.replaceChildren();
    this.eventChoices.hidden = true;
    this.endureButton.hidden = true;
    this.anchors.forEach((anchor, id) => {
      this.refreshAnchorTooltip(this.anchorButtons.get(id)!, anchor);
    });
    this.syncCommandState();
    if (focusedContextualChoice) this.firstUsableAction()?.focus();
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

  setSleepCovered(covered: boolean): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.pendingSleepTransition?.finish();
    this.sleepCover.classList.toggle('is-covered', covered);
    const delay = SLEEP_TRANSITION_MS;
    return new Promise((resolve) => {
      let settled = false;
      let timer = 0;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        this.sleepCover.removeEventListener('transitionend', handleTransitionEnd);
        if (this.pendingSleepTransition?.finish === finish) this.pendingSleepTransition = null;
        resolve();
      };
      const handleTransitionEnd = (event: TransitionEvent): void => {
        if (event.target === this.sleepCover && event.propertyName === 'opacity') finish();
      };
      this.sleepCover.addEventListener('transitionend', handleTransitionEnd);
      timer = window.setTimeout(finish, delay);
      this.pendingSleepTransition = { finish };
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
        if (frame !== 0) window.cancelAnimationFrame(frame);
        if (this.pendingCoveredSceneSettle?.finish === finish) {
          this.pendingCoveredSceneSettle = null;
        }
        resolve();
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
      if (this.topmostModal() === null && !this.busy) this.restoreFishingFocus(target);
      return;
    }

    this.showLayer(this.fishingLayer);
    if (this.topmostModal() === this.fishingLayer && modeChanged) this.focusModal(this.fishingLayer);
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
    this.fishingResultContinue.focus();
  }

  hideFishingResult(): void {
    if (this.disposed) return;
    this.hideLayer(this.fishingResultLayer);
    this.fishingResultTarget = null;
  }

  showDriftingLootResult(view: DriftingLootResultView): void {
    if (this.disposed) return;
    this.driftingLootContinueIssued = false;
    this.driftingLootResultCaption.textContent = view.caption;
    this.driftingLootResultTitle.textContent = view.title;
    this.driftingLootResultDetail.textContent = view.detail;
    this.driftingLootResultTarget = view.target === null
      ? null
      : Object.freeze({ ...view.target });
    this.showLayer(this.driftingLootResultLayer);
    this.driftingLootResultContinue.focus();
  }

  hideDriftingLootResult(): void {
    if (this.disposed) return;
    this.hideLayer(this.driftingLootResultLayer);
    this.driftingLootResultTarget = null;
  }

  setFishingViewExitVisible(visible: boolean): void {
    if (this.disposed) return;
    this.fishingViewExit.hidden = !visible;
    this.root.dataset.fishingExitVisible = String(visible);
    if (visible) this.clearAnchorHighlight();
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
        window.clearTimeout(timer);
        this.fishingFade.removeEventListener('transitionend', handleTransitionEnd);
        if (this.pendingFishingFade?.finish === finish) this.pendingFishingFade = null;
        resolve();
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
        window.clearTimeout(timer);
        if (this.pendingEventOutcomeHold?.finish === finish) {
          this.pendingEventOutcomeHold = null;
        }
        resolve();
      };
      timer = window.setTimeout(finish, delay);
      this.pendingEventOutcomeHold = { finish };
    });
  }

  showJournal(entries: readonly JournalEntry[]): void {
    if (this.disposed) return;
    this.focusReturnTarget = this.journalMarker;
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
    this.showLayer(this.journalLayer);
    this.journalTitle.focus();
  }

  hideJournal(): void {
    if (this.disposed) return;
    this.hideLayer(this.journalLayer);
    this.restoreFocus();
  }

  setBusy(busy: boolean): void {
    if (this.disposed || this.busy === busy) return;
    this.busy = busy;
    if (busy) {
      this.clearAnchorHighlight();
      this.root.setAttribute('aria-busy', 'true');
    } else {
      this.root.removeAttribute('aria-busy');
    }
    this.syncCommandState();
  }

  setPaused(paused: boolean): void {
    if (this.disposed || paused === this.paused) return;
    if (paused && !this.paused) {
      this.pauseReturnTarget = this.resolveCommandOrigin();
    }
    this.paused = paused;
    if (paused) {
      this.showLayer(this.pauseLayer);
      this.resumeButton.focus();
    } else {
      this.hideLayer(this.pauseLayer);
      const target = this.pauseReturnTarget;
      this.pauseReturnTarget = null;
      const underlyingModal = this.topmostModal();
      if (underlyingModal !== null) this.focusModal(underlyingModal);
      else this.restoreCommandFocus(target);
    }
  }

  showEnding(
    state: 'rescued' | 'dead' | 'sunk',
    day: number,
    seed: number,
    scavengeElapsedSeconds: number,
  ): void {
    if (this.disposed) return;
    const copy = state === 'rescued'
      ? { title: 'Rescue found you.', body: 'A vessel cuts across the horizon and carries you home.' }
      : state === 'dead'
        ? { title: 'The sea outlasted you.', body: 'Your empty lifeboat drifts on beneath the weather.' }
        : { title: 'Boat is gone.', body: 'The damaged hull slips under and leaves no refuge behind.' };
    this.clearEventPresentation();
    this.setPaused(false);
    this.updateText('ending:title', this.endingTitle, copy.title);
    this.updateText('ending:body', this.endingBody, copy.body);
    this.updateText(
      'ending:stats',
      this.endingStats,
      `${day} ${day === 1 ? 'DAY' : 'DAYS'} SURVIVED · ${formatDuration(scavengeElapsedSeconds)} SCAVENGING · SEED ${seed}`,
    );
    this.endingLayer.dataset.ending = state;
    this.restartIssued = false;
    this.restartButton.disabled = false;
    this.showLayer(this.endingLayer);
    this.endingTitle.focus();
  }

  dispose(): void {
    if (this.disposed) return;
    this.clearAnchorHighlight();
    this.eventEligibility = null;
    this.contextualEventChoices = [];
    this.eventSelectedInstanceId = null;
    this.eventSelectedChoiceId = null;
    this.eventPresentationActive = false;
    this.eventChoices.replaceChildren();
    this.eventChoices.hidden = true;
    this.endureButton.hidden = true;
    this.pendingSleepTransition?.finish();
    this.pendingFishingFade?.finish();
    this.pendingEventChoiceBeat?.finish();
    this.pendingEventOutcomeHold?.finish();
    this.pendingCoveredSceneSettle?.finish();
    this.fishingAnnouncementVersion += 1;
    this.anchorLayouts.clear();
    this.hideLayer(this.driftingLootResultLayer);
    this.driftingLootResultTarget = null;
    if (this.fishingMode !== 'hidden') {
      this.fishingLayer.classList.remove('is-visible');
      this.fishingMode = 'hidden';
      this.syncBackgroundInteraction();
      this.fishingReturnTarget = null;
    }
    this.disposed = true;
    this.announcementVersion += 1;
    window.clearTimeout(this.feedbackTimer);
    this.root.removeEventListener('click', this.handleClick);
    this.root.removeEventListener('pointerup', this.handleFishingPointerUp);
    this.root.removeEventListener('pointerover', this.handleAnchorPointerOver);
    this.root.removeEventListener('pointerout', this.handleAnchorPointerOut);
    this.root.removeEventListener('focusin', this.handleAnchorFocusIn);
    this.root.removeEventListener('focusout', this.handleAnchorFocusOut);
    document.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('resize', this.handleWindowResize);
    this.onAction = () => undefined;
    this.onEventItem = () => undefined;
    this.onEventChoice = () => undefined;
    this.onEndure = () => undefined;
    this.onRestart = () => undefined;
    this.onAnchorHighlight = () => undefined;
    this.onPauseChange = () => undefined;
    this.onJournalOpen = () => undefined;
    this.onJournalClose = () => undefined;
    this.onJournalPage = () => undefined;
    this.onFishingCast = null;
    this.onFishingReel = null;
    this.onFishingResultContinue = null;
    this.onFishingViewExit = null;
    this.onDriftingLootContinue = null;
    this.root.remove();
  }

  private renderJournalPage(): void {
    const entry = this.journalEntries[this.journalIndex];
    if (entry === undefined) {
      this.journalTitle.textContent = 'NO COMPLETED ENTRIES YET';
      this.journalWeather.textContent = '';
      this.journalDay.textContent = 'The journal is still waiting for its first completed day.';
      this.journalNight.textContent = '';
      this.journalPageCount.textContent = 'PAGE 0 OF 0';
    } else {
      const page = formatJournalEntry(entry);
      this.journalTitle.textContent = page.heading;
      this.journalWeather.textContent = page.weather;
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

  private createAnchorButton(anchor: BoatInteractionAnchor): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'boat-anchor';
    button.dataset.anchorId = anchor.id;
    const tooltip = document.createElement('span');
    tooltip.className = 'boat-tooltip ui-role-context';
    tooltip.role = 'tooltip';
    const label = document.createTextNode('');
    const separator = document.createTextNode('');
    const energy = document.createElement('span');
    energy.className = 'boat-tooltip__energy ui-role-numeral';
    energy.setAttribute('aria-hidden', 'true');
    tooltip.append(label, separator, energy);
    button.append(tooltip);
    this.anchorLayer.append(button);
    this.anchorButtons.set(anchor.id, button);
    this.anchorTooltipNodes.set(button, { tooltip, label, separator, energy });
    return button;
  }

  private refreshAnchorTooltip(button: HTMLButtonElement, anchor: BoatInteractionAnchor): void {
    const backingInstanceId = anchor.backingInstanceId !== undefined
      ? anchor.backingInstanceId
      : anchor.id.startsWith('supply:') || anchor.eventChoiceId !== undefined
        ? null
        : anchor.id as ItemInstanceId;
    const item = backingInstanceId === null
      ? undefined
      : this.currentSnapshot?.inventory[backingInstanceId];
    const fallbackQuantity = anchor.itemType === 'cannedFood' ? this.currentSnapshot?.food
      : anchor.itemType === 'baitTin' ? this.currentSnapshot?.bait : undefined;
    const quantity = anchor.quantity ?? fallbackQuantity ?? 1;
    const usableQuantity = anchor.usableQuantity ?? (
      item?.condition === 'broken' ? 0 : quantity
    );
    const brokenQuantity = anchor.brokenQuantity ?? (
      item?.condition === 'broken' ? quantity : 0
    );
    const lanternSleep = anchor.toolId === 'lantern'
      ? this.eventLanternChoice()
      : undefined;
    const anchoredChoice = this.eventPresentationActive && anchor.eventChoiceId !== undefined
      ? this.contextualEventChoices.find(({ id }) => id === anchor.eventChoiceId)
      : undefined;
    const toolCopy = lanternSleep === undefined
      ? anchor.toolId === null ? undefined : BOAT_TOOL_COPY[anchor.toolId]
      : {
          label: 'SLEEP',
          description: 'Douse the lantern to sleep through the current event.',
        };
    const itemLabel = anchor.label ?? (anchor.itemType === null
      ? anchor.supplyGroupId === 'repairMaterial'
        ? quantityLabel('REPAIR MATERIAL', quantity)
        : toolCopy?.label ?? 'UNKNOWN TOOL'
      : quantityLabel(ITEM_LABELS[anchor.itemType], quantity));
    const itemDescription = anchor.description ?? (anchor.itemType === null
      ? anchor.supplyGroupId === 'repairMaterial'
        ? 'Recovered timber, fasteners, and rope for hull repairs.'
        : toolCopy?.description ?? 'Permanent lifeboat equipment.'
      : SURVIVAL_ITEM_DESCRIPTIONS[anchor.itemType]);
    const action = lanternSleep !== undefined || anchoredChoice !== undefined || anchor.action === null
      ? null
      : ACTIONS.find(({ id }) => id === anchor.action) ?? null;
    const reason = anchoredChoice !== undefined
      ? anchoredChoice.unavailableReason
      : lanternSleep === undefined
        ? this.anchorUnavailableReason(anchor)
        : lanternSleep.unavailableReason;
    const state = brokenQuantity > 0 && usableQuantity > 0
      ? `${usableQuantity} USABLE, ${brokenQuantity} BROKEN`
      : brokenQuantity > 0 ? 'BROKEN'
      : item?.condition === 'broken' ? 'BROKEN'
      : item?.condition === 'consumed' ? 'USED'
        : item?.condition === 'lost' ? 'LOST' : null;
    const preview = action !== null && this.currentSnapshot !== null
      ? actionPreview(action, this.currentSnapshot)
      : action;
    const stateText = state === null ? '' : ` — ${state}`;
    const text = action === null || preview === null
      ? `${itemLabel}${stateText} — ${itemDescription}${reason ? ` — UNAVAILABLE: ${reason}` : ''}`
      : `${itemLabel}${stateText}${itemLabel === action.label ? '' : ` — ${action.label}`} — ${itemDescription} — ${preview.cost} — ${preview.effect} — ${preview.risk.toUpperCase()}${reason ? ` — UNAVAILABLE: ${reason}` : ''}`;
    const visibleLabel = anchor.label ?? (anchor.itemType !== null
      ? quantityLabel(ITEM_LABELS[anchor.itemType], quantity)
      : anchor.supplyGroupId === 'repairMaterial'
        ? quantityLabel('REPAIR MATERIAL', quantity)
        : anchor.toolId === 'fishingRod'
          ? 'Fishing rod'
          : anchor.toolId === 'repairTools'
            ? 'REPAIR'
            : itemLabel);
    const energyCost = anchoredChoice?.energyCost ?? preview?.energyCost ?? 0;
    const energyIndicator = anchoredChoice === undefined
      ? '⚡'.repeat(energyCost)
      : energyCost <= 0
        ? reason === null ? '' : 'UNAVAILABLE'
        : `${'⚡'.repeat(energyCost)}${reason === null ? '' : ' — INSUFFICIENT ENERGY'}`;
    const tooltipNodes = this.anchorTooltipNodes.get(button);
    if (tooltipNodes === undefined) throw new Error('Anchor tooltip nodes are missing');
    if (tooltipNodes.label.data !== visibleLabel) tooltipNodes.label.data = visibleLabel;
    const separator = energyIndicator === ''
      ? ''
      : anchoredChoice === undefined ? ' ' : ' — ';
    if (tooltipNodes.separator.data !== separator) tooltipNodes.separator.data = separator;
    if (tooltipNodes.energy.textContent !== energyIndicator) {
      tooltipNodes.energy.textContent = energyIndicator;
    }
    const spokenCost = spokenEnergyCost(energyCost);
    button.dataset.action = anchor.action ?? '';
    if (anchor.itemType === null) delete button.dataset.item;
    else button.dataset.item = anchor.itemType;
    if (anchor.toolId === null) delete button.dataset.tool;
    else button.dataset.tool = anchor.toolId;
    if (backingInstanceId === null) delete button.dataset.backingInstanceId;
    else button.dataset.backingInstanceId = backingInstanceId;
    if (item === undefined) delete button.dataset.condition;
    else button.dataset.condition = item.condition;
    const spokenUnavailable = anchoredChoice !== undefined && reason !== null
      ? ', insufficient energy'
      : '';
    button.setAttribute(
      'aria-label',
      spokenCost === null
        ? `${visibleLabel}${spokenUnavailable}`
        : `${visibleLabel}, ${spokenCost}${spokenUnavailable}`,
    );
    button.setAttribute('aria-description', text);
    button.setAttribute('aria-disabled', reason === null ? 'false' : 'true');
    button.removeAttribute('aria-keyshortcuts');
  }

  private anchorUnavailableReason(anchor: BoatInteractionAnchor): string | null {
    if (anchor.depleted) return 'This recovered item is depleted.';
    return anchor.action === null ? null : this.actionReasons.get(anchor.action) ?? null;
  }

  private placeAnchorTooltip(button: HTMLButtonElement, x: number, y: number): void {
    const bounds = this.root.getBoundingClientRect();
    const viewportWidth = bounds.width || this.root.clientWidth || window.innerWidth;
    const edgeGutter = 160;
    button.dataset.tooltipX = x < edgeGutter
      ? 'left'
      : x > viewportWidth - edgeGutter ? 'right' : 'center';
    button.dataset.tooltipY = y < 96 ? 'below' : 'above';
  }

  private updateMeter(id: MeterId, value: number): void {
    if (this.lastValues.get(`meter:${id}`) === value) return;
    this.lastValues.set(`meter:${id}`, value);
    const definition = METERS.find((meter) => meter.id === id)!;
    const meter = this.meterElements.get(id)!;
    const displayed = definition.displayValue(value);
    const safe = Math.min(definition.max, Math.max(definition.min, displayed));
    const danger = definition.isDanger(safe);
    const percentage = ((safe - definition.min) / (definition.max - definition.min)) * 100;
    meter.setAttribute('aria-valuenow', String(safe));
    meter.classList.toggle('is-danger', danger);
    requireElement<HTMLElement>(meter, '[data-meter-danger]').hidden = !danger;
    if (danger) meter.setAttribute('aria-valuetext', `${safe}, ${definition.dangerLabel.toLowerCase()}`);
    else meter.removeAttribute('aria-valuetext');
    meter.style.setProperty('--meter-value', `${percentage}%`);
    requireElement<HTMLElement>(meter, '[data-meter-value]').textContent = String(safe);
  }

  private showUnavailableActionFeedback(action: DayActionId): boolean {
    const reason = this.actionReasons.get(action);
    if (reason === null || reason === undefined) return false;
    this.showFeedback({ accepted: false, message: reason });
    return true;
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
    this.journalMarker.disabled = this.busy;
    const lanternChoice = this.eventLanternChoice();
    this.anchorButtons.forEach((button, id) => {
      const anchor = this.anchors.get(id);
      const reason = anchor === undefined ? null : this.anchorUnavailableReason(anchor);
      delete button.dataset.eventChoice;
      const anchoredChoice = this.eventPresentationActive
        ? this.contextualEventChoices.find(({ anchorId }) => anchorId === id)
        : undefined;
      if (anchor !== undefined && anchoredChoice !== undefined) {
        button.dataset.eventChoice = anchoredChoice.id;
        if (anchoredChoice.unavailableReason === null) {
          delete button.dataset.unavailableReason;
        } else {
          button.dataset.unavailableReason = anchoredChoice.unavailableReason;
        }
        button.dataset.eventState = this.eventSelectedChoiceId === anchoredChoice.id
          ? 'selected'
          : 'eligible';
        button.disabled = false;
        button.setAttribute(
          'aria-disabled',
          anchoredChoice.unavailableReason === null
            && !this.busy
            && this.eventSelectedChoiceId === null
            ? 'false'
            : 'true',
        );
        return;
      }
      if (
        this.eventPresentationActive
        && anchor?.toolId === 'lantern'
        && lanternChoice !== undefined
      ) {
        button.dataset.eventChoice = lanternChoice.id;
        if (lanternChoice.unavailableReason === null) {
          delete button.dataset.unavailableReason;
        } else {
          button.dataset.unavailableReason = lanternChoice.unavailableReason;
        }
        button.dataset.eventState = this.eventSelectedChoiceId === lanternChoice.id
          ? 'selected'
          : 'eligible';
        button.disabled = false;
        button.setAttribute(
          'aria-disabled',
          lanternChoice.unavailableReason === null
            && !this.busy
            && this.eventSelectedChoiceId === null
            ? 'false'
            : 'true',
        );
        return;
      }
      delete button.dataset.unavailableReason;
      if (this.eventPresentationActive && anchor !== undefined && anchor.itemType !== null) {
        const instanceId = anchor.backingInstanceId ?? (
          id.startsWith('supply:') ? null : id as ItemInstanceId
        );
        if (instanceId === null) {
          button.dataset.eventState = 'muted';
          button.disabled = false;
          button.setAttribute('aria-disabled', 'true');
          return;
        }
        const eligible = this.eventEligibility?.has(instanceId) === true;
        const selected = this.eventSelectedInstanceId === instanceId;
        button.dataset.eventState = selected ? 'selected' : eligible ? 'eligible' : 'muted';
        button.disabled = false;
        button.setAttribute(
          'aria-disabled',
          eligible && !this.busy && this.eventSelectedInstanceId === null ? 'false' : 'true',
        );
        return;
      }
      delete button.dataset.eventState;
      button.disabled = this.busy;
      button.setAttribute(
        'aria-disabled',
        reason === null && !this.eventPresentationActive ? 'false' : 'true',
      );
    });
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
    this.endureButton.disabled = this.busy;
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
  }

  private eventLanternChoice(): EventContextChoice | undefined {
    if (!this.eventPresentationActive) return undefined;
    return this.contextualEventChoices.find((choice) => choice.id === 'sleep');
  }

  private isHighlightableAnchor(anchor: BoatInteractionAnchor): boolean {
    return anchor.itemType !== null
      || anchor.toolId === 'repairTools'
      || anchor.toolId === 'lantern'
      || anchor.toolId === 'chest'
      || anchor.eventChoiceId !== undefined;
  }

  private highlightAnchorId(target: EventTarget | null): string | null {
    if (!(target instanceof Element)) return null;
    const button = target.closest<HTMLButtonElement>('.boat-anchor');
    if (button === null || !this.root.contains(button)) return null;
    const anchorId = button.dataset.anchorId;
    const anchor = anchorId === undefined ? undefined : this.anchors.get(anchorId);
    return anchor !== undefined && this.isHighlightableAnchor(anchor) ? anchorId! : null;
  }

  private publishAnchorHighlight(): void {
    const next = this.focusedAnchorId ?? this.hoveredAnchorId;
    if (next === this.publishedAnchorId) return;
    this.publishedAnchorId = next;
    const anchor = next === null ? undefined : this.anchors.get(next);
    this.onAnchorHighlight(anchor?.backingInstanceId ?? next);
  }

  private invalidateAnchorHighlight(anchorId: string): boolean {
    let invalidated = false;
    if (this.hoveredAnchorId === anchorId) {
      this.hoveredAnchorId = null;
      invalidated = true;
    }
    if (this.focusedAnchorId === anchorId) {
      this.focusedAnchorId = null;
      invalidated = true;
    }
    return invalidated;
  }

  private clearAnchorHighlight(): void {
    this.hoveredAnchorId = null;
    this.focusedAnchorId = null;
    this.publishAnchorHighlight();
  }

  private readonly handleWindowResize = (): void => {
    if (!this.disposed) this.positionOpenRoutineDialogs();
  };

  private readonly handleAnchorPointerOver = (event: Event): void => {
    this.hoveredAnchorId = this.highlightAnchorId(event.target);
    this.publishAnchorHighlight();
  };

  private readonly handleAnchorPointerOut = (event: Event): void => {
    const pointerEvent = event as MouseEvent;
    const current = this.highlightAnchorId(event.target);
    if (current === null || this.highlightAnchorId(pointerEvent.relatedTarget) === current) return;
    if (this.hoveredAnchorId === current) this.hoveredAnchorId = null;
    this.publishAnchorHighlight();
  };

  private readonly handleAnchorFocusIn = (event: FocusEvent): void => {
    this.focusedAnchorId = this.highlightAnchorId(event.target);
    this.publishAnchorHighlight();
  };

  private readonly handleAnchorFocusOut = (event: FocusEvent): void => {
    const current = this.highlightAnchorId(event.target);
    if (current === null || this.highlightAnchorId(event.relatedTarget) === current) return;
    if (this.focusedAnchorId === current) this.focusedAnchorId = null;
    this.publishAnchorHighlight();
  };

  private showLayer(layer: HTMLElement): void {
    this.clearAnchorHighlight();
    if (layer === this.fishingResultLayer) {
      this.positionRoutineDialog(
        layer,
        ROUTINE_DIALOG_PLACEMENTS.fishing,
        this.fishingResultTarget,
      );
    } else if (layer === this.driftingLootResultLayer) {
      this.positionRoutineDialog(
        layer,
        ROUTINE_DIALOG_PLACEMENTS.salvage,
        this.driftingLootResultTarget,
      );
    } else if (layer === this.repairOptionsLayer) {
      this.positionRoutineDialog(layer, ROUTINE_DIALOG_PLACEMENTS.repair);
    }
    layer.classList.add('is-visible');
    this.syncBackgroundInteraction();
  }

  private hideLayer(layer: HTMLElement): void {
    layer.classList.remove('is-visible');
    this.syncBackgroundInteraction();
  }

  private positionOpenRoutineDialogs(): void {
    if (this.fishingResultLayer.classList.contains('is-visible')) {
      this.positionRoutineDialog(
        this.fishingResultLayer,
        ROUTINE_DIALOG_PLACEMENTS.fishing,
        this.fishingResultTarget,
      );
    }
    if (this.driftingLootResultLayer.classList.contains('is-visible')) {
      this.positionRoutineDialog(
        this.driftingLootResultLayer,
        ROUTINE_DIALOG_PLACEMENTS.salvage,
        this.driftingLootResultTarget,
      );
    }
    if (this.repairOptionsLayer.classList.contains('is-visible')) {
      this.positionRoutineDialog(this.repairOptionsLayer, ROUTINE_DIALOG_PLACEMENTS.repair);
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
      ?? this.anchors.get(placement.anchorId);
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
    return this.topmostModal() !== null;
  }

  private topmostModal(): HTMLElement | null {
    return this.modalLayers.find((layer) => layer.classList.contains('is-visible')) ?? null;
  }

  private syncBackgroundInteraction(): void {
    const topmostModal = this.topmostModal();
    this.modalLayers.forEach((layer) => {
      const isTopmost = layer === topmostModal;
      layer.toggleAttribute('inert', !isTopmost);
      layer.setAttribute('aria-hidden', isTopmost ? 'false' : 'true');
    });
    const modalOpen = topmostModal !== null;
    this.backgroundRegions.forEach((region) => region.toggleAttribute('inert', modalOpen));
  }

  private focusModal(layer: HTMLElement): void {
    if (layer === this.endingLayer) this.endingTitle.focus();
    else if (layer === this.fishingResultLayer) this.fishingResultContinue.focus();
    else if (layer === this.driftingLootResultLayer) this.driftingLootResultContinue.focus();
    else if (layer === this.repairOptionsLayer) this.repairOptionsTitle.focus();
    else if (layer === this.journalLayer) this.journalTitle.focus();
    else if (layer === this.pauseLayer) this.resumeButton.focus();
    else if (layer === this.fishingLayer) {
      if (this.fishingMode === 'bite' && !this.fishingBiteTarget.hidden) this.fishingBiteTarget.focus();
      else this.fishingLayer.focus();
    }
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
    this.repairOptionsTitle.focus();
  }

  private chooseRepairTarget(target: ItemInstanceId): void {
    this.hideLayer(this.repairOptionsLayer);
    this.onAction('repairItem', { kind: 'itemRepair', target });
    if (this.topmostModal() === null) this.restoreCommandFocus(this.latestCommandOrigin);
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
    return [...this.anchorButtons.values()].find((button) => (
      (
        button.dataset.action !== ''
        || button.dataset.eventChoice !== undefined
        || this.eventEligibility?.has(
          button.dataset.backingInstanceId as ItemInstanceId,
        ) === true
      )
      && this.isUsableCommand(button)
    ))
      ?? (this.eventPresentationActive
        ? [...this.eventChoices.querySelectorAll<HTMLButtonElement>('[data-event-choice]')]
          .find((button) => this.isUsableCommand(button))
          ?? (this.isUsableCommand(this.endureButton) ? this.endureButton : null)
        : null);
  }

  private resolveCommandOrigin(): HTMLElement | null {
    const active = document.activeElement;
    if (this.isUsableCommand(this.latestCommandOrigin)) return this.latestCommandOrigin;
    if (this.isCommandControl(active) && this.isUsableCommand(active)) return active;
    return this.firstUsableAction();
  }

  restoreCommandFocus(target: HTMLElement | null = this.latestCommandOrigin): void {
    if (this.disposed) return;
    const replacementAnchor = target?.dataset.anchorId === undefined
      ? null
      : this.anchorButtons.get(target.dataset.anchorId) ?? null;
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
    const replacementAnchor = target?.dataset.anchorId === undefined
      ? null
      : this.anchorButtons.get(target.dataset.anchorId) ?? null;
    const destination = this.isFocusableCommand(target)
      ? target
      : this.isFocusableCommand(replacementAnchor)
        ? replacementAnchor
        : this.firstUsableAction();
    this.latestCommandOrigin = null;
    destination?.focus();
  }

  private restoreFocus(): void {
    const target = this.focusReturnTarget;
    this.focusReturnTarget = null;
    this.restoreCommandFocus(target);
  }

  private trapModalFocus(event: KeyboardEvent, modal: HTMLElement): boolean {
    if (event.key !== 'Tab') return false;
    const controls = [...modal.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
    )].filter((element) => (
      element.closest('[hidden]') === null
      && !element.hasAttribute('inert')
      && element.getAttribute('aria-hidden') !== 'true'
    ));
    if (controls.length === 0) {
      event.preventDefault();
      this.focusModal(modal);
      return true;
    }
    const first = controls[0]!;
    const last = controls[controls.length - 1]!;
    const active = document.activeElement;
    const activeIsControl = active instanceof HTMLElement && controls.includes(active);
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

  private trapEventFocus(event: KeyboardEvent): boolean {
    if (event.key !== 'Tab' || !this.eventPresentationActive) return false;
    const controls = [
      ...this.anchorButtons.values(),
      ...this.eventChoices.querySelectorAll<HTMLButtonElement>('[data-event-choice]'),
      this.endureButton,
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
    if (
      choiceId === undefined
      || !this.eventPresentationActive
      || this.busy
      || this.eventSelectedChoiceId !== null
      || button.getAttribute('aria-disabled') === 'true'
    ) return;
    this.onEventChoice(choiceId);
  }

  private readonly handleClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const topmostModal = this.topmostModal();
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
    const eventInstanceId = button.dataset.backingInstanceId as ItemInstanceId | undefined
      ?? (
        button.dataset.anchorId?.startsWith('supply:')
          ? undefined
          : button.dataset.anchorId as ItemInstanceId | undefined
      );
    if (
      this.eventPresentationActive
      && eventInstanceId !== undefined
      && button.dataset.targetKind === 'item'
    ) {
      const choiceId = this.eventEligibility?.get(eventInstanceId);
      if (
        choiceId !== undefined
        && !this.busy
        && this.eventSelectedInstanceId === null
      ) {
        this.onEventItem(choiceId, eventInstanceId);
      }
      return;
    }
    const action = ACTIONS.find(({ id }) => id === button.dataset.action);
    if (button.getAttribute('aria-disabled') === 'true') {
      if (action !== undefined && !this.overlayOpen()) this.showUnavailableActionFeedback(action.id);
      return;
    }

    if (button.hasAttribute('data-event-choice')) {
      this.activateEventChoice(button);
      return;
    }

    if (button.hasAttribute('data-journal-open')) {
      this.onJournalOpen();
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
    if (button.hasAttribute('data-fishing-result-continue')) {
      if (this.fishingResultContinueIssued) return;
      this.fishingResultContinueIssued = true;
      this.onFishingResultContinue?.();
      return;
    }
    if (button.hasAttribute('data-drifting-loot-result-continue')) {
      if (topmostModal !== this.driftingLootResultLayer) return;
      if (this.driftingLootContinueIssued) return;
      this.driftingLootContinueIssued = true;
      this.onDriftingLootContinue?.();
      return;
    }
    if (button.hasAttribute('data-fishing-view-exit')) {
      this.onFishingViewExit?.();
      return;
    }
    if (action !== undefined) {
      if (this.overlayOpen() || this.eventPresentationActive) return;
      this.activateDayAction(action.id, button);
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
    if (button.hasAttribute('data-endure')) this.onEndure();
    else if (button.hasAttribute('data-resume')) this.onPauseChange(false);
    else if (button.hasAttribute('data-restart') && !this.restartIssued) {
      this.restartIssued = true;
      button.disabled = true;
      this.onRestart();
    }
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (this.disposed || event.defaultPrevented || event.repeat) return;
    const topmostModal = this.topmostModal();
    if (topmostModal !== null && this.trapModalFocus(event, topmostModal)) return;
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
    const target = event.target;
    if (
      this.eventPresentationActive
      && target instanceof Element
      && (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar')
    ) {
      const choice = target.closest<HTMLButtonElement>('[data-event-choice]');
      if (
        choice !== null
        && (this.eventChoices.contains(choice) || this.anchorLayer.contains(choice))
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
      || this.topmostModal() !== this.fishingLayer
      || this.fishingMode !== 'aiming') return;
    this.suppressFishingClick = true;
    this.issueFishingCast(event.clientX, event.clientY);
    queueMicrotask(() => { this.suppressFishingClick = false; });
  };
}
