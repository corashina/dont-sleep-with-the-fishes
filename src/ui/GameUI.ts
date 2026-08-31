import { ITEM_DEFINITIONS, type ItemId } from '../game/ItemState';
import type { ScavengeSnapshot } from '../game/ScavengeSession';
import type { ScavengeEndingStage } from '../game/scavengeEnding';
import { SCAVENGE_DURATION_SECONDS } from '../game/scavengeRules';
import type { SinkingState } from '../game/sinking';
import {
  endingCauseLine,
  endingSummary,
  endingTitle,
  type EndingRecord,
} from '../game/ending';
import { createElementRequirement } from './dom';
import { formatDuration } from './formatDuration';
import { itemThumbnailUrl } from './itemThumbnailManifest';
import { uiArtwork } from './uiArtwork';
import { EndingStatisticsView } from './EndingStatisticsView';
import { scavengeEndingStatistics } from './EndingStatisticsModel';

const requireElement = createElementRequirement('UI');

export type ScavengePresentation = 'intro' | 'playing';

export interface ScavengeItemTooltip {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly placement: 'above' | 'below';
}

export class GameUI {
  onResume: () => void = () => undefined;
  onRestart: () => void = () => undefined;
  onReturnToMenu: () => void = () => undefined;
  private readonly root: HTMLDivElement;
  private readonly introFade: HTMLElement;
  private readonly hud: HTMLElement;
  private readonly introSkip: HTMLElement;
  private readonly pauseLayer: HTMLElement;
  private readonly endingLayer: HTMLElement;
  private readonly clock: HTMLElement;
  private readonly timer: HTMLElement;
  private readonly prompt: HTMLElement;
  private readonly itemTooltip: HTMLElement;
  private readonly crosshair: HTMLElement;
  private readonly pickupPointer: HTMLElement;
  private readonly carrySlots: readonly HTMLElement[];
  private readonly carryTypes: [ItemId | null, ItemId | null, ItemId | null] =
    [null, null, null];
  private readonly resumeButton: HTMLButtonElement;
  private readonly returnToMenuButton: HTMLButtonElement;
  private readonly endingTitle: HTMLElement;
  private readonly endingCause: HTMLElement;
  private readonly endingStats: HTMLElement;
  private readonly endingAction: HTMLButtonElement;
  private readonly statisticsView: EndingStatisticsView;
  private latestSnapshot: ScavengeSnapshot | null = null;
  private readonly pointerLockErrors: HTMLElement[];
  private disposed = false;
  private restartHandled = false;
  private endingStage: ScavengeEndingStage = 'playing';
  private renderedEndingRecord: Extract<EndingRecord, { id: 'dorothy' }> | null = null;
  private renderedTimerSecond = SCAVENGE_DURATION_SECONDS;

