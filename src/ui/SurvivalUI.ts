import { ITEM_IDS, ITEM_LABELS, type ItemId } from '../game/ItemState';
import type { DayActionOption } from '../survival/SurvivalSession';
import type {
  ActionOutcome,
  DayActionId,
  ResourceDelta,
  SurvivalEventDefinition,
  SurvivalSnapshot,
  SurvivalState,
  WeatherId,
} from '../survival/survivalTypes';

interface ActionDefinition {
  id: DayActionId;
  label: string;
  shortcut: string;
}

interface MeterDefinition {
  id: 'health' | 'hunger' | 'energy' | 'hull';
  label: string;
}

const ACTIONS: readonly ActionDefinition[] = [
  { id: 'fish', label: 'FISH', shortcut: '1' },
  { id: 'dive', label: 'DIVE', shortcut: '2' },
  { id: 'eat', label: 'EAT', shortcut: '3' },
  { id: 'repair', label: 'REPAIR', shortcut: '4' },
  { id: 'treat', label: 'TREAT', shortcut: '5' },
  { id: 'rest', label: 'REST', shortcut: '6' },
  { id: 'endDay', label: 'END DAY', shortcut: '7' },
];

const METERS: readonly MeterDefinition[] = [
  { id: 'health', label: 'HEALTH' },
  { id: 'hunger', label: 'HUNGER' },
  { id: 'energy', label: 'ENERGY' },
  { id: 'hull', label: 'HULL' },
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

const DELTAS: readonly { key: keyof ResourceDelta; label: string }[] = [
  { key: 'health', label: 'HEALTH' },
  { key: 'hunger', label: 'HUNGER' },
  { key: 'energy', label: 'ENERGY' },
  { key: 'hull', label: 'HULL' },
  { key: 'food', label: 'FOOD' },
  { key: 'bait', label: 'BAIT' },
  { key: 'repairMaterial', label: 'REPAIR MATERIAL' },
  { key: 'rescueProgress', label: 'RESCUE' },
];

function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing survival UI element: ${selector}`);
  return element;
}

function actionMarkup(action: ActionDefinition): string {
  return `
    <button type="button" class="survival-action" data-action="${action.id}" aria-keyshortcuts="${action.shortcut}">
      <span class="survival-action__key" aria-hidden="true">${action.shortcut}</span>
      <span class="survival-action__label">${action.label}</span>
      <span class="survival-action__reason" data-action-reason hidden></span>
    </button>`;
}

function meterMarkup(meter: MeterDefinition): string {
  return `
    <div class="survival-meter survival-meter--${meter.id}" data-meter="${meter.id}" role="meter"
      aria-label="${meter.label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
      <span class="survival-meter__label">${meter.label}</span>
      <span class="survival-meter__track" aria-hidden="true"><span class="survival-meter__fill"></span></span>
      <span class="survival-meter__value" data-meter-value>0</span>
    </div>`;
}

function inventoryMarkup(id: ItemId): string {
  return `
    <li class="inventory-row" data-item="${id}">
      <span class="inventory-row__name">${ITEM_LABELS[id]}</span>
      <span class="inventory-row__state" data-item-state>NOT RECOVERED</span>
    </li>`;
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
  onContinue: () => void = () => undefined;
  onRestart: () => void = () => undefined;
  onPointer: (x: number, y: number) => void = () => undefined;
  onSkip: () => void = () => undefined;
  onPauseChange: (paused: boolean) => void = () => undefined;

  private readonly root: HTMLDivElement;
  private readonly day: HTMLElement;
  private readonly weather: HTMLElement;
  private readonly phase: HTMLElement;
  private readonly inventory: HTMLElement;
  private readonly inventoryToggle: HTMLButtonElement;
  private readonly eventLayer: HTMLElement;
  private readonly eventTitle: HTMLElement;
  private readonly eventPrompt: HTMLElement;
  private readonly eventDanger: HTMLElement;
  private readonly eventItems: HTMLElement;
  private readonly endureButton: HTMLButtonElement;
  private readonly outcomeLayer: HTMLElement;
  private readonly outcomeTitle: HTMLElement;
  private readonly outcomeMessage: HTMLElement;
  private readonly outcomeDeltas: HTMLElement;
  private readonly actionOptionsLayer: HTMLElement;
  private readonly actionOptionsTitle: HTMLElement;
  private readonly fishingOptionButtons: HTMLButtonElement[];
  private readonly pauseLayer: HTMLElement;
  private readonly resumeButton: HTMLButtonElement;
  private readonly endingLayer: HTMLElement;
  private readonly endingTitle: HTMLElement;
  private readonly endingBody: HTMLElement;
  private readonly endingStats: HTMLElement;
  private readonly restartButton: HTMLButtonElement;
  private readonly actionDock: HTMLElement;
  private readonly hotspotRegion: HTMLElement;
  private readonly backgroundRegions: HTMLElement[];
  private readonly modalLayers: HTMLElement[];
  private readonly actionButtons = new Map<DayActionId, HTMLButtonElement>();
  private readonly meterElements = new Map<MeterDefinition['id'], HTMLElement>();
  private readonly inventoryRows = new Map<ItemId, HTMLElement>();
  private readonly actionReasons = new Map<DayActionId, string | null>();
  private readonly lastValues = new Map<string, string | number | boolean | null>();
  private busy = false;
  private paused = false;
  private inventoryOpen = false;
  private disposed = false;
  private restartIssued = false;
  private availableBait = 0;
  private focusReturnTarget: HTMLElement | null = null;
  private pauseReturnTarget: HTMLElement | null = null;
  private inventoryReturnTarget: HTMLElement | null = null;
  private latestCommandOrigin: HTMLButtonElement | null = null;

  constructor(mount: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'survival-ui';
    this.root.innerHTML = `
      <header class="survival-status" aria-label="Survival status">
        <div class="survival-status__time"><span data-day>DAY 1</span><span data-phase>DAYLIGHT</span></div>
        <div class="survival-status__weather"><span class="eyebrow">WEATHER</span><strong data-weather>CALM</strong></div>
      </header>
      <section class="survival-meters" aria-label="Condition meters">
        ${METERS.map(meterMarkup).join('')}
      </section>
      <section class="survival-stores" aria-label="Loose supplies">
        <span>FOOD <strong data-store="food">0</strong></span>
        <span>BAIT <strong data-store="bait">0</strong></span>
        <span>REPAIR MATERIAL <strong data-store="repairMaterial">0</strong></span>
        <span>RESCUE <strong data-store="rescueProgress">0</strong></span>
      </section>
      <nav class="survival-actions" aria-label="Day actions">
        ${ACTIONS.map(actionMarkup).join('')}
      </nav>
      <div class="survival-hotspots" aria-label="Boat action points">
        <button type="button" class="survival-hotspot survival-hotspot--fish" data-hotspot="fish" aria-label="Use the fishing rod"></button>
        <button type="button" class="survival-hotspot survival-hotspot--dive" data-hotspot="dive" aria-label="Dive beside the lifeboat"></button>
        <button type="button" class="survival-hotspot survival-hotspot--repair" data-hotspot="repair" aria-label="Inspect the hull patch"></button>
        <button type="button" class="survival-hotspot survival-hotspot--inventory" data-hotspot="inventory" aria-label="Open the supply crate"></button>
      </div>
      <button type="button" class="inventory-toggle" data-inventory-toggle aria-expanded="false">SUPPLY CRATE</button>
      <aside class="inventory-tray" data-inventory aria-label="Supply crate" aria-hidden="true" inert>
        <div class="inventory-tray__heading"><span class="eyebrow">RECOVERED SUPPLIES</span><strong>INVENTORY</strong></div>
        <ul class="inventory-list" data-inventory-items>${ITEM_IDS.map(inventoryMarkup).join('')}</ul>
      </aside>
      <section class="survival-overlay action-options-overlay" data-action-options role="dialog" aria-modal="true" aria-hidden="true" aria-label="Fishing options" inert>
        <p class="eyebrow">FISHING METHOD</p>
        <h2 data-action-options-title tabindex="-1">Bait the line?</h2>
        <p>Cast now, or spend one bait for a better chance.</p>
        <div class="action-options">
          <button type="button" class="secondary-action" data-action-option="fish">FISH WITHOUT BAIT</button>
          <button type="button" class="primary-action" data-action-option="useBait">USE 1 BAIT</button>
        </div>
      </section>
      <section class="survival-overlay event-overlay" data-event role="dialog" aria-modal="true" aria-hidden="true" aria-label="Survival event" inert>
        <p class="event-danger" data-event-danger></p>
        <h2 data-event-title tabindex="-1"></h2>
        <p data-event-prompt></p>
        <div class="event-items" data-event-items aria-label="Choose a recovered item"></div>
        <button type="button" class="secondary-action" data-endure>ENDURE</button>
      </section>
      <section class="survival-overlay outcome-overlay" data-outcome role="dialog" aria-modal="true" aria-hidden="true" aria-label="Action outcome" inert>
        <p class="eyebrow">AFTERMATH</p>
        <h2 data-outcome-title tabindex="-1">YOU ENDURED</h2>
        <p data-outcome-message aria-live="polite" aria-atomic="true"></p>
        <ul class="outcome-deltas" data-outcome-deltas></ul>
        <div class="outcome-actions">
          <button type="button" class="text-action" data-skip>SKIP PRESENTATION</button>
          <button type="button" class="primary-action" data-continue>CONTINUE</button>
        </div>
      </section>
      <section class="survival-overlay pause-overlay" data-pause role="dialog" aria-modal="true" aria-hidden="true" aria-label="Survival paused" inert>
        <p class="eyebrow">PAUSED</p>
        <h2>Hold Fast</h2>
        <p>The sea will wait until you return.</p>
        <button type="button" class="primary-action" data-resume>RESUME</button>
      </section>
      <section class="survival-overlay ending-overlay" data-ending role="dialog" aria-modal="true" aria-hidden="true" aria-label="Journey ended" inert>
        <p class="eyebrow">JOURNEY ENDED</p>
        <h2 data-ending-title tabindex="-1" role="alert"></h2>
        <p data-ending-body></p>
        <p class="ending-stats" data-ending-stats></p>
        <button type="button" class="primary-action" data-restart>START FROM THE SHIP</button>
      </section>
    `;
    mount.append(this.root);

    this.day = requireElement(this.root, '[data-day]');
    this.weather = requireElement(this.root, '[data-weather]');
    this.phase = requireElement(this.root, '[data-phase]');
    this.inventory = requireElement(this.root, '[data-inventory]');
    this.inventoryToggle = requireElement(this.root, '[data-inventory-toggle]');
    this.eventLayer = requireElement(this.root, '[data-event]');
    this.eventTitle = requireElement(this.root, '[data-event-title]');
    this.eventPrompt = requireElement(this.root, '[data-event-prompt]');
    this.eventDanger = requireElement(this.root, '[data-event-danger]');
    this.eventItems = requireElement(this.root, '[data-event-items]');
    this.endureButton = requireElement(this.root, '[data-endure]');
    this.outcomeLayer = requireElement(this.root, '[data-outcome]');
    this.outcomeTitle = requireElement(this.root, '[data-outcome-title]');
    this.outcomeMessage = requireElement(this.root, '[data-outcome-message]');
    this.outcomeDeltas = requireElement(this.root, '[data-outcome-deltas]');
    this.actionOptionsLayer = requireElement(this.root, '[data-action-options]');
    this.actionOptionsTitle = requireElement(this.root, '[data-action-options-title]');
    this.fishingOptionButtons = [...this.actionOptionsLayer.querySelectorAll<HTMLButtonElement>('[data-action-option]')];
    this.pauseLayer = requireElement(this.root, '[data-pause]');
    this.resumeButton = requireElement(this.root, '[data-resume]');
    this.endingLayer = requireElement(this.root, '[data-ending]');
    this.endingTitle = requireElement(this.root, '[data-ending-title]');
    this.endingBody = requireElement(this.root, '[data-ending-body]');
    this.endingStats = requireElement(this.root, '[data-ending-stats]');
    this.restartButton = requireElement(this.root, '[data-restart]');
    this.actionDock = requireElement(this.root, '.survival-actions');
    this.hotspotRegion = requireElement(this.root, '.survival-hotspots');
    this.backgroundRegions = [this.actionDock, this.hotspotRegion, this.inventoryToggle];
    this.modalLayers = [
      this.pauseLayer,
      this.actionOptionsLayer,
      this.endingLayer,
      this.outcomeLayer,
      this.eventLayer,
    ];

    ACTIONS.forEach(({ id }) => {
      this.actionButtons.set(id, requireElement(this.root, `[data-action="${id}"]`));
      this.actionReasons.set(id, null);
    });
    METERS.forEach(({ id }) => this.meterElements.set(id, requireElement(this.root, `[data-meter="${id}"]`)));
    ITEM_IDS.forEach((id) => this.inventoryRows.set(id, requireElement(this.inventory, `[data-item="${id}"]`)));

    this.root.addEventListener('click', this.handleClick);
    window.addEventListener('pointermove', this.handlePointer);
    document.addEventListener('keydown', this.handleKeyDown);
  }

  render(snapshot: SurvivalSnapshot, unavailable: (action: DayActionId) => string | null): void {
    if (this.disposed) return;
    this.updateText('day', this.day, `DAY ${snapshot.day}`);
    this.updateText('weather', this.weather, WEATHER_LABELS[snapshot.weather]);
    this.updateText('phase', this.phase, PHASE_LABELS[snapshot.state]);

    METERS.forEach(({ id }) => this.updateMeter(id, snapshot[id]));
    this.updateStore('food', snapshot.food);
    this.updateStore('bait', snapshot.bait);
    this.updateStore('repairMaterial', snapshot.repairMaterial);
    this.updateStore('rescueProgress', snapshot.rescueProgress);
    this.availableBait = snapshot.bait;

    ACTIONS.forEach(({ id }) => {
      const reason = unavailable(id);
      this.actionReasons.set(id, reason);
      const button = this.actionButtons.get(id)!;
      if (button.getAttribute('aria-description') !== reason) {
        if (reason === null) button.removeAttribute('aria-description');
        else button.setAttribute('aria-description', reason);
      }
      const reasonElement = requireElement<HTMLElement>(button, '[data-action-reason]');
      if (reasonElement.textContent !== (reason ?? '')) reasonElement.textContent = reason ?? '';
      reasonElement.hidden = reason === null;
    });
    this.syncCommandState();

    ITEM_IDS.forEach((id) => {
      const item = snapshot.inventory[id];
      const state = !item.owned
        ? 'NOT RECOVERED'
        : item.durable
          ? 'DURABLE'
          : `${item.charges ?? 0} CHARGES`;
      const row = this.inventoryRows.get(id)!;
      this.updateText(`item:${id}`, requireElement(row, '[data-item-state]'), state);
      row.classList.toggle('is-owned', item.owned);
      row.classList.toggle('is-depleted', item.owned && !item.durable && (item.charges ?? 0) <= 0);
    });
  }

  showEvent(
    event: Pick<SurvivalEventDefinition, 'id' | 'title' | 'prompt' | 'danger'>,
    snapshot: SurvivalSnapshot,
  ): void {
    if (this.disposed) return;
    this.focusReturnTarget = this.resolveCommandOrigin();
    this.closeInventory(false);
    this.hideLayer(this.outcomeLayer);
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
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'event-item';
      button.dataset.item = id;
      button.dataset.usable = usable ? 'true' : 'false';
      button.textContent = item.durable
        ? `${ITEM_LABELS[id]} — DURABLE`
        : `${ITEM_LABELS[id]} — ${item.charges ?? 0} CHARGES`;
      button.disabled = this.busy || !usable;
      if (!usable) button.setAttribute('aria-description', 'No charges remain.');
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

  showOutcome(outcome: ActionOutcome): void {
    if (this.disposed) return;
    this.focusReturnTarget ??= this.resolveCommandOrigin();
    this.hideLayer(this.eventLayer);
    this.closeInventory(false);
    this.outcomeLayer.dataset.accepted = String(outcome.accepted);
    this.outcomeLayer.dataset.cue = outcome.cue;
    this.updateText('outcome:title', this.outcomeTitle, outcome.accepted ? 'YOU ENDURED' : 'ACTION BLOCKED');
    this.updateText('outcome:message', this.outcomeMessage, outcome.message);
    this.outcomeDeltas.replaceChildren();

    DELTAS.forEach(({ key, label }) => {
      const value = outcome.deltas[key];
      if (value === undefined || value === 0) return;
      const item = document.createElement('li');
      item.dataset.delta = key;
      item.className = value > 0 ? 'is-positive' : 'is-negative';
      item.textContent = `${label} ${value > 0 ? '+' : ''}${value}`;
      this.outcomeDeltas.append(item);
    });
    if (this.outcomeDeltas.childElementCount === 0) {
      const item = document.createElement('li');
      item.className = 'is-neutral';
      item.textContent = 'NO CHANGE';
      this.outcomeDeltas.append(item);
    }
    this.showLayer(this.outcomeLayer);
    this.outcomeTitle.focus();
  }

  hideOutcome(): void {
    if (this.disposed) return;
    this.hideLayer(this.outcomeLayer);
    this.restoreFocus();
  }

  setBusy(busy: boolean): void {
    if (this.disposed || this.busy === busy) return;
    this.busy = busy;
    if (busy) this.root.setAttribute('aria-busy', 'true');
    else this.root.removeAttribute('aria-busy');
    this.syncCommandState();
  }

  setPaused(paused: boolean): void {
    if (this.disposed || paused === this.paused) return;
    if (paused && !this.paused) {
      this.pauseReturnTarget = this.resolveCommandOrigin();
      this.closeInventory(false);
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
    this.closeInventory(false);
    this.hideLayer(this.eventLayer);
    this.hideLayer(this.outcomeLayer);
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
    this.disposed = true;
    this.root.removeEventListener('click', this.handleClick);
    window.removeEventListener('pointermove', this.handlePointer);
    document.removeEventListener('keydown', this.handleKeyDown);
    this.onAction = () => undefined;
    this.onEventItem = () => undefined;
    this.onEndure = () => undefined;
    this.onContinue = () => undefined;
    this.onRestart = () => undefined;
    this.onPointer = () => undefined;
    this.onSkip = () => undefined;
    this.onPauseChange = () => undefined;
    this.root.remove();
  }

  private updateMeter(id: MeterDefinition['id'], value: number): void {
    if (this.lastValues.get(`meter:${id}`) === value) return;
    this.lastValues.set(`meter:${id}`, value);
    const meter = this.meterElements.get(id)!;
    const safe = Math.min(100, Math.max(0, value));
    meter.setAttribute('aria-valuenow', String(value));
    meter.classList.toggle('is-danger', safe <= 20);
    if (safe <= 20) meter.setAttribute('aria-valuetext', `${value}, critical`);
    else meter.removeAttribute('aria-valuetext');
    meter.style.setProperty('--meter-value', `${safe}%`);
    requireElement<HTMLElement>(meter, '[data-meter-value]').textContent = String(value);
  }

  private updateStore(id: 'food' | 'bait' | 'repairMaterial' | 'rescueProgress', value: number): void {
    this.updateText(`store:${id}`, requireElement(this.root, `[data-store="${id}"]`), String(value));
  }

  private updateText(key: string, element: HTMLElement, value: string): void {
    if (this.lastValues.get(key) === value) return;
    this.lastValues.set(key, value);
    element.textContent = value;
  }

  private syncCommandState(): void {
    ACTIONS.forEach(({ id }) => {
      const reason = this.actionReasons.get(id);
      const unavailable = reason !== null && reason !== undefined;
      const actionButton = this.actionButtons.get(id)!;
      actionButton.disabled = this.busy;
      if (unavailable) actionButton.setAttribute('aria-disabled', 'true');
      else actionButton.removeAttribute('aria-disabled');
      const hotspot = this.root.querySelector<HTMLButtonElement>(`[data-hotspot="${id}"]`);
      if (hotspot) {
        hotspot.disabled = this.busy;
        if (unavailable) {
          hotspot.setAttribute('aria-disabled', 'true');
          hotspot.setAttribute('aria-description', reason);
        } else {
          hotspot.removeAttribute('aria-disabled');
          hotspot.removeAttribute('aria-description');
        }
      }
    });
    this.eventItems.querySelectorAll<HTMLButtonElement>('button[data-item]').forEach((button) => {
      button.disabled = this.busy || button.dataset.usable !== 'true';
    });
    this.fishingOptionButtons.forEach((button) => { button.disabled = this.busy; });
    this.endureButton.disabled = this.busy;
  }

  private showLayer(layer: HTMLElement): void {
    layer.classList.add('is-visible');
    this.syncBackgroundInteraction();
  }

  private hideLayer(layer: HTMLElement): void {
    layer.classList.remove('is-visible');
    this.syncBackgroundInteraction();
  }

  private toggleInventory(opener: HTMLElement): void {
    if (this.inventoryOpen) this.closeInventory(true);
    else {
      this.inventoryReturnTarget = opener;
      this.inventoryOpen = true;
      this.inventory.classList.add('is-visible');
      this.inventory.setAttribute('aria-hidden', 'false');
      this.inventory.removeAttribute('inert');
      this.inventoryToggle.setAttribute('aria-expanded', 'true');
      this.syncBackgroundInteraction();
    }
  }

  private closeInventory(restoreFocus: boolean): void {
    if (!this.inventoryOpen) return;
    this.inventoryOpen = false;
    this.inventory.classList.remove('is-visible');
    this.inventory.setAttribute('aria-hidden', 'true');
    this.inventory.setAttribute('inert', '');
    this.inventoryToggle.setAttribute('aria-expanded', 'false');
    this.syncBackgroundInteraction();
    const target = this.inventoryReturnTarget;
    this.inventoryReturnTarget = null;
    if (restoreFocus && target?.isConnected && !target.hasAttribute('disabled')) target.focus();
    else if (restoreFocus) this.inventoryToggle.focus();
  }

  private overlayOpen(): boolean {
    return this.inventoryOpen || this.topmostModal() !== null;
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
    this.inventory.toggleAttribute('inert', modalOpen || !this.inventoryOpen);
  }

  private focusModal(layer: HTMLElement): void {
    if (layer === this.eventLayer) this.eventTitle.focus();
    else if (layer === this.outcomeLayer) this.outcomeTitle.focus();
    else if (layer === this.endingLayer) this.endingTitle.focus();
    else if (layer === this.actionOptionsLayer) this.actionOptionsTitle.focus();
    else if (layer === this.pauseLayer) this.resumeButton.focus();
  }

  private activateDayAction(action: DayActionId, origin: HTMLButtonElement): void {
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
      && (!(element instanceof HTMLButtonElement) || !element.disabled)
      && element.getAttribute('aria-disabled') !== 'true';
  }

  private isCommandControl(element: Element | null): element is HTMLButtonElement {
    return element instanceof HTMLButtonElement
      && (element.hasAttribute('data-action')
        || ['fish', 'dive', 'repair'].includes(element.dataset.hotspot ?? ''));
  }

  private firstUsableAction(): HTMLButtonElement | null {
    return ACTIONS
      .map(({ id }) => this.actionButtons.get(id)!)
      .find((button) => this.isUsableCommand(button)) ?? null;
  }

  private resolveCommandOrigin(): HTMLElement | null {
    const active = document.activeElement;
    if (this.isUsableCommand(this.latestCommandOrigin)) return this.latestCommandOrigin;
    if (this.isCommandControl(active) && this.isUsableCommand(active)) return active;
    return this.firstUsableAction();
  }

  private restoreCommandFocus(target: HTMLElement | null): void {
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
    )].filter((element) => !element.hasAttribute('inert') && element.getAttribute('aria-hidden') !== 'true');
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

    const actionId = button.dataset.action as DayActionId | undefined;
    if (actionId !== undefined) {
      if (this.overlayOpen()) return;
      this.activateDayAction(actionId, button);
      return;
    }
    const hotspot = button.dataset.hotspot;
    if (hotspot === 'inventory') {
      this.toggleInventory(button);
      return;
    }
    if (hotspot === 'fish' || hotspot === 'dive' || hotspot === 'repair') {
      if (this.overlayOpen()) return;
      this.activateDayAction(hotspot, button);
      return;
    }
    if (button.hasAttribute('data-inventory-toggle')) {
      this.toggleInventory(button);
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
    else if (button.hasAttribute('data-continue')) this.onContinue();
    else if (button.hasAttribute('data-skip')) this.onSkip();
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
      if (this.inventoryOpen) {
        event.preventDefault();
        this.closeInventory(true);
      } else if (this.topmostModal() === this.actionOptionsLayer) {
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
    const button = action === undefined ? undefined : this.actionButtons.get(action.id);
    if (button === undefined || !this.isUsableCommand(button)) return;
    event.preventDefault();
    button.focus();
    button.click();
  };
}
