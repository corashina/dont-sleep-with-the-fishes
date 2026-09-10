import { uiDynamic } from '../i18n/uiDynamicMessages';
import { onLanguageChange } from '../i18n/language';
import { refreshUiText } from './translatedText';
import { uiText } from '../i18n/uiMessages';
import { ITEM_LABELS, type ItemInstanceId } from '../game/ItemState';
import {
  endingCauseLine,
  endingSummary,
  endingTitle,
  type EndingRecord,
} from '../game/ending';
import type { SurvivalItemState } from '../survival/survivalTypes';
import type { SurvivalSnapshot } from '../survival/survivalSnapshot';
import { EndingStatisticsView } from './EndingStatisticsView';
import { survivalEndingStatistics } from './EndingStatisticsModel';
import { createElementRequirement } from './dom';
import { runCleanupSteps, throwCleanupFailure } from './UiCleanup';
import { itemThumbnailUrl } from './itemThumbnailManifest';

const requireElement = createElementRequirement('survival modal views');
const ENDING_FADE_MS = 1_500;

export class SurvivalModalViews {
  readonly repairRoot: HTMLElement;
  readonly repairTitle: HTMLElement;
  readonly pauseRoot: HTMLElement;
  readonly resumeButton: HTMLButtonElement;
  readonly pauseMenuButton: HTMLButtonElement;
  readonly endingRoot: HTMLElement;
  readonly endingTitle: HTMLElement;
  readonly restartButton: HTMLButtonElement;

  onResume: () => void = () => undefined;
  onRestart: () => void = () => undefined;
  onReturnToMenu: () => void = () => undefined;
  onEndingReady: () => void = () => undefined;
  onRepairTarget: (instanceId: ItemInstanceId) => void = () => undefined;
  onDiscardTarget: (instanceId: ItemInstanceId) => void = () => undefined;
  onRepairCancel: () => void = () => undefined;

  private readonly repairTargets: HTMLElement;
  private readonly repairUnavailable: HTMLElement;
  private readonly endingCause: HTMLElement;
  private readonly endingStats: HTMLElement;
  private readonly endingPanel: HTMLElement;
  private readonly endingMenuButton: HTMLButtonElement;
  private readonly statisticsView: EndingStatisticsView;
  private endingFadeTimer: number | null = null;
  private currentRepairItems: readonly Readonly<SurvivalItemState>[] = [];
  private currentRepairReason: () => string | null = () => null;
  private currentEnding: Exclude<EndingRecord, { id: 'dorothy' }> | null = null;
  private endingSnapshot: SurvivalSnapshot | null = null;
  private repairBusy = false;
  private endingActionIssued = false;
  private readonly unsubscribeLanguage: () => void;
  private refreshLanguage(): void {
    refreshUiText(this.repairRoot, this.pauseRoot, this.endingRoot);
    for (const item of this.currentRepairItems) {
      const repair = this.repairTargets.querySelector<HTMLButtonElement>(`[data-repair-target="${item.instanceId}"]`);
      const discard = this.repairTargets.querySelector<HTMLButtonElement>(`[data-discard-target="${item.instanceId}"]`);
      if (repair) this.labelRepairTarget(repair, item);
      if (discard) this.labelDiscardTarget(discard, item);
    }
    this.labelRepairAvailability();
    if (this.currentEnding !== null) {
      this.endingTitle.textContent = endingTitle(this.currentEnding);
      this.endingCause.textContent = endingCauseLine(this.currentEnding) ?? '';
      this.endingStats.textContent = endingSummary(this.currentEnding);
      this.statisticsView.render(survivalEndingStatistics(this.currentEnding, this.endingSnapshot));
    }
  }

  private disposed = false;

