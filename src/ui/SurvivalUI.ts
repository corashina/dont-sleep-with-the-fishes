import { ITEM_DEFINITIONS, ITEM_IDS, ITEM_LABELS, type ItemId } from '../game/ItemState';
import type { DayActionOption } from '../survival/SurvivalSession';
import { formatJournalEntry, type JournalEntry } from '../survival/journal';
import { SURVIVAL_ITEM_DESCRIPTIONS } from '../survival/itemDescriptions';
import type { BoatInteractionAnchor } from '../survival/BoatInteraction';
import type {
  ActionOutcome,
  DayActionId,
  SurvivalEventDefinition,
  SurvivalSnapshot,
  SurvivalState,
  WeatherId,
} from '../survival/survivalTypes';
import { uiArtwork, type UiArtworkId } from './uiArtwork';

interface ActionDefinition {
  id: DayActionId;
  label: string;
  shortcut: string;
  cost: string;
  effect: string;
  risk: 'safe' | 'uncertain' | 'dangerous';
}

interface ActionPreview { cost: string; effect: string; risk: ActionDefinition['risk'] }

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
  { id: 'fish', label: 'FISH', shortcut: '1', cost: '2 ENERGY', effect: 'Chance to gain food', risk: 'uncertain' },
  { id: 'dive', label: 'DIVE', shortcut: '2', cost: '3 ENERGY', effect: 'May recover supplies; injury risk', risk: 'dangerous' },
  { id: 'eat', label: 'EAT', shortcut: '3', cost: '1 FOOD', effect: 'HUNGER -35', risk: 'safe' },
  { id: 'repair', label: 'REPAIR', shortcut: '4', cost: '2 ENERGY + MATERIAL', effect: 'HULL +25 (tape +15)', risk: 'safe' },
  { id: 'treat', label: 'TREAT', shortcut: '5', cost: '1 MEDKIT', effect: 'HEALTH +30', risk: 'safe' },
  { id: 'rest', label: 'REST', shortcut: '6', cost: '1 WATER', effect: 'ENERGY +2', risk: 'safe' },
  { id: 'endDay', label: 'END DAY', shortcut: '7', cost: 'NO COST', effect: 'Advance to night', risk: 'safe' },
];

