import { uiDynamic } from '../i18n/uiDynamicMessages';
import { onLanguageChange } from '../i18n/language';
import { refreshUiText } from './translatedText';
import { uiText } from '../i18n/uiMessages';
import { SURVIVAL_BALANCE } from '../survival/survivalBalance';
import type { DayActionId } from '../survival/survivalTypes';
import type { SurvivalSnapshot } from '../survival/survivalSnapshot';
import { createElementRequirement } from './dom';
import { returnArrowArtwork, uiArtwork, type UiArtworkId } from './uiArtwork';

type MeterId = 'health' | 'hunger' | 'energy' | 'hull';

interface MeterDefinition {
  readonly id: MeterId;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly fillBoundary?: (percentage: number) => number;
  readonly dangerLabel: string;
  readonly displayValue: (value: number) => number;
  readonly isDanger: (value: number) => boolean;
}

const METER_ARTWORK: Readonly<Record<MeterId, UiArtworkId>> = Object.freeze({
  health: 'health',
  hunger: 'hunger',
  energy: 'energy',
  hull: 'hull',
});

const identity = (value: number): number => value;
const CONDITION_ARTWORK_HEIGHT = 72;
const HUNGER_FILL_BOUNDARIES = [
  [0, 65],
  [10, 58.4],
  [20, 54.8],
  [25, 53.2],
  [30, 51.8],
  [40, 48.8],
  [50, 45.7],
  [60, 42.2],
  [70, 38.3],
  [75, 36.4],
  [80, 34.3],
  [90, 28.1],
  [100, 11],
] as const;

function hungerFillBoundary(percentage: number): number {
  for (let index = 1; index < HUNGER_FILL_BOUNDARIES.length; index += 1) {
    const [upperPercentage, upperBoundary] = HUNGER_FILL_BOUNDARIES[index]!;
    if (percentage > upperPercentage) continue;
    const [lowerPercentage, lowerBoundary] = HUNGER_FILL_BOUNDARIES[index - 1]!;
    const progress = (percentage - lowerPercentage) / (upperPercentage - lowerPercentage);
    return lowerBoundary + (upperBoundary - lowerBoundary) * progress;
  }
  return HUNGER_FILL_BOUNDARIES.at(-1)![1];
}

function hullFillBoundary(percentage: number): number {
  const progress = (percentage / 100) ** 1.4;
  return 61 - (61 - 29) * progress;
}

const METERS: readonly MeterDefinition[] = [
  { id: 'health', get label() { return uiText('health'); }, min: 0, max: 100, get dangerLabel() { return uiText('low'); }, displayValue: identity, isDanger: (value) => value <= 20 },
  { id: 'hunger', get label() { return uiText('food'); }, min: 0, max: 100, fillBoundary: hungerFillBoundary, get dangerLabel() { return uiText('low'); }, displayValue: (value) => 100 - value, isDanger: (value) => value <= 30 },
  { id: 'energy', get label() { return uiText('energy'); }, min: 0, max: SURVIVAL_BALANCE.actions.maximumEnergy, get dangerLabel() { return uiText('low'); }, displayValue: identity, isDanger: (value) => value <= 1 },
  { id: 'hull', get label() { return uiText('hull'); }, min: 0, max: 100, fillBoundary: hullFillBoundary, get dangerLabel() { return uiText('low'); }, displayValue: identity, isDanger: (value) => value <= 20 },
];

function meterFillHeight(definition: MeterDefinition, percentage: number): number {
  if (definition.fillBoundary === undefined) return percentage;
  const boundary = definition.fillBoundary(percentage);
  return (CONDITION_ARTWORK_HEIGHT - boundary) / CONDITION_ARTWORK_HEIGHT * 100;
}

function meterMarkup(meter: MeterDefinition): string {
  const artwork = METER_ARTWORK[meter.id];
  const tooltipId = `survival-meter-${meter.id}-tooltip`;
  return `
    <div class="survival-meter survival-condition survival-meter--${meter.id}" data-meter="${meter.id}" role="meter"
      aria-label="${meter.label}" aria-describedby="${tooltipId}" aria-valuemin="${meter.min}" aria-valuemax="${meter.max}" aria-valuenow="${meter.min}" tabindex="0">
      <span class="survival-condition__icon" aria-hidden="true">
        <span class="survival-condition__fill" data-meter-fill>
          ${uiArtwork(artwork, 'survival-condition__art survival-condition__fill-art')}
        </span>
        <span class="survival-condition__outline" data-meter-outline>
          ${uiArtwork(artwork, 'survival-condition__art survival-condition__outline-art')}
        </span>
      </span>
      <span class="survival-meter__tooltip ui-role-numeral" data-meter-tooltip id="${tooltipId}" role="tooltip">${meter.min} / ${meter.max}</span>
    </div>`;
}