  constructor() {
    const template = document.createElement('template');
    template.innerHTML = `
      <section class="routine-dialog routine-dialog--repair" data-repair-options role="dialog" aria-modal="true" aria-hidden="true" data-ui-aria="repairTarget" aria-label="${uiText('repairTarget')}" inert>
        <div class="routine-dialog__card scuba-popup-paper">
          <h2 class="scuba-popup-title ui-role-display" data-repair-options-title tabindex="-1" data-ui-text="chooseRepair">${uiText('chooseRepair')}</h2>
          <p class="repair-unavailable ui-role-context" data-repair-unavailable hidden></p>
          <div class="repair-targets" data-repair-targets></div>
          <button type="button" class="primary-action salvage-action ui-role-context" data-repair-cancel data-ui-aria="cancelRepair" aria-label="${uiText('cancelRepair')}" data-ui-text="cancel">
            ${uiText('cancel')}
          </button>
        </div>
      </section>
      <section class="survival-overlay pause-overlay cinematic-overlay scuba-popup-overlay" data-pause role="dialog" aria-modal="true" aria-hidden="true" data-ui-aria="paused" aria-label="${uiText('paused')}" inert>
        <div class="cinematic-overlay__content scuba-popup-paper scuba-popup-panel">
          <h2 class="scuba-popup-title ui-role-display" data-ui-text="paused">${uiText('paused')}</h2>
          <button type="button" class="primary-action salvage-action ui-role-context" data-resume data-ui-aria="resume" aria-label="${uiText('resume')}" data-ui-text="resumeUpper">
            ${uiText('resumeUpper')}
          </button>
          <button type="button" class="primary-action salvage-action ui-role-context" data-open-settings data-ui-aria="settings" aria-label="${uiText('settings')}" data-ui-text="settingsUpper">
            ${uiText('settingsUpper')}
          </button>
          <button type="button" class="primary-action salvage-action ui-role-context" data-pause-menu data-ui-aria="backMenu" aria-label="${uiText('backMenu')}" data-ui-text="backMenuUpper">
            ${uiText('backMenuUpper')}
          </button>
        </div>
      </section>
      <section class="survival-overlay ending-overlay cinematic-overlay scuba-popup-overlay" data-ending role="dialog" aria-modal="true" aria-hidden="true" data-ui-aria="journeyEnded" aria-label="${uiText('journeyEnded')}" tabindex="-1" inert>
        <div class="cinematic-overlay__content scuba-popup-paper scuba-popup-panel">
          <h2 class="scuba-popup-title ui-role-display" data-ending-title tabindex="-1" role="alert"></h2>
          <p class="ending-cause ui-role-context" data-ending-cause></p>
          <p class="ending-stats ui-role-numeral" data-ending-stats></p>
          <button type="button" class="primary-action salvage-action ui-role-context" data-restart data-ui-aria="startShip" aria-label="${uiText('startShip')}" data-ui-text="startShipUpper">
            ${uiText('startShipUpper')}
          </button>
          <button type="button" class="primary-action salvage-action ui-role-context" data-ending-menu data-ui-aria="backMenu" aria-label="${uiText('backMenu')}" data-ui-text="backMenuUpper">
            ${uiText('backMenuUpper')}
          </button>
        </div>
      </section>`;
    this.repairRoot = requireElement(template.content, '[data-repair-options]');
    this.pauseRoot = requireElement(template.content, '[data-pause]');
    this.endingRoot = requireElement(template.content, '[data-ending]');
    this.repairTitle = requireElement(this.repairRoot, '[data-repair-options-title]');
    this.repairUnavailable = requireElement(this.repairRoot, '[data-repair-unavailable]');
    this.repairTargets = requireElement(this.repairRoot, '[data-repair-targets]');
    this.resumeButton = requireElement(this.pauseRoot, '[data-resume]');
    this.pauseMenuButton = requireElement(this.pauseRoot, '[data-pause-menu]');
    this.endingTitle = requireElement(this.endingRoot, '[data-ending-title]');
    this.endingCause = requireElement(this.endingRoot, '[data-ending-cause]');
    this.endingStats = requireElement(this.endingRoot, '[data-ending-stats]');
    this.restartButton = requireElement(this.endingRoot, '[data-restart]');
    this.endingPanel = requireElement(this.endingRoot, '.cinematic-overlay__content');
    this.endingMenuButton = requireElement(this.endingRoot, '[data-ending-menu]');
    this.statisticsView = new EndingStatisticsView(this.endingRoot, this.endingPanel);
    this.endingPanel.insertBefore(this.statisticsView.button, this.endingMenuButton);
    this.endingRoot.style.setProperty('--ending-fade-duration', `${ENDING_FADE_MS}ms`);
    this.repairRoot.addEventListener('click', this.handleRepairClick);
    this.pauseRoot.addEventListener('click', this.handlePauseClick);
    this.endingRoot.addEventListener('click', this.handleEndingClick);
    this.endingRoot.addEventListener('transitionend', this.handleEndingTransitionEnd);
    this.unsubscribeLanguage = onLanguageChange(() => this.refreshLanguage());
    this.refreshLanguage();
  }

