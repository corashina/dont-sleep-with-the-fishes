import { ITEM_LABELS, type ItemInstanceId } from '../game/ItemState';
import type {
  SurvivalEndingReason,
  SurvivalItemState,
  SurvivalState,
} from '../survival/survivalTypes';
import { createElementRequirement } from './dom';
import { runCleanupSteps, throwCleanupFailure } from './UiCleanup';

type TerminalState = Extract<SurvivalState, 'rescued' | 'dead' | 'sunk'>;

const requireElement = createElementRequirement('survival modal views');

export class SurvivalModalViews {
  readonly repairRoot: HTMLElement;
  readonly repairTitle: HTMLElement;
  readonly pauseRoot: HTMLElement;
  readonly resumeButton: HTMLButtonElement;
  readonly endingRoot: HTMLElement;
  readonly endingTitle: HTMLElement;
  readonly restartButton: HTMLButtonElement;

  onResume: () => void = () => undefined;
  onRestart: () => void = () => undefined;
  onRepairTarget: (instanceId: ItemInstanceId) => void = () => undefined;
  onRepairCancel: () => void = () => undefined;

  private readonly repairTargets: HTMLElement;
  private repairBusy = false;
  private restartIssued = false;
  private lastEndingTitle: string | null = null;
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
        </div>
      </section>
      <section class="survival-overlay ending-overlay cinematic-overlay scuba-popup-overlay" data-ending role="dialog" aria-modal="true" aria-hidden="true" aria-label="Journey ended" inert>
        <div class="cinematic-overlay__content scuba-popup-paper scuba-popup-panel">
          <h2 class="scuba-popup-title ui-role-display" data-ending-title tabindex="-1" role="alert"></h2>
          <button type="button" class="primary-action salvage-action ui-role-context" data-restart aria-label="Start from the ship">
            START FROM THE SHIP
          </button>
        </div>
      </section>`;
    this.repairRoot = requireElement(template.content, '[data-repair-options]');
    this.pauseRoot = requireElement(template.content, '[data-pause]');
    this.endingRoot = requireElement(template.content, '[data-ending]');
    this.repairTitle = requireElement(this.repairRoot, '[data-repair-options-title]');
    this.repairTargets = requireElement(this.repairRoot, '[data-repair-targets]');
    this.resumeButton = requireElement(this.pauseRoot, '[data-resume]');
    this.endingTitle = requireElement(this.endingRoot, '[data-ending-title]');
    this.restartButton = requireElement(this.endingRoot, '[data-restart]');
    this.repairRoot.addEventListener('click', this.handleRepairClick);
    this.pauseRoot.addEventListener('click', this.handlePauseClick);
    this.endingRoot.addEventListener('click', this.handleEndingClick);
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

  showEnding(state: TerminalState, reason: SurvivalEndingReason): void {
    if (this.disposed) return;
    const title = reason === 'kidnapped'
      ? 'Taken in the dark.'
      : state === 'rescued'
        ? 'Rescue found you.'
        : state === 'dead'
          ? 'The sea outlasted you.'
          : 'Boat is gone.';
    if (title !== this.lastEndingTitle) {
      this.lastEndingTitle = title;
      this.endingTitle.textContent = title;
    }
    this.endingRoot.dataset.ending = state;
    this.restartIssued = false;
    this.restartButton.disabled = false;
  }

  beginDispose(): boolean {
    if (this.disposed) return false;
    this.disposed = true;
    return true;
  }

  removeListenersForDispose(): void {
    throwCleanupFailure(runCleanupSteps([
      () => this.repairRoot.removeEventListener('click', this.handleRepairClick),
      () => this.pauseRoot.removeEventListener('click', this.handlePauseClick),
      () => this.endingRoot.removeEventListener('click', this.handleEndingClick),
    ]));
  }

  resetCallbacksForDispose(): void {
    throwCleanupFailure(runCleanupSteps([
      () => { this.onResume = () => undefined; },
      () => { this.onRestart = () => undefined; },
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
    const button = target.closest<HTMLButtonElement>('[data-resume]');
    if (button !== null && !button.disabled && this.pauseRoot.contains(button)) this.onResume();
  };

  private readonly handleEndingClick = (event: MouseEvent): void => {
    if (!this.canUseRoot(this.endingRoot) || this.restartIssued) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>('[data-restart]');
    if (button === null || button.disabled || !this.endingRoot.contains(button)) return;
    this.restartIssued = true;
    button.disabled = true;
    this.onRestart();
  };
}