  constructor(mount: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'game-ui';
    this.root.innerHTML = `
      <div class="ui-treatment" aria-hidden="true"></div>
      <div class="hud illustrated-hud ui-role-context" data-hud>
        <div class="crosshair" data-crosshair aria-hidden="true"></div>
        <div class="pickup-pointer" data-pickup-pointer aria-hidden="true">
          <svg class="pickup-pointer__art" viewBox="0 0 40 46" focusable="false">
            <path class="pickup-pointer__hand" d="M14 27V7c0-3 1.7-5 4-5s4 2 4 5v12-8c0-2.5 1.6-4.3 3.8-4.3s3.8 1.8 3.8 4.3v10-6c0-2.4 1.5-4.1 3.5-4.1s3.6 1.7 3.6 4.1v11c0 9.4-6 16-15 16h-2c-6 0-10.3-3.1-13.2-8.2l-5-8.8c-1.2-2.2-.4-4.4 1.7-5.4 2-1 4.1-.2 5.3 1.8z"/>
            <path class="pickup-pointer__cuff" d="M12 38c4 3.5 12.5 4.3 18.5.3l.5 6.2H12.5z"/>
            <path class="pickup-pointer__crease" d="M17.8 10v15m7.9-10v9m7.4-6v7M9 27c3 0 5.8 1.4 7.8 4"/>
          </svg>
        </div>
        <div class="prompt brush-label ui-role-context" data-prompt aria-live="polite"></div>
        <div class="boat-tooltip scavenge-tooltip ui-role-context" data-item-tooltip role="tooltip"></div>
        <div class="scavenge-status" data-scavenge-status>
          <div class="carried" data-carried>
            <div class="weight-circles__row" data-carried-items data-carry-weight aria-hidden="true"><span class="weight-circle" data-weight-circle></span><span class="weight-circle" data-weight-circle></span><span class="weight-circle" data-weight-circle></span></div>
          </div>
          <div class="timer-block pocket-watch">
            ${uiArtwork('watch', 'pocket-watch__art')}
            <strong class="ui-role-numeral" data-timer>${formatDuration(SCAVENGE_DURATION_SECONDS)}</strong>
          </div>
        </div>
      </div>
      <div class="intro-skip brush-label ui-role-context" data-intro-skip hidden>
        <kbd>SPACE</kbd><span aria-hidden="true"> - </span>SKIP INTRO
      </div>
      <div class="scavenge-intro-fade" data-intro-fade aria-hidden="true"></div>
      <section class="screen pause-screen poster-screen" data-pause>
        <div class="screen__content scuba-popup-paper scuba-popup-panel">
          <h2 class="scuba-popup-title ui-role-display">Back to the deck?</h2>
          <button type="button" class="primary-action salvage-action ui-role-context" data-resume-button aria-label="Resume">
            RESUME
          </button>
          <button type="button" class="secondary-action salvage-action ui-role-context" data-return-to-menu aria-label="Back to menu">
            BACK TO MENU
          </button>
          <p class="input-error illustrated-warning ui-role-narrative" data-pointer-lock-error aria-live="polite">
            ${uiArtwork('warning', 'illustrated-warning__art')}
            <span data-pointer-lock-error-copy></span>
          </p>
        </div>
      </section>
      <section class="screen scavenge-ending-screen poster-screen"
        data-ending role="dialog" aria-modal="true" aria-hidden="true" inert>
        <div class="screen__content scuba-popup-paper scuba-popup-panel">
          <h2 class="scuba-popup-title ui-role-display" data-ending-title tabindex="-1" role="alert"></h2>
          <p class="ending-cause ui-role-context" data-ending-cause></p>
          <p class="ending-stats ui-role-numeral" data-ending-stats></p>
          <button type="button" class="primary-action salvage-action ui-role-context" data-ending-action hidden>
            START FROM THE SHIP
          </button>
        </div>
      </section>
    `;
    mount.append(this.root);
    this.hud = requireElement(this.root, '.hud');
    this.introFade = requireElement(this.root, '[data-intro-fade]');
    this.introSkip = requireElement(this.root, '[data-intro-skip]');
    this.pauseLayer = requireElement(this.root, '[data-pause]');
    this.endingLayer = requireElement(this.root, '[data-ending]');
    this.clock = requireElement(this.root, '.pocket-watch');
    this.timer = requireElement(this.root, '[data-timer]');
    this.prompt = requireElement(this.root, '[data-prompt]');
    this.itemTooltip = requireElement(this.root, '[data-item-tooltip]');
    this.crosshair = requireElement(this.root, '[data-crosshair]');
    this.pickupPointer = requireElement(this.root, '[data-pickup-pointer]');
    this.carrySlots = [...this.root.querySelectorAll<HTMLElement>('[data-weight-circle]')];
    if (this.carrySlots.length !== 3) throw new Error('Carry HUD requires three weight slots');
    this.resumeButton = requireElement(this.root, '[data-resume-button]');
    this.returnToMenuButton = requireElement(this.root, '[data-return-to-menu]');
    this.endingTitle = requireElement(this.root, '[data-ending-title]');
    this.endingCause = requireElement(this.root, '[data-ending-cause]');
    this.endingStats = requireElement(this.root, '[data-ending-stats]');
    this.endingAction = requireElement(this.root, '[data-ending-action]');
    this.statisticsView = new EndingStatisticsView(
      this.endingLayer, requireElement(this.endingLayer, '.screen__content'),
    );
    this.statisticsView.button.hidden = true;
    this.pointerLockErrors = [...this.root.querySelectorAll<HTMLElement>('[data-pointer-lock-error]')];
    this.resumeButton.addEventListener('click', this.handleResume);
    this.returnToMenuButton.addEventListener('click', this.handleReturnToMenu);
    this.endingAction.addEventListener('click', this.handleRestart);
    this.setPresentation('intro');
    this.setIntroFadeProgress(1);
  }

  setPresentation(presentation: ScavengePresentation): void {
    this.root.dataset.presentation = presentation;
    this.hud.hidden = presentation !== 'playing';
    this.introSkip.hidden = presentation !== 'intro';
  }

  setIntroFadeProgress(progress: number): void {
    this.introFade.style.opacity = String(Math.min(1, Math.max(0, progress)));
  }

  setPaused(paused: boolean): void {
    this.pauseLayer.classList.toggle('is-visible', paused);
    this.pauseLayer.setAttribute('aria-hidden', String(!paused));
    this.pauseLayer.toggleAttribute('inert', !paused);
    if (paused) this.resumeButton.focus();
  }

  clearPointerLockError(): void {
    this.pointerLockErrors.forEach((element) => {
      requireElement<HTMLElement>(element, '[data-pointer-lock-error-copy]').textContent = '';
      element.classList.remove('is-visible');
    });
  }

  showPointerLockError(): void {
    this.pointerLockErrors.forEach((element) => {
      requireElement<HTMLElement>(element, '[data-pointer-lock-error-copy]').textContent = 'Mouse look was blocked. Click the button and allow pointer lock to continue.';
      element.classList.add('is-visible');
    });
  }

  setPrompt(text: string): void {
    if (this.prompt.textContent === text) return;
    this.prompt.textContent = text;
    this.prompt.classList.toggle('is-visible', text.length > 0);
  }