  showRepairOptions(
    items: readonly Readonly<SurvivalItemState>[],
    repairReason: () => string | null = () => null,
    showDiscard = true,
  ): void {
    if (this.disposed) return;
    this.currentRepairItems = items;
    this.currentRepairReason = repairReason;
    this.labelRepairAvailability();
    const targets = items.map((item) => {
      const row = document.createElement('div');
      row.className = 'repair-target-row';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'weight-circle is-filled dive-result__reward repair-target';
      button.dataset.repairTarget = item.instanceId;
      button.dataset.itemType = item.type;
      this.labelRepairTarget(button, item);
      const thumbnail = document.createElement('img');
      thumbnail.className = 'weight-circle__thumbnail';
      thumbnail.src = itemThumbnailUrl(item.type);
      thumbnail.alt = '';
      thumbnail.decoding = 'async';
      thumbnail.draggable = false;
      button.append(thumbnail);
      button.disabled = this.repairBusy;
      const repairLabel = document.createElement('span');
      repairLabel.className = 'repair-target__label ui-role-context';
      repairLabel.textContent = uiText('repair');
      repairLabel.dataset.uiText = 'repair';
      repairLabel.setAttribute('aria-hidden', 'true');
      button.append(repairLabel);
      row.append(button);
      if (showDiscard) {
        const discard = document.createElement('button');
        discard.type = 'button';
        discard.className = 'primary-action salvage-action repair-target__discard ui-role-context';
        discard.dataset.discardTarget = item.instanceId;
        discard.dataset.itemType = item.type;
        discard.textContent = uiText('discardItem');
        this.labelDiscardTarget(discard, item);
        discard.disabled = this.repairBusy;
        row.append(discard);
      } else {
        row.classList.add('repair-target-row--repair-only');
      }
      return row;
    });
    this.repairTargets.replaceChildren(...targets);
  }

  private labelRepairTarget(button: HTMLButtonElement, item: Readonly<SurvivalItemState>): void {
    const label = uiDynamic('brokenItem', ITEM_LABELS[item.type]);
    button.title = label;
    button.setAttribute('aria-label', label);
    const reason = this.currentRepairReason();
    button.setAttribute('aria-disabled', String(reason !== null));
    button.setAttribute('aria-description', reason ?? uiDynamic('repairItemHelp', ITEM_LABELS[item.type]));
  }

  private labelDiscardTarget(button: HTMLButtonElement, item: Readonly<SurvivalItemState>): void {
    button.textContent = uiText('discardItem');
    button.setAttribute('aria-label', `${uiText('discardItem')} — ${ITEM_LABELS[item.type]}`);
    button.setAttribute('aria-description', uiDynamic('discardItemHelp', ITEM_LABELS[item.type]));
  }

  private labelRepairAvailability(): void {
    const reason = this.currentRepairReason();
    this.repairUnavailable.hidden = reason === null;
    this.repairUnavailable.textContent = reason === null ? '' : uiDynamic('repairUnavailable', reason);
  }