function actionPreview(definition: ActionDefinition, snapshot: SurvivalSnapshot): ActionPreview {
  const missingHull = Math.max(0, 100 - snapshot.hull);
  switch (definition.id) {
    case 'eat': return { ...definition, effect: `HUNGER -${Math.min(35, snapshot.hunger)}` };
    case 'treat': return { ...definition, effect: `HEALTH +${Math.min(30, Math.max(0, 100 - snapshot.health))}` };
    case 'rest': return { ...definition, effect: `ENERGY +${Math.min(2, Math.max(0, 4 - snapshot.energy))}` };
    case 'repair': {
      const useTape = snapshot.repairMaterial < 1
        && snapshot.inventory.ductTape.owned
        && (snapshot.inventory.ductTape.charges ?? 0) > 0;
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
  { id: 'energy', label: 'ENERGY', min: 0, max: 4, dangerLabel: 'LOW', displayValue: identity, isDanger: (value) => value <= 1 },
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

const SLEEP_TRANSITION_MS = 650;
const SLEEP_HOLD_MS = 450;
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

function formatElapsed(seconds: number): string {
  const safe = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(safe / 60).toString().padStart(2, '0');
  const remainder = (safe % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}

export class SurvivalUI {
  onAction: (action: DayActionId, option?: DayActionOption) => void = () => undefined;
  onEventItem: (itemId: ItemId) => void = () => undefined;
  onEndure: () => void = () => undefined;
  onRestart: () => void = () => undefined;
  onPointer: (x: number, y: number) => void = () => undefined;
  onAnchorHighlight: (anchorId: string | null) => void = () => undefined;
  onPauseChange: (paused: boolean) => void = () => undefined;
  onJournalOpen: () => void = () => undefined;
  onJournalClose: () => void = () => undefined;

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
  private readonly eventLayer: HTMLElement;
  private readonly eventTitle: HTMLElement;
  private readonly eventPrompt: HTMLElement;
  private readonly eventDanger: HTMLElement;
  private readonly eventItems: HTMLElement;
  private readonly endureButton: HTMLButtonElement;
  private readonly actionOptionsLayer: HTMLElement;
  private readonly actionOptionsTitle: HTMLElement;
  private readonly fishingOptionButtons: HTMLButtonElement[];
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
  private availableBait = 0;
  private focusReturnTarget: HTMLElement | null = null;
  private pauseReturnTarget: HTMLElement | null = null;
  private latestCommandOrigin: HTMLButtonElement | null = null;
  private currentSnapshot: SurvivalSnapshot | null = null;
  private journalEntries: readonly JournalEntry[] = [];
  private journalIndex = 0;
  private hoveredAnchorId: string | null = null;
  private focusedAnchorId: string | null = null;
  private publishedAnchorId: string | null = null;

  constructor(
    mount: HTMLElement,
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
      <section class="survival-overlay action-options-overlay cinematic-overlay" data-action-options role="dialog" aria-modal="true" aria-hidden="true" aria-label="Fishing options" inert>
        <div class="cinematic-overlay__content">
          <p class="eyebrow">FISHING METHOD</p>
          <h2 data-action-options-title tabindex="-1">Bait the line?</h2>
          <p>Cast now, or spend one bait for a better chance.</p>
          <div class="action-options">
            <button type="button" class="secondary-action timber-action" data-action-option="fish">FISH WITHOUT BAIT</button>
            <button type="button" class="primary-action timber-action" data-action-option="useBait">USE 1 BAIT</button>
          </div>
        </div>
      </section>
      <section class="survival-overlay event-overlay cinematic-overlay" data-event role="dialog" aria-modal="true" aria-hidden="true" aria-label="Survival event" inert>
        <div class="cinematic-overlay__content">
          <p class="event-danger" data-event-danger></p>
          <h2 data-event-title tabindex="-1"></h2>
          <p data-event-prompt></p>
          <div class="event-items" data-event-items aria-label="Choose a recovered item"></div>
          <button type="button" class="secondary-action timber-action" data-endure>ENDURE</button>
        </div>
      </section>
      <section class="survival-overlay journal-overlay" data-journal role="dialog" aria-modal="true" aria-hidden="true" aria-label="Survival journal" inert>
        <article class="journal-page">
          <p class="journal-page__weather" data-journal-weather></p>
          <h2 data-journal-title tabindex="-1"></h2>
          <div class="journal-page__story" data-journal-story>
            <section aria-labelledby="journal-day-label">
              <h3 id="journal-day-label">DAY</h3>
              <p data-journal-day></p>
            </section>
            <section aria-labelledby="journal-night-label">
              <h3 id="journal-night-label">NIGHT</h3>
              <p data-journal-night></p>
            </section>
          </div>
          <nav class="journal-page__navigation" aria-label="Journal pages">
            <button type="button" class="journal-page__edge-arrow journal-page__edge-arrow--previous" data-journal-previous aria-label="Previous journal page">&lsaquo;</button>
            <span class="journal-page__folio" data-journal-page-count>PAGE 0 OF 0</span>
            <button type="button" class="journal-page__edge-arrow journal-page__edge-arrow--next" data-journal-next aria-label="Next journal page">&rsaquo;</button>
          </nav>
          <button type="button" class="journal-page__bookmark" data-journal-close>CLOSE JOURNAL</button>
        </article>
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
    this.eventLayer = requireElement(this.root, '[data-event]');
    this.eventTitle = requireElement(this.root, '[data-event-title]');
    this.eventPrompt = requireElement(this.root, '[data-event-prompt]');
    this.eventDanger = requireElement(this.root, '[data-event-danger]');
    this.eventItems = requireElement(this.root, '[data-event-items]');
    this.endureButton = requireElement(this.root, '[data-endure]');
    this.actionOptionsLayer = requireElement(this.root, '[data-action-options]');
    this.actionOptionsTitle = requireElement(this.root, '[data-action-options-title]');
    this.fishingOptionButtons = [...this.actionOptionsLayer.querySelectorAll<HTMLButtonElement>('[data-action-option]')];
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
      this.actionOptionsLayer,
      this.endingLayer,
      this.eventLayer,
    ];

    ACTIONS.forEach(({ id }) => this.actionReasons.set(id, null));
    METERS.forEach(({ id }) => this.meterElements.set(id, requireElement(this.root, `[data-meter="${id}"]`)));

    this.root.addEventListener('click', this.handleClick);
    this.root.addEventListener('pointerover', this.handleAnchorPointerOver);
    this.root.addEventListener('pointerout', this.handleAnchorPointerOut);
    this.root.addEventListener('focusin', this.handleAnchorFocusIn);
    this.root.addEventListener('focusout', this.handleAnchorFocusOut);
    window.addEventListener('pointermove', this.handlePointer);
    document.addEventListener('keydown', this.handleKeyDown);
  }

  render(snapshot: SurvivalSnapshot, unavailable: (action: DayActionId) => string | null): void {
    if (this.disposed) return;
    this.currentSnapshot = snapshot;
    this.updateText('day', this.day, `DAY ${snapshot.day}`);
    this.updateText('weather', this.weather, WEATHER_LABELS[snapshot.weather]);
    this.updateText('phase', this.phase, PHASE_LABELS[snapshot.state]);

    METERS.forEach(({ id }) => this.updateMeter(id, snapshot[id]));
    this.availableBait = snapshot.bait;
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
      button.dataset.targetKind = itemTarget ? 'item' : 'fixed';
      if (itemTarget) {
        const hitArea = anchor.hitArea ?? { width: 54, height: 54, depth: 0 };
        const targetWidth = Math.round(hitArea.width);
        const targetHeight = Math.round(hitArea.height);
        button.style.width = `${targetWidth}px`;
        button.style.height = `${targetHeight}px`;
        button.style.marginLeft = `${-targetWidth / 2}px`;
        button.style.marginTop = `${-targetHeight / 2}px`;
        button.style.zIndex = String(Math.max(1, 100000 - Math.round(hitArea.depth * 100)));
      } else {
        button.style.removeProperty('width');
        button.style.removeProperty('height');
        button.style.removeProperty('margin-left');
        button.style.removeProperty('margin-top');
        button.style.removeProperty('z-index');
      }
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

  showEvent(
    event: Pick<SurvivalEventDefinition, 'id' | 'title' | 'prompt' | 'danger'>,
    snapshot: SurvivalSnapshot,
  ): void {
    if (this.disposed) return;
    this.focusReturnTarget = this.resolveCommandOrigin();
    this.updateText('event:title', this.eventTitle, event.title);
    this.updateText('event:prompt', this.eventPrompt, event.prompt);
    this.updateText('event:danger', this.eventDanger, event.danger.toUpperCase());
    this.eventLayer.dataset.eventId = event.id;
    this.eventLayer.dataset.danger = event.danger;
    this.eventItems.replaceChildren();

    ITEM_IDS.forEach((id) => {
      const item = snapshot.inventory[id];
      if (!item.owned) return;
      const usable = item.durable || (item.charges !== null && item.charges > 0);
      const transferred = (id === 'cannedFood' || id === 'baitTin') && (item.charges ?? 0) === 0;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'event-item';
      button.dataset.item = id;
      button.dataset.usable = usable ? 'true' : 'false';
      button.textContent = transferred
        ? `${ITEM_LABELS[id]} — TRANSFERRED TO STORES`
        : item.durable
        ? `${ITEM_LABELS[id]} — DURABLE`
        : `${ITEM_LABELS[id]} — ${item.charges ?? 0} CHARGES`;
      button.disabled = this.busy || !usable;
      button.setAttribute('aria-description', `${SURVIVAL_ITEM_DESCRIPTIONS[id]}${transferred ? ' Use through day actions.' : usable ? '' : ' No charges remain.'}`);
      this.eventItems.append(button);
    });
    if (this.eventItems.childElementCount === 0) {
      const empty = document.createElement('p');
      empty.className = 'event-items__empty';
      empty.textContent = 'NO RECOVERED ITEM CAN HELP';
      this.eventItems.append(empty);
    }
    this.endureButton.disabled = this.busy;
    this.showLayer(this.eventLayer);
    this.eventTitle.focus();
  }

  hideEvent(): void {
    if (!this.disposed) this.hideLayer(this.eventLayer);
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
    this.sleepCover.classList.toggle('is-covered', covered);
    const delay = this.reducedMotion.matches ? REDUCED_TRANSITION_MS : SLEEP_TRANSITION_MS;
    return new Promise((resolve) => window.setTimeout(resolve, delay));
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
    this.hideLayer(this.eventLayer);
    this.setPaused(false);
    this.updateText('ending:title', this.endingTitle, copy.title);
    this.updateText('ending:body', this.endingBody, copy.body);
    this.updateText(
      'ending:stats',
      this.endingStats,
      `${day} ${day === 1 ? 'DAY' : 'DAYS'} SURVIVED · ${formatElapsed(scavengeElapsedSeconds)} SCAVENGING · SEED ${seed}`,
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
    this.disposed = true;
    this.announcementVersion += 1;
    window.clearTimeout(this.feedbackTimer);
    this.root.removeEventListener('click', this.handleClick);
    this.root.removeEventListener('pointerover', this.handleAnchorPointerOver);
    this.root.removeEventListener('pointerout', this.handleAnchorPointerOut);
    this.root.removeEventListener('focusin', this.handleAnchorFocusIn);
    this.root.removeEventListener('focusout', this.handleAnchorFocusOut);
    window.removeEventListener('pointermove', this.handlePointer);
    document.removeEventListener('keydown', this.handleKeyDown);
    this.onAction = () => undefined;
    this.onEventItem = () => undefined;
    this.onEndure = () => undefined;
    this.onRestart = () => undefined;
    this.onPointer = () => undefined;
    this.onAnchorHighlight = () => undefined;
    this.onPauseChange = () => undefined;
    this.onJournalOpen = () => undefined;
    this.onJournalClose = () => undefined;
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
    button.append(tooltip);
    this.anchorLayer.append(button);
    this.anchorButtons.set(anchor.id, button);
    return button;
  }

  private refreshAnchorTooltip(button: HTMLButtonElement, anchor: BoatInteractionAnchor): void {
    const itemLabel = anchor.itemType === null ? 'HULL PATCH' : ITEM_LABELS[anchor.itemType];
    const itemDescription = anchor.itemType === null
      ? 'Inspect the lifeboat repair patch.'
      : SURVIVAL_ITEM_DESCRIPTIONS[anchor.itemType];
    const action = anchor.action === null ? null : ACTIONS.find(({ id }) => id === anchor.action) ?? null;
    const reason = this.anchorUnavailableReason(anchor);
    const state = this.anchorItemState(anchor);
    const preview = action !== null && this.currentSnapshot !== null
      ? actionPreview(action, this.currentSnapshot)
      : action;
    const stateText = state === null ? '' : ` — ${state}`;
    const text = action === null || preview === null
      ? `${itemLabel}${stateText} — ${itemDescription}${reason ? ` — UNAVAILABLE: ${reason}` : ''}`
      : `${itemLabel}${stateText} — ${action.label} [${action.shortcut}] — ${preview.cost} — ${preview.effect} — ${preview.risk.toUpperCase()}${reason ? ` — UNAVAILABLE: ${reason}` : ''}`;
    requireElement<HTMLElement>(button, '[role="tooltip"]').textContent = text;
    button.dataset.action = anchor.action ?? '';
    if (anchor.itemType === null) delete button.dataset.item;
    else button.dataset.item = anchor.itemType;
    button.setAttribute('aria-label', text);
    button.setAttribute('aria-description', text);
    button.setAttribute('aria-disabled', reason === null ? 'false' : 'true');
    if (action !== null) button.setAttribute('aria-keyshortcuts', action.shortcut);
    else button.removeAttribute('aria-keyshortcuts');
  }

  private anchorUnavailableReason(anchor: BoatInteractionAnchor): string | null {
    if (anchor.depleted) return 'This recovered item is depleted.';
    return anchor.action === null ? null : this.actionReasons.get(anchor.action) ?? null;
  }

  private anchorItemState(anchor: BoatInteractionAnchor): string | null {
    if (anchor.itemType === null) return null;
    if (ITEM_DEFINITIONS[anchor.itemType].durable) return 'DURABLE';
    const remaining = anchor.remainingUses ?? 0;
    if (anchor.depleted || remaining <= 0) return 'DEPLETED — 0 USES REMAINING';
    return `${remaining} ${remaining === 1 ? 'USE' : 'USES'} REMAINING`;
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
    const endDayReason = this.actionReasons.get('endDay') ?? null;
    this.endDayButton.disabled = this.busy;
    this.endDayButton.setAttribute('aria-disabled', endDayReason === null ? 'false' : 'true');
    this.endDayButton.setAttribute(
      'aria-description',
      endDayReason ?? 'End the current day and go to sleep.',
    );
    this.endDayButton.title = endDayReason ?? 'End the current day';
    this.anchorButtons.forEach((button, id) => {
      const anchor = this.anchors.get(id);
      const reason = anchor === undefined ? null : this.anchorUnavailableReason(anchor);
      button.disabled = this.busy;
      button.setAttribute('aria-disabled', reason === null ? 'false' : 'true');
    });
    this.eventItems.querySelectorAll<HTMLButtonElement>('button[data-item]').forEach((button) => {
      button.disabled = this.busy || button.dataset.usable !== 'true';
    });
    this.fishingOptionButtons.forEach((button) => { button.disabled = this.busy; });
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
    this.onAnchorHighlight(next);
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
    if (layer === this.eventLayer) this.eventTitle.focus();
    else if (layer === this.endingLayer) this.endingTitle.focus();
    else if (layer === this.actionOptionsLayer) this.actionOptionsTitle.focus();
    else if (layer === this.journalLayer) this.journalTitle.focus();
    else if (layer === this.pauseLayer) this.resumeButton.focus();
  }

  private activateDayAction(action: DayActionId, origin: HTMLButtonElement | null): void {
    this.latestCommandOrigin = origin;
    if (action === 'fish' && this.availableBait > 0) {
      this.showLayer(this.actionOptionsLayer);
      this.actionOptionsTitle.focus();
      return;
    }
    this.onAction(action, undefined);
  }

  private chooseFishingOption(option: DayActionOption | undefined): void {
    this.hideLayer(this.actionOptionsLayer);
    this.onAction('fish', option);
    if (this.topmostModal() === null) this.restoreCommandFocus(this.latestCommandOrigin);
  }

  private closeActionOptions(): void {
    this.hideLayer(this.actionOptionsLayer);
    this.restoreCommandFocus(this.latestCommandOrigin);
  }

  private isUsableCommand(element: HTMLElement | null): element is HTMLElement {
    return element !== null
      && element.isConnected
      && !element.hidden
      && element.closest('[hidden], [inert], [aria-hidden="true"]') === null
      && (!(element instanceof HTMLButtonElement) || !element.disabled)
      && element.getAttribute('aria-disabled') !== 'true';
  }

  private isCommandControl(element: Element | null): element is HTMLButtonElement {
    return element instanceof HTMLButtonElement && element.hasAttribute('data-action');
  }

  private firstUsableAction(): HTMLButtonElement | null {
    return [...this.anchorButtons.values()].find((button) => (
      button.dataset.action !== '' && this.isUsableCommand(button)
    )) ?? (this.isUsableCommand(this.endDayButton) ? this.endDayButton : null);
  }

  private resolveCommandOrigin(): HTMLElement | null {
    const active = document.activeElement;
    if (this.isUsableCommand(this.latestCommandOrigin)) return this.latestCommandOrigin;
    if (this.isCommandControl(active) && this.isUsableCommand(active)) return active;
    return this.firstUsableAction();
  }

  restoreCommandFocus(target: HTMLElement | null = this.latestCommandOrigin): void {
    if (this.disposed) return;
    const destination = this.isUsableCommand(target) ? target : this.firstUsableAction();
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
    const button = target.closest<HTMLButtonElement>('button');
    if (!button || !this.root.contains(button) || button.disabled || button.getAttribute('aria-disabled') === 'true') return;
    const topmostModal = this.topmostModal();
    if (topmostModal !== null && !topmostModal.contains(button)) return;

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
    const action = ACTIONS.find(({ id }) => id === button.dataset.action);
    if (action !== undefined) {
      if (this.overlayOpen()) return;
      this.activateDayAction(action.id, button);
      return;
    }
    const actionOption = button.dataset.actionOption;
    if (actionOption === 'fish' || actionOption === 'useBait') {
      this.chooseFishingOption(actionOption === 'useBait' ? 'useBait' : undefined);
      return;
    }
    const itemId = button.dataset.item as ItemId | undefined;
    if (itemId !== undefined && this.eventItems.contains(button)) {
      this.onEventItem(itemId);
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

  private readonly handlePointer = (event: PointerEvent): void => {
    this.onPointer(event.clientX, event.clientY);
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (this.disposed || event.defaultPrevented || event.repeat) return;
    const topmostModal = this.topmostModal();
    if (topmostModal !== null && this.trapModalFocus(event, topmostModal)) return;
    if (event.key === 'Escape') {
      if (topmostModal === this.journalLayer) {
        event.preventDefault();
        this.onJournalClose();
      } else if (topmostModal === this.actionOptionsLayer) {
        event.preventDefault();
        this.closeActionOptions();
      } else {
        event.preventDefault();
        this.onPauseChange(!this.paused);
      }
      return;
    }
    if (this.overlayOpen() || this.busy) return;
    const action = ACTIONS.find(({ shortcut }) => shortcut === event.key);
    if (action === undefined) return;
    const unavailableReason = this.actionReasons.get(action.id);
    if (unavailableReason !== null && unavailableReason !== undefined) {
      event.preventDefault();
      this.publishAnnouncement(unavailableReason);
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
}