  setItemTooltip(tooltip: ScavengeItemTooltip | null): void {
    const visible = tooltip !== null && tooltip.text.length > 0;
    if (tooltip !== null) {
      this.setPrompt('');
      if (this.itemTooltip.textContent !== tooltip.text) {
        this.itemTooltip.textContent = tooltip.text;
      }
      this.itemTooltip.style.left = `${tooltip.x}px`;
      this.itemTooltip.style.top = `${tooltip.y}px`;
      this.itemTooltip.dataset.placement = tooltip.placement;
    }
    this.itemTooltip.classList.toggle('is-visible', visible);
  }

  setPickupPointer(visible: boolean): void {
    this.pickupPointer.classList.toggle('is-visible', visible);
    this.crosshair.classList.toggle('is-pickup-hidden', visible);
  }

  render(snapshot: ScavengeSnapshot): void {
    this.latestSnapshot = snapshot;
    const timerSecond = Math.max(0, Math.ceil(snapshot.remainingSeconds));
    if (timerSecond !== this.renderedTimerSecond) {
      this.renderedTimerSecond = timerSecond;
      this.clock.dataset.tick = String(timerSecond % 2);
    }
    this.timer.textContent = formatDuration(snapshot.remainingSeconds);
    this.timer.classList.toggle('is-critical', snapshot.remainingSeconds <= 30);
    this.renderCarry(snapshot);
  }

  renderEnding(
    stage: ScavengeEndingStage,
    blackout: number,
    record: Extract<EndingRecord, { id: 'dorothy' }> | null,
  ): void {
    const visible = stage === 'endingHold' || stage === 'menuReady';
    if (visible && record === null) {
      throw new Error('Dorothy ending record is missing.');
    }
    if (record !== null && record !== this.renderedEndingRecord) {
      this.renderEndingRecord(record);
      this.renderedEndingRecord = record;
    }
    const revealAction = stage === 'menuReady';
    this.root.style.setProperty('--scavenge-ending-blackout', String(Math.min(1, Math.max(0, blackout))));
    this.hud.hidden = stage !== 'playing' || this.root.dataset.presentation !== 'playing';
    if (stage !== 'playing') this.setPaused(false);
    this.endingLayer.classList.toggle('is-visible', visible);
    this.endingLayer.setAttribute('aria-hidden', String(!visible));
    this.endingLayer.toggleAttribute('inert', !visible);
    this.endingAction.hidden = !revealAction;
    this.statisticsView.button.hidden = !revealAction;
    if (revealAction && this.endingStage !== 'menuReady') this.endingAction.focus();
    this.endingStage = stage;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resumeButton.removeEventListener('click', this.handleResume);
    this.returnToMenuButton.removeEventListener('click', this.handleReturnToMenu);
    this.endingAction.removeEventListener('click', this.handleRestart);
    this.statisticsView.dispose();
    this.onResume = () => undefined;
    this.onRestart = () => undefined;
    this.onReturnToMenu = () => undefined;
    this.root.remove();
  }

  private renderCarry(snapshot: ScavengeSnapshot): void {
    let slotIndex = 0;
    for (const { type } of snapshot.carriedItems) {
      for (let unit = 0; unit < ITEM_DEFINITIONS[type].weight && slotIndex < 3; unit += 1) {
        this.updateCarrySlot(slotIndex, type);
        slotIndex += 1;
      }
    }
    while (slotIndex < 3) {
      this.updateCarrySlot(slotIndex, null);
      slotIndex += 1;
    }
  }

  private updateCarrySlot(index: number, type: ItemId | null): void {
    if (this.carryTypes[index] === type) return;
    this.carryTypes[index] = type;
    const circle = this.carrySlots[index]!;
    circle.replaceChildren();
    circle.classList.toggle('is-filled', type !== null);
    circle.classList.remove('has-image-error');
    if (type === null) {
      delete circle.dataset.itemType;
      return;
    }
    circle.dataset.itemType = type;
    const image = document.createElement('img');
    image.className = 'weight-circle__thumbnail';
    image.src = itemThumbnailUrl(type);
    image.alt = '';
    image.decoding = 'async';
    image.draggable = false;
    image.addEventListener('error', () => {
      image.hidden = true;
      circle.classList.add('has-image-error');
    }, { once: true });
    circle.append(image);
  }

  private readonly handleResume = (): void => this.onResume();
  private readonly handleReturnToMenu = (): void => this.onReturnToMenu();
  private renderEndingRecord(record: Extract<EndingRecord, { id: 'dorothy' }>): void {
    this.statisticsView.render(scavengeEndingStatistics(record, this.latestSnapshot));
    this.endingTitle.textContent = endingTitle(record);
    this.endingCause.textContent = endingCauseLine(record) ?? '';
    this.endingCause.hidden = this.endingCause.textContent.length === 0;
    this.endingStats.textContent = endingSummary(record);
    this.endingLayer.dataset.ending = record.id;
  }

  private readonly handleRestart = (): void => {
    if (this.restartHandled) return;
    this.restartHandled = true;
    this.statisticsView.button.disabled = true;
    this.onRestart();
  };
}