  setRepairBusy(busy: boolean): void {
    if (this.disposed || this.repairBusy === busy) return;
    this.repairBusy = busy;
    this.repairTargets.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      button.disabled = busy;
    });
  }

  resetPauseActions(): void {
    if (this.disposed) return;
    this.pauseMenuButton.disabled = false;
    this.resumeButton.disabled = false;
  }

  showEnding(record: Exclude<EndingRecord, { id: 'dorothy' }>, snapshot: SurvivalSnapshot | null): void {
    if (this.disposed || this.endingRoot.dataset.ending) return;
    this.currentEnding = record;
    this.endingSnapshot = snapshot;
    this.statisticsView.render(survivalEndingStatistics(record, snapshot));
    this.endingTitle.textContent = endingTitle(record);
    this.endingCause.textContent = endingCauseLine(record) ?? '';
    this.endingCause.hidden = this.endingCause.textContent.length === 0;
    this.endingStats.textContent = endingSummary(record);
    this.endingRoot.dataset.ending = record.id;
    this.endingActionIssued = false;
    this.restartButton.disabled = false;
    this.endingMenuButton.disabled = false;
    if (record.id === 'rescue') return;
    this.endingPanel.hidden = true;
    this.endingRoot.classList.add('is-fading');
    // Commit the transparent state before activation, including ending previews.
    this.endingRoot.getBoundingClientRect();
    this.endingFadeTimer = window.setTimeout(this.finishEndingFade, ENDING_FADE_MS);
  }

  endingInitialFocus(): HTMLElement {
    if (!this.statisticsView.root.hidden) return this.statisticsView.title;
    return this.endingPanel.hidden ? this.endingRoot : this.endingTitle;
  }

  private readonly handleEndingTransitionEnd = (event: TransitionEvent): void => {
    if (event.target === this.endingRoot && event.propertyName === 'opacity') this.finishEndingFade();
  };

  private readonly finishEndingFade = (): void => {
    if (this.disposed || this.endingFadeTimer === null) return;
    window.clearTimeout(this.endingFadeTimer);
    this.endingFadeTimer = null;
    this.endingRoot.classList.remove('is-fading');
    this.endingPanel.hidden = false;
    this.onEndingReady();
  };

  private cancelEndingFade(): void {
    if (this.endingFadeTimer === null) return;
    window.clearTimeout(this.endingFadeTimer);
    this.endingFadeTimer = null;
  }

  beginDispose(): boolean {
    if (this.disposed) return false;
    this.disposed = true;
    this.unsubscribeLanguage();
    this.cancelEndingFade();
    this.statisticsView.dispose();
    return true;
  }

  removeListenersForDispose(): void {
    throwCleanupFailure(runCleanupSteps([
      () => this.repairRoot.removeEventListener('click', this.handleRepairClick),
      () => this.pauseRoot.removeEventListener('click', this.handlePauseClick),
      () => this.endingRoot.removeEventListener('click', this.handleEndingClick),
      () => this.endingRoot.removeEventListener('transitionend', this.handleEndingTransitionEnd),
    ]));
  }

  resetCallbacksForDispose(): void {
    throwCleanupFailure(runCleanupSteps([
      () => { this.onResume = () => undefined; },
      () => { this.onRestart = () => undefined; },
      () => { this.onReturnToMenu = () => undefined; },
      () => { this.onEndingReady = () => undefined; },
      () => { this.onRepairTarget = () => undefined; },
      () => { this.onDiscardTarget = () => undefined; },
      () => { this.onRepairCancel = () => undefined; },
    ]));
  }

  dispose(): void {
    if (!this.beginDispose()) return;
    throwCleanupFailure(runCleanupSteps([
      () => this.removeListenersForDispose(),
      () => this.resetCallbacksForDispose(),
    ]));
  }

  private canUseRoot(root: HTMLElement): boolean {
    return !this.disposed
      && !root.hidden
      && !root.hasAttribute('inert')
      && root.getAttribute('aria-hidden') !== 'true';
  }

  private readonly handleRepairClick = (event: MouseEvent): void => {
    if (!this.canUseRoot(this.repairRoot)) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>('button');
    if (button === null || button.disabled || !this.repairRoot.contains(button)) return;
    const instanceId = button.dataset.repairTarget as ItemInstanceId | undefined;
    if (instanceId !== undefined && this.repairTargets.contains(button)) {
      if (button.getAttribute('aria-disabled') === 'true') return;
      this.onRepairTarget(instanceId);
    } else if (button.dataset.discardTarget !== undefined && this.repairTargets.contains(button)) {
      this.onDiscardTarget(button.dataset.discardTarget as ItemInstanceId);
    } else if (button.hasAttribute('data-repair-cancel')) {
      this.onRepairCancel();
    }
  };

  private readonly handlePauseClick = (event: MouseEvent): void => {
    if (!this.canUseRoot(this.pauseRoot)) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>('button');
    if (button === null || button.disabled || !this.pauseRoot.contains(button)) return;
    if (button.hasAttribute('data-resume')) {
      this.resetPauseActions();
      this.onResume();
      return;
    }
    if (button.hasAttribute('data-pause-menu')) {
      button.disabled = true;
      this.resumeButton.disabled = true;
      this.onReturnToMenu();
      return;
    }
  };

  private readonly handleEndingClick = (event: MouseEvent): void => {
    if (!this.canUseRoot(this.endingRoot) || this.endingPanel.hidden || this.endingActionIssued) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>('[data-restart], [data-ending-menu]');
    if (button === null || button.disabled || !this.endingRoot.contains(button)) return;
    this.endingActionIssued = true;
    this.statisticsView.button.disabled = true;
    this.restartButton.disabled = true;
    this.endingMenuButton.disabled = true;
    if (button === this.endingMenuButton) this.onReturnToMenu();
    else this.onRestart();
  };
}
