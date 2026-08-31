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

const requireElement = createElementRequirement('survival modal views');
const ENDING_FADE_MS = 1_500;

export class SurvivalModalViews {
  readonly repairRoot: HTMLElement;
  readonly repairTitle: HTMLElement;
  readonly pauseRoot: HTMLElement;
  readonly resumeButton: HTMLButtonElement;
  readonly pauseRestartButton: HTMLButtonElement;
  readonly pauseMenuButton: HTMLButtonElement;
  readonly endingRoot: HTMLElement;
  readonly endingTitle: HTMLElement;
  readonly restartButton: HTMLButtonElement;

  onResume: () => void = () => undefined;
  onRestart: () => void = () => undefined;
  onReturnToMenu: () => void = () => undefined;
  onEndingReady: () => void = () => undefined;
  onRepairTarget: (instanceId: ItemInstanceId) => void = () => undefined;
  onRepairCancel: () => void = () => undefined;

  private readonly repairTargets: HTMLElement;
  private readonly endingCause: HTMLElement;
  private readonly endingStats: HTMLElement;
  private readonly endingPanel: HTMLElement;
  private readonly endingMenuButton: HTMLButtonElement;
  private readonly statisticsView: EndingStatisticsView;
  private endingFadeTimer: number | null = null;
  private repairBusy = false;
  private pauseRestartArmed = false;
  private endingActionIssued = false;
  private disposed = false;

  constructor() {
    const template = document.createElement('template');
    template.innerHTML = `
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
      <section class="survival-overlay pause-overlay cinematic-overlay scuba-popup-overlay" data-pause role="dialog" aria-modal="true" aria-hidden="true" aria-label="Survival paused" inert>
        <div class="cinematic-overlay__content scuba-popup-paper scuba-popup-panel">
          <p class="eyebrow ui-role-context">PAUSED</p>
          <h2 class="scuba-popup-title ui-role-display">Hold Fast</h2>
          <p class="ui-role-narrative">The sea will wait until you return.</p>
          <button type="button" class="primary-action salvage-action ui-role-context" data-resume aria-label="Resume">
            RESUME
          </button>
          <button type="button" class="secondary-action salvage-action ui-role-context" data-pause-restart aria-label="Start over">
            START OVER
          </button>
          <button type="button" class="secondary-action salvage-action ui-role-context" data-pause-menu aria-label="Back to menu">
            BACK TO MENU
          </button>
        </div>
      </section>
      <section class="survival-overlay ending-overlay cinematic-overlay scuba-popup-overlay" data-ending role="dialog" aria-modal="true" aria-hidden="true" aria-label="Journey ended" tabindex="-1" inert>
        <div class="cinematic-overlay__content scuba-popup-paper scuba-popup-panel">
          <h2 class="scuba-popup-title ui-role-display" data-ending-title tabindex="-1" role="alert"></h2>
          <p class="ending-cause ui-role-context" data-ending-cause></p>
          <p class="ending-stats ui-role-numeral" data-ending-stats></p>
          <button type="button" class="primary-action salvage-action ui-role-context" data-restart aria-label="Start from the ship">
            START FROM THE SHIP
          </button>
          <button type="button" class="primary-action salvage-action ui-role-context" data-ending-menu aria-label="Back to menu">
            BACK TO MENU
          </button>
        </div>
      </section>`;
    this.repairRoot = requireElement(template.content, '[data-repair-options]');
    this.pauseRoot = requireElement(template.content, '[data-pause]');
    this.endingRoot = requireElement(template.content, '[data-ending]');
    this.repairTitle = requireElement(this.repairRoot, '[data-repair-options-title]');
    this.repairTargets = requireElement(this.repairRoot, '[data-repair-targets]');
    this.resumeButton = requireElement(this.pauseRoot, '[data-resume]');
    this.pauseRestartButton = requireElement(this.pauseRoot, '[data-pause-restart]');
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
  }

  showRepairOptions(items: readonly Readonly<SurvivalItemState>[]): void {
    if (this.disposed) return;
    const targets = items.map((item) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'event-item repair-target ui-role-context';
      button.dataset.repairTarget = item.instanceId;
      button.textContent = `${ITEM_LABELS[item.type]} — BROKEN`;
      button.setAttribute(
        'aria-description',
        `Repair ${ITEM_LABELS[item.type]} with Duct Tape.`,
      );
      button.disabled = this.repairBusy;
      return button;
    });
    this.repairTargets.replaceChildren(...targets);
  }

  setRepairBusy(busy: boolean): void {
    if (this.disposed || this.repairBusy === busy) return;
    this.repairBusy = busy;
    this.repairTargets.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      button.disabled = busy;
    });
  }

  resetPauseRestartConfirmation(): void {
    if (this.disposed) return;
    this.pauseRestartArmed = false;
    this.pauseRestartButton.disabled = false;
    this.pauseMenuButton.disabled = false;
    this.resumeButton.disabled = false;
    this.pauseRestartButton.textContent = 'START OVER';
    this.pauseRestartButton.setAttribute('aria-label', 'Start over');
    this.pauseRestartButton.setAttribute(
      'aria-description',
      'Press once, then confirm to abandon this survival run.',
    );
  }

  showEnding(record: Exclude<EndingRecord, { id: 'dorothy' }>, snapshot: SurvivalSnapshot | null): void {
    if (this.disposed || this.endingRoot.dataset.ending) return;
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
      this.onRepairTarget(instanceId);
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
      this.resetPauseRestartConfirmation();
      this.onResume();
      return;
    }
    if (button.hasAttribute('data-pause-menu')) {
      button.disabled = true;
      this.resumeButton.disabled = true;
      this.pauseRestartButton.disabled = true;
      this.onReturnToMenu();
      return;
    }
    if (!button.hasAttribute('data-pause-restart')) return;
    if (!this.pauseRestartArmed) {
      this.pauseRestartArmed = true;
      button.textContent = 'CONFIRM START OVER';
      button.setAttribute('aria-label', 'Confirm start over');
      button.setAttribute('aria-description', 'This abandons the current survival run.');
      return;
    }
    button.disabled = true;
    this.resumeButton.disabled = true;
    this.pauseMenuButton.disabled = true;
    this.onRestart();
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