const requireElement = createElementRequirement('survival HUD');

export class SurvivalHudView {
  readonly topControls: HTMLElement;
  readonly meters: HTMLElement;
  readonly cameraReturn: HTMLButtonElement;
  readonly roots: readonly [HTMLElement, HTMLElement, HTMLButtonElement];

  onJournal: () => void = () => undefined;
  onCameraTurn: () => void = () => undefined;

  private readonly day: HTMLElement;
  private readonly journalMarker: HTMLButtonElement;
  private readonly journalUnread: HTMLElement;
  private readonly cameraTurn: HTMLButtonElement;
  private readonly cameraTurnTooltip: HTMLElement;
  private readonly meterElements = new Map<MeterId, HTMLElement>();
  private readonly meterTooltips = new Map<MeterId, HTMLElement>();
  private readonly lastValues = new Map<string, string | number>();
  private currentSnapshot: SurvivalSnapshot | null = null;
  private busy = false;
  private paused = false;
  private modalOpen = false;
  private readonly unsubscribeLanguage: () => void;
  private refreshLanguage(): void {
    refreshUiText(...this.roots);
    this.setJournalUnread(!this.journalUnread.hidden);
    this.setCameraTurnState(!this.cameraTurn.hidden, this.cameraTurn.getAttribute('aria-pressed') === 'true');
    METERS.forEach(({ id, label }) => this.meterElements.get(id)!.setAttribute('aria-label', label));
    if (this.currentSnapshot !== null) this.render(this.currentSnapshot, new Map());
  }

  private disposed = false;

  constructor() {
    const template = document.createElement('template');
    template.innerHTML = `
      <div class="survival-top" data-survival-top>
        <div class="survival-top__status-row">
          <button type="button" class="journal-marker" data-journal-open data-ui-aria="openJournal" aria-label="${uiText('openJournal')}">
            ${uiArtwork('journal', 'journal-marker__art')}
            <span class="journal-marker__unread ui-role-context" data-journal-unread hidden data-ui-text="newEntry">${uiText('newEntry')}</span>
          </button>
          <section class="survival-status" data-survival-status data-ui-aria="currentDay" aria-label="${uiText('currentDay')}">
            <strong class="ui-role-numeral" data-day data-ui-text="firstDay">${uiText('firstDay')}</strong>
          </section>
        </div>
        <button type="button" class="chest-camera-turn" data-camera-turn data-ui-aria="lookBehind" aria-label="${uiText('lookBehind')}" aria-describedby="camera-turn-tooltip" aria-pressed="false" hidden>
          ${uiArtwork('chest', 'chest-camera-turn__art')}
          <span class="chest-camera-turn__tooltip ui-role-context" data-camera-turn-tooltip id="camera-turn-tooltip" role="tooltip" data-ui-text="lookBack">${uiText('lookBack')}</span>
        </button>
      </div>
      <section class="survival-meters" data-ui-aria="meters" aria-label="${uiText('meters')}">
        ${METERS.map(meterMarkup).join('')}
      </section>
      <button type="button" class="rear-camera-return" data-camera-return-front data-ui-aria="returnFront" aria-label="${uiText('returnFront')}" hidden>
        ${returnArrowArtwork('rear-camera-return__arrow')}
      </button>`;
    const roots = [...template.content.children];
    this.topControls = roots[0] as HTMLElement;
    this.meters = roots[1] as HTMLElement;
    this.cameraReturn = roots[2] as HTMLButtonElement;
    this.roots = [this.topControls, this.meters, this.cameraReturn];
    this.day = requireElement(this.topControls, '[data-day]');
    this.journalMarker = requireElement(this.topControls, '[data-journal-open]');
    this.journalUnread = requireElement(this.topControls, '[data-journal-unread]');
    this.cameraTurn = requireElement(this.topControls, '[data-camera-turn]');
    this.cameraTurnTooltip = requireElement(this.topControls, '[data-camera-turn-tooltip]');
    METERS.forEach(({ id }) => {
      const meter = requireElement<HTMLElement>(this.meters, `[data-meter="${id}"]`);
      this.meterElements.set(id, meter);
      this.meterTooltips.set(id, requireElement(meter, '[data-meter-tooltip]'));
    });
    this.topControls.addEventListener('click', this.handleClick);
    this.cameraReturn.addEventListener('click', this.handleClick);
    this.unsubscribeLanguage = onLanguageChange(() => this.refreshLanguage());
    this.refreshLanguage();
  }

