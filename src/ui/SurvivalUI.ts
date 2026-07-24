import { ITEM_DEFINITIONS, ITEM_LABELS, type ItemInstanceId } from '../game/ItemState';
import { formatJournalEntry, type JournalEntry } from '../survival/journal';
import { SURVIVAL_ITEM_DESCRIPTIONS } from '../survival/itemDescriptions';
import { SURVIVAL_BALANCE } from '../survival/survivalBalance';
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
  shortcut: string;
  cost: string;
  energyCost: number;
  effect: string;
  risk: 'safe' | 'uncertain' | 'dangerous';
}

interface ActionPreview { cost: string; effect: string; risk: ActionDefinition['risk'] }

interface BoatToolCopy {
  label: string;
  description: string;
}

const BOAT_TOOL_COPY: Readonly<Record<BoatToolId, BoatToolCopy>> = Object.freeze({
  repairTools: {
    label: 'REPAIR TOOLBOX',
    description: 'Use the open repair toolbox to repair the lifeboat.',
  },
  fishingRod: {
    label: 'FISH',
    description: 'Cast from the bow to find food or drifting junk. Bait is used automatically when available.',
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
  { id: 'fish', label: 'FISH', shortcut: '1', cost: '1 ENERGY', energyCost: SURVIVAL_BALANCE.actions.fishEnergy, effect: 'Chance to gain food', risk: 'uncertain' },
  { id: 'dive', label: 'DIVE', shortcut: '2', cost: '3 ENERGY', energyCost: SURVIVAL_BALANCE.actions.diveEnergy, effect: 'May recover supplies; injury risk', risk: 'dangerous' },
  { id: 'eat', label: 'EAT', shortcut: '3', cost: '1 FOOD', energyCost: 0, effect: 'HUNGER -35', risk: 'safe' },
  { id: 'repair', label: 'REPAIR', shortcut: '4', cost: '2 ENERGY + MATERIAL', energyCost: SURVIVAL_BALANCE.actions.repairEnergy, effect: 'HULL +25 (tape +15)', risk: 'safe' },
  { id: 'treat', label: 'TREAT', shortcut: '5', cost: '1 MEDKIT', energyCost: 0, effect: 'HEALTH +30', risk: 'safe' },
  { id: 'endDay', label: 'END DAY', shortcut: '7', cost: 'REST', energyCost: 0, effect: 'RESTORE ENERGY AT DAWN', risk: 'safe' },
  { id: 'repairItem', label: 'REPAIR ITEM', shortcut: '', cost: '1 DUCT TAPE', energyCost: 0, effect: 'Restore one broken item', risk: 'safe' },
  { id: 'sendMessage', label: 'SEND MESSAGE', shortcut: '', cost: '1 ENERGY', energyCost: SURVIVAL_BALANCE.actions.bottledPaperEnergy, effect: 'RESCUE +15', risk: 'safe' },
  { id: 'useEnergyBar', label: 'EAT ENERGY BAR', shortcut: '', cost: '1 ENERGY BAR', energyCost: 0, effect: 'ENERGY TO 3', risk: 'safe' },
];

const ENERGY_WORDS = ['', 'one', 'two', 'three'] as const;

function spokenEnergyCost(cost: number): string | null {
  if (cost <= 0) return null;
  return `${ENERGY_WORDS[cost] ?? String(cost)} energy`;
}

function actionPreview(definition: ActionDefinition, snapshot: SurvivalSnapshot): ActionPreview {
  const missingHull = Math.max(0, 100 - snapshot.hull);
  switch (definition.id) {
    case 'eat': return { ...definition, effect: `HUNGER -${Math.min(35, snapshot.hunger)}` };
    case 'treat': return { ...definition, effect: `HEALTH +${Math.min(30, Math.max(0, 100 - snapshot.health))}` };
    case 'repair': {
      const useTape = snapshot.repairMaterial < 1
        && Object.values(snapshot.inventory).some(
          (item) => item?.type === 'ductTape' && item.condition === 'usable',
        );
      return {
        ...definition,
        cost: useTape ? '2 ENERGY + TAPE' : '2 ENERGY + MATERIAL',
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
const REDUCED_TRANSITION_MS = 1;

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
      <span class="survival-meter__label">${meter.label}<span class="survival-meter__danger" data-meter-danger aria-hidden="true" hidden>${meter.dangerLabel}</span></span>
      <div class="survival-meter__track" aria-hidden="true"><div class="survival-meter__fill"></div></div>
      <span class="survival-meter__value" data-meter-value>0</span>
    </div>`;
}

export type FishingUiMode = 'hidden' | 'aiming' | 'waiting' | 'bite' | 'result';

export interface FishingUiState {
  readonly mode: FishingUiMode;
  readonly message: string;
  readonly biteTarget: ProjectedBoatBounds | null;
}

export interface FishingResultView {
  readonly title: string;
  readonly detail: string;
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

export class SurvivalUI {
  onAction: (action: DayActionId, option?: DayActionOption) => void = () => undefined;
  onEventItem: (choiceId: EventResponseId, instanceId: ItemInstanceId) => void = () => undefined;
  onEndure: () => void = () => undefined;
  onRestart: () => void = () => undefined;
  onAnchorHighlight: (anchorId: string | null) => void = () => undefined;
  onPauseChange: (paused: boolean) => void = () => undefined;
  onJournalOpen: () => void = () => undefined;
  onJournalClose: () => void = () => undefined;
  onFishingCast: ((point: { readonly x: number; readonly y: number } | null) => boolean) | null = null;
  onFishingReel: (() => boolean) | null = null;
  onFishingResultContinue: (() => void) | null = null;

  private readonly root: HTMLDivElement;
  private readonly day: HTMLElement;
  private readonly weather: HTMLElement;
  private readonly phase: HTMLElement;
  private readonly topControls: HTMLElement;
  private readonly journalMarker: HTMLButtonElement;
  private readonly journalUnread: HTMLElement;
  private readonly endDayButton: HTMLButtonElement;
  private readonly announcer: HTMLElement;
  private readonly feedback: HTMLElement;
  private readonly sleepCover: HTMLElement;
  private readonly anchorLayer: HTMLElement;
  private readonly eventCaption: HTMLElement;
  private readonly eventTitle: HTMLElement;
  private readonly endureButton: HTMLButtonElement;
  private readonly fishingLayer: HTMLElement;
  private readonly fishingLive: HTMLElement;
  private readonly fishingBiteTarget: HTMLButtonElement;
  private readonly fishingFade: HTMLElement;
  private readonly fishingResultLayer: HTMLElement;
  private readonly fishingResultTitle: HTMLElement;
  private readonly fishingResultDetail: HTMLElement;
  private readonly fishingResultContinue: HTMLButtonElement;
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
  private fishingResultContinueIssued = false;
  private eventEligibility: ReadonlyMap<ItemInstanceId, EventResponseId> | null = null;
  private eventSelectedInstanceId: ItemInstanceId | null = null;
  private eventPresentationActive = false;

  constructor(
    private readonly mount: HTMLElement,
    private readonly reducedMotion: Pick<MediaQueryList, 'matches'> = { matches: false },
  ) {
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
            <span class="journal-marker__unread" data-journal-unread hidden>NEW</span>
          </button>
          <section class="survival-status" data-survival-status aria-label="Current survival day">
            <strong data-day>DAY 1</strong>
            <span class="survival-status__detail"><span data-phase>DAYLIGHT</span><span aria-hidden="true"> &middot; </span><span data-weather>CALM</span></span>
          </section>
        </div>
        <button type="button" class="end-day-button timber-action" data-action="endDay" aria-keyshortcuts="7">
          END DAY
        </button>
      </div>
      <section class="survival-meters" aria-label="Condition meters">
        ${METERS.map(meterMarkup).join('')}
      </section>
      <div class="boat-anchors" data-boat-anchors aria-label="Boat interaction points"></div>
      <section class="fishing-layer" data-fishing role="region" aria-label="Fishing interaction" aria-hidden="true" inert tabindex="-1">
        <div class="fishing-reticle" data-fishing-reticle aria-hidden="true"></div>
        <div class="survival-announcer" data-fishing-live aria-live="polite" aria-atomic="true"></div>
        <button type="button" class="fishing-bite-target" data-fishing-bite aria-label="BITE - REEL NOW" hidden></button>
      </section>
      <div class="fishing-fade" data-fishing-fade aria-hidden="true"></div>
      <section class="survival-overlay fishing-result-overlay cinematic-overlay" data-fishing-result role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="fishing-result-title" inert>
        <div class="cinematic-overlay__content fishing-result-card">
          <p class="eyebrow">FISHING RESULT</p>
          <h2 id="fishing-result-title" data-fishing-result-title></h2>
          <p class="fishing-result-detail" data-fishing-result-detail></p>
          <button type="button" class="primary-action timber-action" data-fishing-result-continue>CONTINUE</button>
        </div>
      </section>
      <section class="survival-overlay repair-options-overlay cinematic-overlay" data-repair-options role="dialog" aria-modal="true" aria-hidden="true" aria-label="Repair target" inert>
        <div class="cinematic-overlay__content">
          <p class="eyebrow">DUCT TAPE</p>
          <h2 data-repair-options-title tabindex="-1">Choose an item to repair</h2>
          <p>One emergency repair restores one broken item.</p>
          <div class="repair-targets" data-repair-targets></div>
          <button type="button" class="secondary-action timber-action" data-repair-cancel>CANCEL</button>
        </div>
      </section>
      <section class="event-caption" data-event-caption aria-hidden="true" aria-live="polite">
        <h2 data-event-title></h2>
      </section>
      <button type="button" class="event-endure timber-action" data-endure hidden>ENDURE</button>
      <section class="survival-overlay journal-overlay" data-journal role="dialog" aria-modal="true" aria-hidden="true" aria-label="Survival journal" inert>
        <div class="journal-book" data-journal-book>
          <div class="journal-book__cover" aria-hidden="true"></div>
          <div class="journal-book__rings" data-journal-rings aria-hidden="true"><i data-journal-ring></i><i data-journal-ring></i><i data-journal-ring></i></div>
          <div class="journal-book__tabs" data-journal-tabs aria-hidden="true"><i data-journal-tab></i><i data-journal-tab></i><i data-journal-tab></i><i data-journal-tab></i></div>
          <article class="journal-page">
            <p class="journal-page__weather" data-journal-weather></p>
            <h2 data-journal-title tabindex="-1"></h2>
            <div class="journal-page__story" data-journal-story>
              <section aria-labelledby="journal-day-label"><h3 id="journal-day-label">DAY</h3><p data-journal-day></p></section>
              <section aria-labelledby="journal-night-label"><h3 id="journal-night-label">NIGHT</h3><p data-journal-night></p></section>
            </div>
            <nav class="journal-page__navigation" aria-label="Journal pages">
              <button type="button" class="journal-page__edge-arrow journal-page__edge-arrow--previous" data-journal-previous aria-label="Previous journal page">&lsaquo;</button>
              <span class="journal-page__folio" data-journal-page-count>PAGE 0 OF 0</span>
              <button type="button" class="journal-page__edge-arrow journal-page__edge-arrow--next" data-journal-next aria-label="Next journal page">&rsaquo;</button>
            </nav>
            <button type="button" class="journal-page__close-strip" data-journal-close>X  CLOSE JOURNAL</button>
          </article>
        </div>
      </section>
      <section class="survival-overlay pause-overlay cinematic-overlay" data-pause role="dialog" aria-modal="true" aria-hidden="true" aria-label="Survival paused" inert>
        <div class="cinematic-overlay__content">
          <p class="eyebrow">PAUSED</p>
          <h2>Hold Fast</h2>
          <p>The sea will wait until you return.</p>
          <button type="button" class="primary-action timber-action" data-resume>RESUME</button>
        </div>
      </section>
      <section class="survival-overlay ending-overlay cinematic-overlay" data-ending role="dialog" aria-modal="true" aria-hidden="true" aria-label="Journey ended" inert>
        <div class="cinematic-overlay__content">
          <p class="eyebrow">JOURNEY ENDED</p>
          <h2 data-ending-title tabindex="-1" role="alert"></h2>
          <p data-ending-body></p>
          <p class="ending-stats" data-ending-stats></p>
          <button type="button" class="primary-action timber-action" data-restart>START FROM THE SHIP</button>
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
    this.endDayButton = requireElement(this.root, '[data-action="endDay"]');
    this.announcer = requireElement(this.root, '[data-survival-announcer]');
    this.feedback = requireElement(this.root, '[data-survival-feedback]');
    this.sleepCover = requireElement(this.root, '[data-sleep-cover]');
    this.anchorLayer = requireElement(this.root, '[data-boat-anchors]');
    this.eventCaption = requireElement(this.root, '[data-event-caption]');
    this.eventTitle = requireElement(this.root, '[data-event-title]');
    this.endureButton = requireElement(this.root, '[data-endure]');
    this.fishingLayer = requireElement(this.root, '[data-fishing]');
    this.fishingLive = requireElement(this.root, '[data-fishing-live]');
    this.fishingBiteTarget = requireElement(this.root, '[data-fishing-bite]');
    this.fishingFade = requireElement(this.root, '[data-fishing-fade]');
    this.fishingResultLayer = requireElement(this.root, '[data-fishing-result]');
    this.fishingResultTitle = requireElement(this.root, '[data-fishing-result-title]');
    this.fishingResultDetail = requireElement(this.root, '[data-fishing-result-detail]');
    this.fishingResultContinue = requireElement(this.root, '[data-fishing-result-continue]');
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
      if (!anchor.visible || anchor.itemType === null) {
        highlightInvalidated = this.invalidateAnchorHighlight(anchor.id) || highlightInvalidated;
      }
      this.anchors.set(anchor.id, anchor);
      const button = this.anchorButtons.get(anchor.id) ?? this.createAnchorButton(anchor);
      button.hidden = !anchor.visible;
      button.style.transform = `translate(${Math.round(anchor.x)}px, ${Math.round(anchor.y)}px)`;
      const itemTarget = anchor.itemType !== null;
      button.dataset.targetKind = itemTarget ? 'item' : 'tool';
      const hitArea = anchor.hitArea ?? { width: 54, height: 54, depth: 0 };
      const targetWidth = Math.round(hitArea.width);
      const targetHeight = Math.round(hitArea.height);
      button.style.width = `${targetWidth}px`;
      button.style.height = `${targetHeight}px`;
      button.style.marginLeft = `${-targetWidth / 2}px`;
      button.style.marginTop = `${-targetHeight / 2}px`;
      button.style.zIndex = String(Math.max(1, 100000 - Math.round(hitArea.depth * 100)));
      this.placeAnchorTooltip(button, anchor);
      button.classList.toggle('is-depleted', anchor.depleted);
      this.refreshAnchorTooltip(button, anchor);
    }
    this.anchorButtons.forEach((button, id) => {
      if (seen.has(id)) return;
      highlightInvalidated = this.invalidateAnchorHighlight(id) || highlightInvalidated;
      button.remove();
      this.anchorButtons.delete(id);
      this.anchors.delete(id);
    });
    if (highlightInvalidated) this.publishAnchorHighlight();
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

  setEventSelection(eligible: ReadonlyMap<ItemInstanceId, EventResponseId>): void {
    if (this.disposed) return;
    this.eventEligibility = new Map(eligible);
    this.eventSelectedInstanceId = null;
    this.endureButton.hidden = eligible.size > 0;
    this.syncCommandState();
  }

  setEventUsing(instanceId: ItemInstanceId): void {
    if (this.disposed || this.eventEligibility === null) return;
    this.eventSelectedInstanceId = instanceId;
    this.syncCommandState();
  }

  clearEventPresentation(): void {
    if (this.disposed) return;
    this.eventEligibility = null;
    this.eventSelectedInstanceId = null;
    this.eventPresentationActive = false;
    this.eventCaption.classList.remove('is-visible');
    this.eventCaption.setAttribute('aria-hidden', 'true');
    this.eventCaption.removeAttribute('aria-label');
    delete this.eventCaption.dataset.eventId;
    delete this.eventCaption.dataset.danger;
    this.endureButton.hidden = true;
    this.syncCommandState();
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
    const delay = this.reducedMotion.matches ? REDUCED_TRANSITION_MS : SLEEP_TRANSITION_MS;
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
    this.fishingResultTitle.textContent = view.title;
    this.fishingResultDetail.textContent = view.detail;
    this.showLayer(this.fishingResultLayer);
    this.fishingResultContinue.focus();
  }

  hideFishingResult(): void {
    if (this.disposed) return;
    this.hideLayer(this.fishingResultLayer);
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
    const delay = this.reducedMotion.matches ? REDUCED_TRANSITION_MS : FISHING_FADE_MS;
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
    const delay = this.reducedMotion.matches ? REDUCED_TRANSITION_MS : SLEEP_HOLD_MS;
    return new Promise((resolve) => window.setTimeout(resolve, delay));
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
    this.pendingSleepTransition?.finish();
    this.pendingFishingFade?.finish();
    this.fishingAnnouncementVersion += 1;
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
    this.onAction = () => undefined;
    this.onEventItem = () => undefined;
    this.onEndure = () => undefined;
    this.onRestart = () => undefined;
    this.onAnchorHighlight = () => undefined;
    this.onPauseChange = () => undefined;
    this.onJournalOpen = () => undefined;
    this.onJournalClose = () => undefined;
    this.onFishingCast = null;
    this.onFishingReel = null;
    this.onFishingResultContinue = null;
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
    this.journalIndex = Math.min(maximum, Math.max(0, this.journalIndex + delta));
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
    tooltip.className = 'boat-tooltip';
    tooltip.role = 'tooltip';
    const label = document.createTextNode('');
    const separator = document.createTextNode('');
    const energy = document.createElement('span');
    energy.className = 'boat-tooltip__energy';
    energy.setAttribute('aria-hidden', 'true');
    tooltip.append(label, separator, energy);
    button.append(tooltip);
    this.anchorLayer.append(button);
    this.anchorButtons.set(anchor.id, button);
    this.anchorTooltipNodes.set(button, { tooltip, label, separator, energy });
    return button;
  }

  private refreshAnchorTooltip(button: HTMLButtonElement, anchor: BoatInteractionAnchor): void {
    const backingInstanceId = anchor.backingInstanceId ?? (
      anchor.id.startsWith('supply:') ? null : anchor.id as ItemInstanceId
    );
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
    const toolCopy = anchor.toolId === null ? undefined : BOAT_TOOL_COPY[anchor.toolId];
    const itemLabel = anchor.itemType === null
      ? anchor.supplyGroupId === 'repairMaterial'
        ? `REPAIR MATERIAL ×${quantity}`
        : toolCopy?.label ?? 'UNKNOWN TOOL'
      : `${ITEM_LABELS[anchor.itemType]} ×${quantity}`;
    const itemDescription = anchor.itemType === null
      ? anchor.supplyGroupId === 'repairMaterial'
        ? 'Recovered timber, fasteners, and rope for hull repairs.'
        : toolCopy?.description ?? 'Permanent lifeboat equipment.'
      : SURVIVAL_ITEM_DESCRIPTIONS[anchor.itemType];
    const action = anchor.action === null ? null : ACTIONS.find(({ id }) => id === anchor.action) ?? null;
    const reason = this.anchorUnavailableReason(anchor);
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
      : `${itemLabel}${stateText}${itemLabel === action.label ? '' : ` — ${action.label}`} [${action.shortcut}] — ${itemDescription} — ${preview.cost} — ${preview.effect} — ${preview.risk.toUpperCase()}${reason ? ` — UNAVAILABLE: ${reason}` : ''}`;
    const visibleLabel = anchor.itemType !== null
      ? `${ITEM_LABELS[anchor.itemType]} ×${quantity}`
      : anchor.supplyGroupId === 'repairMaterial'
        ? `REPAIR MATERIAL ×${quantity}`
        : anchor.toolId === 'fishingRod'
          ? 'Fishing rod'
          : anchor.toolId === 'repairTools'
            ? 'REPAIR TOOLBOX'
            : itemLabel;
    const energyCost = action?.energyCost ?? 0;
    const energyIndicator = '⚡'.repeat(energyCost);
    const tooltipNodes = this.anchorTooltipNodes.get(button);
    if (tooltipNodes === undefined) throw new Error('Anchor tooltip nodes are missing');
    if (tooltipNodes.label.data !== visibleLabel) tooltipNodes.label.data = visibleLabel;
    const separator = energyIndicator === '' ? '' : ' ';
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
    button.setAttribute('aria-label', spokenCost === null ? visibleLabel : `${visibleLabel}, ${spokenCost}`);
    button.setAttribute('aria-description', text);
    button.setAttribute('aria-disabled', reason === null ? 'false' : 'true');
    if (action !== null) button.setAttribute('aria-keyshortcuts', action.shortcut);
    else button.removeAttribute('aria-keyshortcuts');
  }

  private anchorUnavailableReason(anchor: BoatInteractionAnchor): string | null {
    if (anchor.depleted) return 'This recovered item is depleted.';
    return anchor.action === null ? null : this.actionReasons.get(anchor.action) ?? null;
  }

  private placeAnchorTooltip(button: HTMLButtonElement, anchor: BoatInteractionAnchor): void {
    const bounds = this.root.getBoundingClientRect();
    const viewportWidth = bounds.width || this.root.clientWidth || window.innerWidth;
    const edgeGutter = 160;
    button.dataset.tooltipX = anchor.x < edgeGutter
      ? 'left'
      : anchor.x > viewportWidth - edgeGutter ? 'right' : 'center';
    button.dataset.tooltipY = anchor.y < 96 ? 'below' : 'above';
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
    this.endDayButton.hidden = this.eventPresentationActive;
    const endDayReason = this.actionReasons.get('endDay') ?? null;
    this.endDayButton.disabled = this.busy;
    this.endDayButton.setAttribute('aria-disabled', endDayReason === null ? 'false' : 'true');
    this.endDayButton.setAttribute(
      'aria-description',
      endDayReason ?? 'Rest and end the current day. Energy is restored at dawn.',
    );
    this.endDayButton.title = endDayReason ?? 'End the current day';
    this.anchorButtons.forEach((button, id) => {
      const anchor = this.anchors.get(id);
      const reason = anchor === undefined ? null : this.anchorUnavailableReason(anchor);
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
      button.setAttribute('aria-disabled', reason === null ? 'false' : 'true');
    });
    this.repairTargets.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      button.disabled = this.busy;
    });
    this.endureButton.disabled = this.busy;
  }

  private itemAnchorId(target: EventTarget | null): string | null {
    if (!(target instanceof Element)) return null;
    const button = target.closest<HTMLButtonElement>('.boat-anchor[data-target-kind="item"]');
    return button !== null && this.root.contains(button) ? button.dataset.anchorId ?? null : null;
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

  private readonly handleAnchorPointerOver = (event: Event): void => {
    this.hoveredAnchorId = this.itemAnchorId(event.target);
    this.publishAnchorHighlight();
  };

  private readonly handleAnchorPointerOut = (event: Event): void => {
    const pointerEvent = event as MouseEvent;
    const current = this.itemAnchorId(event.target);
    if (current === null || this.itemAnchorId(pointerEvent.relatedTarget) === current) return;
    if (this.hoveredAnchorId === current) this.hoveredAnchorId = null;
    this.publishAnchorHighlight();
  };

  private readonly handleAnchorFocusIn = (event: FocusEvent): void => {
    this.focusedAnchorId = this.itemAnchorId(event.target);
    this.publishAnchorHighlight();
  };

  private readonly handleAnchorFocusOut = (event: FocusEvent): void => {
    const current = this.itemAnchorId(event.target);
    if (current === null || this.itemAnchorId(event.relatedTarget) === current) return;
    if (this.focusedAnchorId === current) this.focusedAnchorId = null;
    this.publishAnchorHighlight();
  };

  private showLayer(layer: HTMLElement): void {
    this.clearAnchorHighlight();
    layer.classList.add('is-visible');
    this.syncBackgroundInteraction();
  }

  private hideLayer(layer: HTMLElement): void {
    layer.classList.remove('is-visible');
    this.syncBackgroundInteraction();
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
      button.className = 'event-item repair-target';
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
        || this.eventEligibility?.has(
          button.dataset.backingInstanceId as ItemInstanceId,
        ) === true
      )
      && this.isUsableCommand(button)
    ))
      ?? (this.eventPresentationActive && this.isUsableCommand(this.endureButton)
        ? this.endureButton
        : this.isUsableCommand(this.endDayButton) ? this.endDayButton : null);
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

  private readonly handleClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const topmostModal = this.topmostModal();
    if (this.fishingLayer.contains(target) && topmostModal === this.fishingLayer) {
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
    if (this.overlayOpen() || this.busy || this.eventPresentationActive) return;
    const action = ACTIONS.find(({ shortcut }) => shortcut === event.key);
    if (action === undefined) return;
    if (this.showUnavailableActionFeedback(action.id)) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    const button = action.id === 'endDay'
      ? this.endDayButton
      : [...this.anchorButtons.values()].find((candidate) => (
        candidate.dataset.action === action.id && this.isUsableCommand(candidate)
      )) ?? null;
    button?.focus();
    this.activateDayAction(action.id, button);
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
      || this.topmostModal() !== this.fishingLayer
      || this.fishingMode !== 'aiming') return;
    this.suppressFishingClick = true;
    this.issueFishingCast(event.clientX, event.clientY);
    queueMicrotask(() => { this.suppressFishingClick = false; });
  };
}