  render(
    snapshot: SurvivalSnapshot,
    _unavailableReasons: ReadonlyMap<DayActionId, string | null>,
  ): void {
    if (this.disposed) return;
    this.currentSnapshot = snapshot;
    this.updateText('day', this.day, uiDynamic('day', snapshot.day));
    METERS.forEach(({ id }) => this.updateMeter(id, snapshot[id]));
  }

  setBusy(busy: boolean): void {
    if (this.disposed || this.busy === busy) return;
    this.busy = busy;
    this.syncControls();
  }

  setPaused(paused: boolean): void {
    if (this.disposed || this.paused === paused) return;
    this.paused = paused;
  }

  setModalOpen(open: boolean): void {
    if (this.disposed || this.modalOpen === open) return;
    this.modalOpen = open;
  }

  setJournalUnread(unread: boolean): void {
    if (this.disposed) return;
    this.journalUnread.hidden = !unread;
    this.journalMarker.dataset.unread = String(unread);
    this.journalMarker.setAttribute(
      'aria-label',
      unread ? uiText('openUnreadJournal') : uiText('openJournal'),
    );
  }

  setCameraTurnState(visible: boolean, rear: boolean): void {
    if (this.disposed) return;
    this.cameraTurn.hidden = !visible;
    this.cameraReturn.hidden = !visible || !rear;
    this.cameraTurn.setAttribute('aria-pressed', String(rear));
    this.cameraTurn.setAttribute(
      'aria-label',
      rear ? uiText('lookForwardChest') : uiText('lookBehind'),
    );
    this.cameraTurnTooltip.textContent = rear ? uiText('lookForward') : uiText('lookBack');
  }

  journalControl(): HTMLButtonElement {
    return this.journalMarker;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribeLanguage();
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
    clean(() => this.topControls.removeEventListener('click', this.handleClick));
    clean(() => this.cameraReturn.removeEventListener('click', this.handleClick));
    clean(() => { this.onJournal = () => undefined; });
    clean(() => { this.onCameraTurn = () => undefined; });
    if (failed) throw firstError;
  }

  private updateMeter(id: MeterId, value: number): void {
    const definition = METERS.find((meter) => meter.id === id)!;
    const meter = this.meterElements.get(id)!;
    const displayed = definition.displayValue(value);
    const safe = Math.min(definition.max, Math.max(definition.min, displayed));
    const bonusEnergy = id === 'energy' && displayed > definition.max;
    const accessibleMaximum = bonusEnergy ? displayed : definition.max;
    const danger = definition.isDanger(safe);
    const percentage = ((safe - definition.min) / (definition.max - definition.min)) * 100;
    meter.setAttribute('aria-valuemax', String(accessibleMaximum));
    meter.setAttribute('aria-valuenow', String(bonusEnergy ? displayed : safe));
    meter.classList.toggle('is-danger', danger);
    if (bonusEnergy) {
      meter.setAttribute(
        'aria-valuetext',
        uiDynamic('bonusEnergy', definition.max, displayed - definition.max),
      );
    } else if (danger) {
      meter.setAttribute('aria-valuetext', uiDynamic('dangerValue', safe));
    }
    else meter.removeAttribute('aria-valuetext');
    meter.style.setProperty('--meter-value', `${percentage}%`);
    meter.style.setProperty('--meter-fill-height', `${meterFillHeight(definition, percentage)}%`);
    this.meterTooltips.get(id)!.textContent = `${displayed} / ${definition.max}`;
  }

  private updateText(key: string, element: HTMLElement, value: string): void {
    if (this.lastValues.get(key) === value) return;
    this.lastValues.set(key, value);
    element.textContent = value;
  }

  private syncControls(): void {
    this.journalMarker.disabled = this.busy;
    this.cameraTurn.disabled = this.busy;
    this.cameraReturn.disabled = this.busy;
  }

  private readonly handleClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>('button');
    if (
      button === null
      || (!this.topControls.contains(button) && button !== this.cameraReturn)
    ) return;
    if (button.disabled) return;
    this.handleHudButton(button);
  };

  private handleHudButton(button: HTMLButtonElement): void {
    if (button === this.journalMarker) {
      if (!this.modalOpen) this.onJournal();
      return;
    }
    if (this.isCameraButton(button) && !this.busy && !this.paused && !this.modalOpen) this.onCameraTurn();
  }

  private isCameraButton(button: HTMLButtonElement): boolean {
    return button === this.cameraTurn || button === this.cameraReturn;
  }
}
